import { useEffect, useState } from "react";
import type { Container, Zone } from "../../domain";
import { findByNumber } from "../../domain";
import { appendDigit, deleteDigit } from "./keypad";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

/**
 * The ten-second lookup. A keypad rather than a text field, because the app
 * is used standing up and a numeric keyboard on a text input is smaller and
 * slower. Opens the box outright the moment one match remains.
 */
export function FindBox({
  containers,
  zones,
  onOpen,
}: {
  containers: readonly Container[];
  zones: readonly Zone[];
  onOpen: (c: Container) => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = findByNumber(containers, typed);

  useEffect(() => {
    if (typed.length > 0 && matches.length === 1) onOpen(matches[0]!);
  }, [typed, matches.length]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="p-6 text-center">
        <p className="font-mono text-5xl tracking-widest text-slate-50">{typed || "\u00a0"}</p>
        <p className="mt-2 text-sm text-slate-400">
          {typed ? `${matches.length} box${matches.length === 1 ? "" : "es"}` : "Type the number on the box"}
        </p>
      </div>

      <ul className="flex-1 overflow-y-auto px-6">
        {matches.slice(0, 12).map((c) => {
          const zone = zones.find((z) => z.id === c.destinationZoneId);
          return (
            <li key={c.id}>
              <button
                onClick={() => onOpen(c)}
                className="flex min-h-16 w-full items-center gap-4 border-b border-slate-800 text-left"
              >
                <span className="font-mono text-2xl text-slate-100">{c.displayCode}</span>
                {zone ? (
                  <span className="size-5 rounded-full" style={{ backgroundColor: zone.colorValue }} />
                ) : null}
                <span className="flex-1 truncate text-slate-300">{zone?.name ?? "No room"}</span>
                <span className="text-sm text-slate-500">{c.status}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-3 gap-2 border-t border-slate-800 p-3">
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              onClick={() => setTyped(k === "back" ? deleteDigit(typed) : appendDigit(typed, k))}
              className="min-h-16 rounded-2xl bg-slate-800 text-2xl font-semibold text-slate-100"
            >
              {k === "back" ? "\u232b" : k}
            </button>
          )
        )}
      </div>
    </div>
  );
}
