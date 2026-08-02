import { useState } from "react";
import type { Move, Zone } from "../../domain";
import { addZone } from "../../repositories";
import { PALETTE, shortCodeFor } from "../../lib/palette";
import { Button, ErrorLine, Field, Screen } from "../kit";

/**
 * Rooms at the destination. Colour is chosen here because it is written on
 * the box by hand, so it is a naming decision rather than a styling one.
 */
export function Rooms({ move, zones, onDone }: { move: Move; zones: Zone[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const locationId = move.destinationLocationId;
  const taken = new Set(zones.map((z) => z.colorName));
  const nextColor = PALETTE.find((p) => !taken.has(p.name)) ?? PALETTE[0]!;

  async function add() {
    if (!locationId) {
      setError("The destination place is missing. This is a setup bug, not something you did.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addZone(move.id, {
        locationId,
        name: name.trim(),
        shortCode: shortCodeFor(name),
        colorName: nextColor.name,
        colorValue: nextColor.value,
        sortOrder: zones.length,
      });
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the room.");
    }
    setBusy(false);
  }

  return (
    <Screen title="Rooms at the new place">
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
      <Button onClick={() => void add()} disabled={busy || !name.trim()} tone="quiet">
        Add room
      </Button>
      <Button onClick={onDone} disabled={zones.length === 0}>
        Done, {zones.length} room{zones.length === 1 ? "" : "s"}
      </Button>
    </Screen>
  );
}
