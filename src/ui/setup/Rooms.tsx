import { useState, type ReactNode } from "react";
import type { Move, Zone } from "../../domain";
import { addZone, updateMove, updateZone, writeInBackground } from "../../repositories";
import { PALETTE, shortCodeFor, type PaletteEntry } from "../../lib/palette";
import { Button, ErrorLine, Field, Screen } from "../kit";

/**
 * Rooms at the destination. Colour is chosen here because it is written on
 * the box by hand, so it is a naming decision rather than a styling one.
 *
 * The colour a room is given at creation is a first guess, not a ruling. The
 * physical system is sticker sheets bought in a shop, so the app has to match
 * what is on the roll rather than tell somebody which colour their kitchen is.
 * The choice stays inside `PALETTE`: `colorName` is written on cardboard with
 * a marker, so it is one legible word rather than anything a colour input
 * would produce. See docs/09-glossary.md.
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
  /** The room whose colour is being chosen, or null. One at a time. */
  const [changing, setChanging] = useState<string | null>(null);

  const locationId = move.destinationLocationId;
  const taken = new Set(zones.map((z) => z.colorName));
  const nextColor = PALETTE.find((p) => !taken.has(p.name)) ?? PALETTE[0]!;
  const shared = sharedColors(zones);

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

  /**
   * The colour a room is written in. Nothing else on the box record changes,
   * and nothing caches it: every screen reads the colour off the zone it is
   * given, so the boxes already written in the old colour show the new one the
   * moment this write lands. The marker on the cardboard is what it is, which
   * is why the change is offered at all.
   */
  function changeColor(zone: Zone, color: PaletteEntry) {
    setChanging(null);
    setError(null);
    try {
      const { written } = updateZone(move.id, {
        ...zone,
        colorName: color.name,
        colorValue: color.value,
      });
      writeInBackground(written, () =>
        setError("This color is saved on your phone. It has not reached the other phone yet.")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the color.");
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
          <li key={z.id} className="flex flex-col gap-2 rounded-xl bg-slate-800 p-3">
            <div className="flex items-center gap-3">
              <span className="flex-1 text-lg text-slate-100">{z.name}</span>
              {/* The colour is the control. Tapping it is how a room is matched
                  to the sticker sheet somebody actually bought. */}
              <button
                onClick={() => setChanging(changing === z.id ? null : z.id)}
                aria-label={`Change the color for ${z.name}`}
                className="flex min-h-14 items-center gap-2 rounded-xl bg-slate-700 px-3"
              >
                <span className="size-6 rounded-full" style={{ backgroundColor: z.colorValue }} />
                <span className="font-mono text-sm text-slate-100">{z.colorName}</span>
                <span className="text-sm text-slate-400">Change</span>
              </button>
            </div>

            {changing === z.id ? (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  {PALETTE.map((p) => {
                    const alsoOn = zones.filter((o) => o.id !== z.id && o.colorName === p.name);
                    return (
                      <button
                        key={p.name}
                        onClick={() => changeColor(z, p)}
                        aria-label={`Write ${p.name} on ${z.name} boxes`}
                        className={
                          "flex min-h-14 items-center gap-3 rounded-xl px-3 text-left " +
                          (p.name === z.colorName ? "bg-slate-100 text-slate-900" : "bg-slate-700 text-slate-100")
                        }
                      >
                        <span className="size-6 shrink-0 rounded-full" style={{ backgroundColor: p.value }} />
                        <span className="min-w-0">
                          <span className="block font-mono text-sm">{p.name}</span>
                          {/* Named rather than blocked. Two sticker sheets can
                              be the same color, and the person holding them
                              knows that better than this screen does. */}
                          {alsoOn.length > 0 ? (
                            <span className="block truncate text-xs text-amber-300">
                              also {alsoOn.map((o) => o.name).join(", ")}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setChanging(null)} className="min-h-14 text-slate-400 underline">
                  Keep {z.colorName}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {shared.map((s) => (
        <p key={s.colorName} className="text-sm text-amber-300">
          {sharedLine(s)}
        </p>
      ))}

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

interface SharedColor {
  colorName: string;
  names: string[];
}

/**
 * Rooms that ended up wearing one colour. This is a note rather than a rule:
 * somebody with two sheets of the same sticker is not making a mistake, and
 * the number written on the box is what tells two boxes apart anyway.
 */
function sharedColors(zones: readonly Zone[]): SharedColor[] {
  const byColor = new Map<string, string[]>();
  for (const z of zones) byColor.set(z.colorName, [...(byColor.get(z.colorName) ?? []), z.name]);
  return [...byColor.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([colorName, names]) => ({ colorName, names }));
}

function sharedLine({ colorName, names }: SharedColor): string {
  const rooms =
    names.length === 2 ? `${names[0]} and ${names[1]} are both` : `${names.join(", ")} are all`;
  return `${rooms} ${colorName}. That is fine if it matches your stickers.`;
}
