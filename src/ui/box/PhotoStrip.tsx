import { useRef, useState } from "react";
import type { ContainerPhoto } from "../../domain";
import type { PhotoView } from "../../hooks/usePhotos";
import { capturePhoto, type PhotoKind } from "../../photos/capture";
import { retryUpload, writeInBackground } from "../../repositories";
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

  /**
   * Doc 06's retry action. The queue gives up after five attempts and the
   * marker is where a person finds out, so the marker is what they press.
   */
  function retry(photo: ContainerPhoto) {
    setError(null);
    try {
      writeInBackground(retryUpload(moveId, photo).written, () =>
        setError("Still cannot send that photo. It is safe on this phone.")
      );
    } catch {
      setError("Could not send that photo again.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {photos.map((v, i) => {
          const src = v.localUrl ?? v.photo.downloadUrl;
          return (
            // A tile rather than one button, because the retry marker is a
            // control of its own and a button inside a button is not markup a
            // browser will keep.
            <div key={v.photo.id} className="relative shrink-0">
              <button onClick={() => setViewing(i)} aria-label={`Open photo ${i + 1}`}>
                {src ? (
                  <img src={src} alt="" className="size-24 rounded-xl object-cover" />
                ) : (
                  // Bytes on the other phone. Doc 04 section 9: this is real
                  // data that has not been copied here yet, so the tile says
                  // that rather than showing a blank that reads as broken.
                  <div className="flex size-24 items-center justify-center rounded-xl bg-slate-800 p-2 text-center text-xs leading-snug text-slate-400">
                    Not on this phone yet
                  </div>
                )}
              </button>
              {v.photo.uploadState === "failed" ? (
                <button
                  onClick={() => retry(v.photo)}
                  aria-label={`Send photo ${i + 1} again`}
                  className="absolute inset-x-0 bottom-0 rounded-b-xl bg-amber-500/80 py-1 text-center text-xs font-semibold text-slate-950"
                >
                  Send again
                </button>
              ) : null}
            </div>
          );
        })}

        {/* Disabled while a photo is being resized and written, which is the
            one write on this screen long enough to see. It says which,
            because a dimmed tile with a plus on it says only "no". */}
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex size-24 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50"
          aria-label={busy ? "Adding a photo" : "Add a photo"}
        >
          {busy ? <span className="px-2 text-center text-sm leading-snug">Adding</span> : <span className="text-4xl">+</span>}
        </button>
      </div>

      {/* No `capture` attribute. It forces the camera on Android and hides the
          library, and a photo of a box that was taken an hour ago is still a
          photo of that box. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        onChange={(e) => void onFile(e)}
        className="hidden"
      />

      <ErrorLine message={error} />

      {viewing !== null ? (
        <PhotoViewer
          moveId={moveId}
          uid={uid}
          photos={photos}
          startIndex={viewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
