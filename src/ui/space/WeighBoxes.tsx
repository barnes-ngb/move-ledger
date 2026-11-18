import { useRef, useState } from "react";
import type { Container, ContainerSize, Zone } from "../../domain";
import { isFurniture, isVoided } from "../../domain";
import { setContainerSize, setContainerWeight, writeInBackground } from "../../repositories";
import { usePhotos } from "../../hooks/usePhotos";
import { BackBar, Button, ErrorLine, Screen } from "../kit";
import { NumberField, SizeChips } from "../box/SizeChips";
import { WEIGHT_HELP, parseWeight } from "../box/numberInput";

const SAVED_HERE = "This change is saved on your phone. It has not reached the other phone yet.";

/**
 * One box after another on a bathroom scale. The repeat screen, in the shape
 * of Move Day: one operation performed many times, with the field already
 * focused so the next number goes straight in.
 *
 * Nothing here waits on the server. The write is local first, and the box is
 * moved past at once rather than when the subscription catches up, so a slow
 * snapshot never shows the same box twice. A skipped box is passed over for
 * as long as this screen is open and comes round again the next time.
 */
export function WeighBoxes({
  moveId,
  containers,
  zones,
  uid,
  onBack,
}: {
  moveId: string;
  containers: readonly Container[];
  zones: readonly Zone[];
  uid: string;
  onBack: () => void;
}) {
  // Weighed or skipped on this screen. Both leave the queue here.
  const [passed, setPassed] = useState<ReadonlySet<string>>(new Set());
  // A size tapped on this screen, held so the chips show it before the
  // subscription does, and so the weight write that follows carries it.
  const [sizeHere, setSizeHere] = useState<ReadonlyMap<string, ContainerSize | null>>(new Map());
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  const queue = containers
    // Furniture never comes up here: it does not go on a bathroom scale, and
    // its weight comes from the list or a photo on its own screen. APPLY-23.
    .filter((c) => !isVoided(c) && !isFurniture(c) && c.weightLb === undefined && !passed.has(c.id))
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const subscribed = queue[0];
  const current = subscribed ? withSize(subscribed, sizeHere) : undefined;

  // The typed weight belongs to the box it was typed for. Another phone can
  // weigh or void the box on screen, the subscription then puts the next box
  // here, and a draft carried across would be saved onto the wrong one.
  const [draftFor, setDraftFor] = useState<string | undefined>(current?.id);
  if (current?.id !== draftFor) {
    setDraftFor(current?.id);
    setWeight("");
  }

  if (!current) {
    return (
      <Screen title="Weigh boxes" onBack={onBack}>
        <p className="text-slate-300">Every box has a weight.</p>
        <ErrorLine message={error} />
        <Button onClick={onBack}>Back to Space and weight</Button>
      </Screen>
    );
  }

  function advance(id: string) {
    setPassed((p) => new Set(p).add(id));
    setWeight("");
    setError(null);
    field.current?.focus();
  }

  function save(box: Container) {
    const parsed = parseWeight(weight);
    if (parsed.kind !== "value") {
      setError(WEIGHT_HELP);
      return;
    }
    try {
      const { written } = setContainerWeight(moveId, box, parsed.value, zones, uid);
      // A refused write is rolled back in the cache, so the box is put back in
      // the queue to come round again, and the screen says so wherever it is,
      // the empty state included. Advancing does not wait on the server.
      writeInBackground(written, () => {
        setPassed((p) => {
          const next = new Set(p);
          next.delete(box.id);
          return next;
        });
        setError(`The weight for box ${box.displayCode} did not save. It is back in the list.`);
      });
      advance(box.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the weight.");
    }
  }

  function pickSize(box: Container, size: ContainerSize | null) {
    setSizeHere((m) => new Map(m).set(box.id, size));
    try {
      const { written } = setContainerSize(moveId, box, size, undefined, zones, uid);
      writeInBackground(written, () => setError(SAVED_HERE));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the size.");
    }
  }

  const zone = zones.find((z) => z.id === current.destinationZoneId);

  return (
    <div className="flex min-h-full flex-col">
      <BackBar onBack={onBack} />
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 pt-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold text-slate-100">Weigh boxes</h2>
          <p className="text-slate-400">{queue.length} left</p>
        </div>

        <div className="flex items-center gap-4">
          <span className="font-mono text-6xl font-bold text-slate-50">{current.displayCode}</span>
          <span className="flex items-center gap-2">
            {zone ? (
              <>
                <span className="size-6 rounded-full" style={{ backgroundColor: zone.colorValue }} />
                <span className="text-xl text-slate-200">{zone.name}</span>
              </>
            ) : (
              <>
                <span className="size-6 rounded-full border-2 border-dashed border-amber-400" />
                <span className="text-xl text-amber-300">No room</span>
              </>
            )}
          </span>
        </div>

        <FirstPhoto key={current.id} moveId={moveId} containerId={current.id} />

        <SizeChips selected={current.size} onSelect={(s) => pickSize(current, s)} />

        <NumberField
          label="Weight"
          unit="lb"
          value={weight}
          onChange={setWeight}
          inputRef={field}
          autoFocus
        />
        <ErrorLine message={error} />
      </div>

      {/* Pinned below the scroll area so the keypad never covers it. */}
      <div className="flex flex-col gap-3 border-t border-slate-800 p-4">
        <Button onClick={() => save(current)} disabled={weight.trim() === ""}>
          Save and next
        </Button>
        <Button onClick={() => advance(current.id)} tone="quiet">
          Skip
        </Button>
      </div>
    </div>
  );
}

function withSize(box: Container, sizeHere: ReadonlyMap<string, ContainerSize | null>): Container {
  if (!sizeHere.has(box.id)) return box;
  const size = sizeHere.get(box.id);
  const { size: _size, volumeCuFt: _volume, ...rest } = box;
  return size ? { ...rest, size } : rest;
}

/** The first photo of the box, so a sealed box can be told from its neighbor. Nothing when it has none. */
function FirstPhoto({ moveId, containerId }: { moveId: string; containerId: string }) {
  const photos = usePhotos(moveId, containerId);
  const first = photos[0];
  const src = first ? (first.localUrl ?? first.photo.downloadUrl) : undefined;
  // Offline, an uploaded photo never viewed on this phone cannot load. The
  // number and the room are what identify the box, so a photo that will not
  // load is left out rather than drawn broken.
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return null;
  return <img src={src} alt="" onError={() => setFailed(src)} className="size-32 rounded-xl object-cover" />;
}
