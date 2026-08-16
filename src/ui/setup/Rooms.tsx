import { useState, type ReactNode } from "react";
import type { Move, Zone } from "../../domain";
import { addZone, updateMove, writeInBackground } from "../../repositories";
import { PALETTE, shortCodeFor } from "../../lib/palette";
import { Button, ErrorLine, Field, Screen } from "../kit";

/**
 * Rooms at the destination. Colour is chosen here because it is written on
 * the box by hand, so it is a naming decision rather than a styling one.
 */
export function Rooms({
  move,
  zones,
  onDone,
  onBack,
  exportPanel,
}: {
  move: Move;
  zones: Zone[];
  onDone: () => void;
  /** Null during first run and while the move still has no rooms. */
  onBack: (() => void) | null;
  exportPanel?: ReactNode;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const locationId = move.destinationLocationId;
  const taken = new Set(zones.map((z) => z.colorName));
  const nextColor = PALETTE.find((p) => !taken.has(p.name)) ?? PALETTE[0]!;

  function add() {
    if (!locationId) {
      setError("The destination place is missing. This is a setup bug, not something you did.");
      return;
    }
    setError(null);
    try {
      const { written } = addZone(move.id, {
        locationId,
        name: name.trim(),
        shortCode: shortCodeFor(name),
        colorName: nextColor.name,
        colorValue: nextColor.value,
        sortOrder: zones.length,
      });
      writeInBackground(written, () =>
        setError("This room is saved on your phone. It has not reached the server yet.")
      );
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the room.");
    }
  }

  function toggleAi() {
    setError(null);
    try {
      writeInBackground(updateMove({ ...move, aiEnabled: move.aiEnabled !== true }).written, () =>
        setError("This setting is saved on your phone. It has not reached the other phone yet.")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the setting.");
    }
  }

  return (
    <Screen title="Rooms at the new place" {...(onBack ? { onBack } : {})}>
      <ul className="flex flex-col gap-2">
        {zones.map((z) => (
          <li key={z.id} className="flex items-center gap-3 rounded-xl bg-slate-800 p-3">
            <span className="size-6 rounded-full" style={{ backgroundColor: z.colorValue }} />
            <span className="flex-1 text-slate-100">{z.name}</span>
            <span className="font-mono text-sm text-slate-400">{z.colorName}</span>
          </li>
        ))}
      </ul>

      <Field label="Add a room" value={name} onChange={setName} placeholder="Kitchen" />
      <p className="text-sm text-slate-400">
        Next color: <span style={{ color: nextColor.value }}>{nextColor.name}</span>
      </p>
      <ErrorLine message={error} />
      <Button onClick={add} disabled={!name.trim()} tone="quiet">
        Add room
      </Button>

      {/* Doc 07's single setting for the whole move. Off and unasked look the
          same here on purpose: both mean no photo has been sent. */}
      <div className="rounded-2xl border border-slate-700 p-4">
        <p className="text-slate-200">Contents lists</p>
        <p className="mt-1 text-sm text-slate-400">
          {move.aiEnabled === true
            ? "Photos of an open box are sent to Anthropic to write a list of what is inside. The photo and the room name, nothing else."
            : "Off. No photo leaves this move."}
        </p>
        <div className="mt-3">
          <Button onClick={toggleAi} tone="quiet">
            {move.aiEnabled === true ? "Turn contents lists off" : "Turn contents lists on"}
          </Button>
        </div>
      </div>
      {exportPanel}

      {/* Done, because this one does complete something: it closes the room
          step and moves to the next. Nothing else in the app says Done. */}
      {zones.length === 0 ? (
        <p className="text-sm text-amber-300">
          Add at least one room. A box with no room has no color to write on it.
        </p>
      ) : null}
      <Button onClick={onDone} disabled={zones.length === 0}>
        Done, {zones.length} room{zones.length === 1 ? "" : "s"}
      </Button>
    </Screen>
  );
}
