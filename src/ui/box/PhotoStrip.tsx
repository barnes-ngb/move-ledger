import { useRef, useState } from "react";
import type { ContainerPhoto } from "../../domain";
import type { PhotoView } from "../../hooks/usePhotos";
import { capturePhoto, type PhotoKind } from "../../photos/capture";
import { retryUpload, writeInBackground } from "../../repositories";
import { Button, ErrorLine } from "../kit";
import { PhotoViewer } from "./PhotoViewer";
import { useUnloadable } from "./unloadable";

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
  /** Null when idle, otherwise the control being waited on and how far it has got. */
  const [adding, setAdding] = useState<{ source: Source; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const unloadable = useUnloadable();

  /**
   * Every file the picker handed back, one after another. The library can
   * hand back several at once; the camera hands back one.
   *
   * One at a time rather than all at once, because each one is resized on a
   * canvas and a phone has one of those worth using. Each gets its own
   * timestamp a millisecond after the last, so they list in the order chosen
   * rather than in whichever order the resizes finished.
   */
  async function onFile(e: React.ChangeEvent<HTMLInputElement>, source: Source) {
    const files = Array.from(e.target.files ?? []);
    // Reset immediately so the same file can be chosen twice in a row.
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    const base = Date.now();
    let failed = 0;
    for (const [i, file] of files.entries()) {
      setAdding({ source, done: i + 1, total: files.length });
      try {
        await capturePhoto({
          file,
          moveId,
          containerId,
          actorUid: uid,
          kind,
          createdAt: new Date(base + i).toISOString(),
        });
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) {
      setError(
        files.length === 1
          ? "Could not add that photo. Try again."
          : `Could not add ${failed} of those ${files.length} photos. Try those again.`
      );
    }
    setAdding(null);
  }

  /** What the control that was pressed reads while it works. */
  function addingLabel(source: Source, idle: string): string {
    if (adding?.source !== source) return idle;
    return adding.total > 1 ? `Adding ${adding.done} of ${adding.total}` : "Adding";
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
              // A tile rather than one button, because the retry control is a
              // control of its own and a button inside a button is not markup a
              // browser will keep.
              <div key={v.photo.id} className="flex w-24 shrink-0 flex-col gap-2">
                <button
                  onClick={() => {
                    // Opening a photo is also how one that would not load is
                    // tried again, here and in the viewer.
                    if (src) unloadable.retry(src);
                    setViewing(i);
                  }}
                  aria-label={`Open photo ${i + 1}`}
                >
                  {src && !unloadable.failed(src) ? (
                    <img
                      src={src}
                      alt=""
                      className="size-24 rounded-xl object-cover"
                      // Uploaded, never viewed on this phone, and no signal: the
                      // download URL cannot be reached. A tile that says so,
                      // never a broken image.
                      onError={() => unloadable.mark(src)}
                    />
                  ) : (
                    // Doc 04 section 9: this is real data that has not been
                    // copied here, so the tile says that rather than showing a
                    // blank that reads as broken.
                    <div className="flex size-24 items-center justify-center rounded-xl bg-slate-800 p-2 text-center text-xs leading-snug text-slate-400">
                      {!src
                        ? "Not on this phone yet"
                        : unloadable.online
                          ? "Could not load. Tap to try again"
                          : "Not available offline"}
                    </div>
                  )}
                </button>
                {/* Only where the bytes are. A photo taken on the other phone
                    has its bytes there, and pressing this here would do
                    nothing anyone could see. */}
                {v.photo.uploadState === "failed" && v.localUrl ? (
                  <button
                    onClick={() => retry(v.photo)}
                    aria-label={`Send photo ${i + 1} again`}
                    className="min-h-14 rounded-xl bg-amber-500/80 px-1 text-center text-sm font-semibold text-slate-950"
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
            {addingLabel("camera", "Take a photo")}
          </Button>
        </div>
        <div className="flex-1">
          <Button onClick={() => libraryInput.current?.click()} disabled={adding !== null} tone="quiet">
            {addingLabel("library", "Choose a photo")}
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
      {/* The library may hand back several at once; the camera takes one. */}
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        multiple
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
