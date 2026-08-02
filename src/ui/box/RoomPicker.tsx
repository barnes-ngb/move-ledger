import type { Zone } from "../../domain";

/**
 * Colour chips rather than a select. The colour is what gets written on the
 * box, so choosing it is the point rather than decoration.
 */
export function RoomPicker({
  zones,
  selectedId,
  onSelect,
}: {
  zones: readonly Zone[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {zones.map((z) => {
        const on = z.id === selectedId;
        return (
          <button
            key={z.id}
            onClick={() => onSelect(z.id)}
            className={
              "flex min-h-16 items-center gap-3 rounded-2xl px-4 text-left text-lg " +
              (on ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-100")
            }
          >
            <span className="size-6 shrink-0 rounded-full" style={{ backgroundColor: z.colorValue }} />
            <span className="truncate">{z.name}</span>
          </button>
        );
      })}
    </div>
  );
}
