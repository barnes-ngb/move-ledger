import { useRef, useState } from "react";
import type { ContainerPhoto } from "../../domain";
import type { PhotoView } from "../../hooks/usePhotos";
import { capturePhoto, type PhotoKind } from "../../photos/capture";
import { retryUpload, writeInBackground } from "../../repositories";
import { Button, ErrorLine } from "../kit";
import { PhotoViewer } from "./PhotoViewer";

/** Which control was pressed. Both end in the same `capturePhoto` call. */
type Source = "camera" | "library";

/**
 * Photos are not gated on status. A box gains photos while it is being
 * filled, layer by layer, and again at unload if something arrives crushed.
 * There is no moment after which a box stops accepting them.
 *
 * Two controls rather than one, because `capture` is a hint and browsers read
 * it differently. With the attribute, Android opened the camera and hid the
 * library. Without it, Android offered files and hid the camera. Neither is
 * something to argue with from here, so the person picks which one they meant
 * and each control carries the input that does that one job.
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
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  /** Null when idle, otherwise the control being waited on. */
  const [adding, setAdding] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>, source: Source) {
    const file = e.target.files?.[0];
    // Reset immediately so the same file can be chosen twice in a row.
    e.target.value = "";
    if (!file) return;
    setAdding(source);
    setError(null);
    try {
      await capturePhoto({ file, moveId, containerId, actorUid: uid, kind });
    } catch {
      setError("Could not add that photo. Try again.");
    }
    setAdding(null);
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
      {photos.length > 0 ? (
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
        </div>
      ) : null}

      {/* Both are 56px, and the one that was pressed says what it is doing
          while the photo is resized and written, which is the one write on
          this screen long enough to see. */}
      <div className="flex gap-3">
        <div className="flex-1">
          <Button onClick={() => cameraInput.current?.click()} disabled={adding !== null}>
            {adding === "camera" ? "Adding" : "Take a photo"}
          </Button>
        </div>
        <div className="flex-1">
          <Button onClick={() => libraryInput.current?.click()} disabled={adding !== null} tone="quiet">
            {adding === "library" ? "Adding" : "Choose a photo"}
          </Button>
        </div>
      </div>

      {/* One input per control. `capture` is a hint rather than a contract, so
          the app stops asking a browser to offer both and asks each input for
          the one thing it is for. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take a photo"
        onChange={(e) => void onFile(e, "camera")}
        className="hidden"
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        aria-label="Choose a photo"
        onChange={(e) => void onFile(e, "library")}
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
