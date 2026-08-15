import { useRef, useState } from "react";
import type { PhotoView } from "../../hooks/usePhotos";
import { capturePhoto, type PhotoKind } from "../../photos/capture";
import { ErrorLine } from "../kit";
import { PhotoViewer } from "./PhotoViewer";

/**
 * Photos are not gated on status. A box gains photos while it is being
 * filled, layer by layer, and again at unload if something arrives crushed.
 * There is no moment after which a box stops accepting them.
 */
export function PhotoStrip({
  moveId,
  containerId,
  uid,
  photos,
  kind = "contents",
}: {
  moveId: string;
  containerId: string;
  uid: string;
  photos: PhotoView[];
  kind?: PhotoKind;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately so the same file can be chosen twice in a row.
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await capturePhoto({ file, moveId, containerId, actorUid: uid, kind });
    } catch {
      setError("Could not add that photo. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {photos.map((v, i) => {
          const src = v.localUrl ?? v.photo.downloadUrl;
          return (
            <button
              key={v.photo.id}
              onClick={() => setViewing(i)}
              className="relative shrink-0"
              aria-label={`Open photo ${i + 1}`}
            >
              {src ? (
                <img src={src} alt="" className="size-24 rounded-xl object-cover" />
              ) : (
                <div className="size-24 rounded-xl bg-slate-800" />
              )}
              {v.photo.uploadState === "failed" ? (
                <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-amber-500/80 text-center text-xs text-slate-950">
                  Not sent yet
                </span>
              ) : null}
            </button>
          );
        })}

        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex size-24 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-4xl text-slate-400 disabled:opacity-50"
          aria-label="Add a photo"
        >
          +
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void onFile(e)}
        className="hidden"
      />

      <ErrorLine message={error} />

      {viewing !== null ? (
        <PhotoViewer photos={photos} startIndex={viewing} onClose={() => setViewing(null)} />
      ) : null}
    </div>
  );
}
