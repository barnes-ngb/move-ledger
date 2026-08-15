import { useEffect, useState } from "react";
import type { PhotoView } from "../../hooks/usePhotos";
import { deletePhoto, writeInBackground } from "../../repositories";
import { Confirm, ErrorLine } from "../kit";

/**
 * A photo at the size of the screen. The strip is for knowing a box has
 * photos; this is for reading what is in one, which at 96px is not possible.
 *
 * The image is fitted whole rather than cropped, because the thing a person is
 * trying to read is as likely to be at the edge of the frame as the middle.
 *
 * Sourced the way the strip sources it: the local blob first, the download URL
 * only when there is no blob left. A photo taken thirty seconds ago in a
 * basement has no download URL and has to open anyway.
 *
 * Deleting is offered here rather than on the strip, because at 96px a person
 * cannot tell which photo they are about to lose.
 */
export function PhotoViewer({
  moveId,
  uid,
  photos,
  startIndex,
  onClose,
}: {
  moveId: string;
  uid: string;
  photos: readonly PhotoView[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deleting the last photo leaves nothing to look at. The subscription this
  // reads from shortens as soon as the local cache does, so this is the same
  // tick the person pressed in.
  const empty = photos.length === 0;
  useEffect(() => {
    if (empty) onClose();
  }, [empty, onClose]);

  const view = photos[Math.min(index, photos.length - 1)];
  if (!view) return null;

  function remove() {
    setConfirming(false);
    setError(null);
    try {
      writeInBackground(deletePhoto(moveId, view!.photo, uid).written, () =>
        setError("Deleted on this phone. The other phone has not caught up yet.")
      );
    } catch {
      setError("Could not delete that photo.");
    }
  }

  const src = view.localUrl ?? view.photo.downloadUrl;
  const atStart = index === 0;
  const atEnd = index >= photos.length - 1;

  return (
    // The backdrop closes on a tap. The controls and the image sit in their own
    // element and stop the tap, so hitting Next does not also close the viewer.
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-slate-400">
          {index + 1} of {photos.length}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="min-h-14 min-w-14 text-3xl text-slate-200"
          aria-label="Close"
        >
          {"✕"}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        {src ? (
          <img
            src={src}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="px-6 text-center text-slate-400">
            This photo has not finished uploading. It is safe on the phone that took it.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIndex((i) => Math.max(0, i - 1));
          }}
          disabled={atStart}
          className="min-h-14 flex-1 rounded-2xl bg-slate-800 text-lg font-semibold text-slate-100 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIndex((i) => Math.min(photos.length - 1, i + 1));
          }}
          disabled={atEnd}
          className="min-h-14 flex-1 rounded-2xl bg-slate-800 text-lg font-semibold text-slate-100 disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <div className="px-4 pb-3" onClick={(e) => e.stopPropagation()}>
        <ErrorLine message={error} />
        <button
          onClick={() => setConfirming(true)}
          className="min-h-14 w-full text-lg text-rose-300 underline"
        >
          Delete this photo
        </button>
      </div>

      {confirming ? (
        <Confirm
          title="Delete this photo?"
          detail="It goes from this phone and from the other one. There is no undo."
          confirmLabel="Delete this photo"
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
