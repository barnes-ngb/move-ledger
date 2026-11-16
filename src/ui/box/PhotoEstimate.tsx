import { useState } from "react";
import { cuFtOf } from "../../domain";
import { useOnline } from "../../hooks/useOnline";
import { estimateFurniture, type FurnitureEstimate } from "../../lib/functions";
import { Button, ErrorLine } from "../kit";

/**
 * Size and weight of a piece, estimated from its photos. ADR-0009.
 *
 * A suggestion and nothing more: the function writes nothing, this shows what
 * it said, and only "Use these" puts it into the fields, where the weight is
 * marked as a guess. A tape measure in a photo is what makes the size worth
 * having, so the screen asks for one before the first photo.
 */
export function PhotoEstimate({
  moveId,
  containerId,
  uploadedPhotos,
  onUse,
}: {
  moveId: string;
  containerId: string;
  /** Photos of this piece that have reached the server. The function can only see those. */
  uploadedPhotos: number;
  onUse: (estimate: FurnitureEstimate) => void;
}) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<FurnitureEstimate | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setMessage(null);
    setEstimate(null);
    try {
      const { data } = await estimateFurniture({ moveId, containerId });
      if (data.estimate) setEstimate(data.estimate);
      else setMessage("The photos do not show a piece of furniture. Fill in the figures by hand.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not estimate from the photos.");
    } finally {
      setBusy(false);
    }
  }

  if (estimate) {
    const e = estimate;
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-slate-800 p-4">
        <p className="text-sm text-slate-400">
          From {e.photos === 1 ? "the photo" : `${e.photos} photos`}, a guess
        </p>
        <p className="text-lg text-slate-100">{e.name}</p>
        <p className="text-slate-200">
          About {e.widthIn} × {e.depthIn} × {e.heightIn} in, {cuFtOf({ width: e.widthIn, depth: e.depthIn, height: e.heightIn })} cu ft
        </p>
        <p className="text-slate-200">
          {e.weightLowLb} to {e.weightHighLb} lb, likely {e.weightLb}
        </p>
        <p className="text-sm text-slate-400">
          {e.scale === "tape"
            ? "Sized from the tape measure."
            : e.scale === "surroundings"
              ? "Sized from what is around it. A tape measure in the photo would do better."
              : "Nothing in the photo to size it from. Measure it if you can."}
          {e.note ? ` ${e.note}` : ""}
        </p>
        <Button
          onClick={() => {
            onUse(e);
            setEstimate(null);
          }}
        >
          Use these
        </Button>
        <Button onClick={() => setEstimate(null)} tone="quiet">
          Not this
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {uploadedPhotos === 0 ? (
        <p className="text-sm text-slate-400">
          Take a photo of the piece with a tape measure along it, and wait for it to upload, to estimate from it.
        </p>
      ) : !online ? (
        <p className="text-sm text-slate-400">Estimating from a photo needs a connection.</p>
      ) : null}
      <Button onClick={() => void ask()} disabled={busy || uploadedPhotos === 0 || !online} tone="quiet">
        {busy ? "Looking at the photos" : "Estimate from photo"}
      </Button>
      <ErrorLine message={message} />
    </div>
  );
}
