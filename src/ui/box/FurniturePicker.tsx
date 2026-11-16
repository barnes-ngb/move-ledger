import { FURNITURE_GROUPS, FURNITURE_PRESETS, type FurniturePreset } from "../../domain";

/**
 * The common pieces, grouped, one tap each. Picking one fills the cu ft and
 * the weight, which stay editable: these are rules of thumb, not
 * measurements. ADR-0008.
 */
export function FurniturePicker({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (preset: FurniturePreset) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {FURNITURE_GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-2 text-sm text-slate-400">{group}</p>
          <div role="group" aria-label={group} className="grid grid-cols-2 gap-2">
            {FURNITURE_PRESETS.filter((p) => p.group === group).map((p) => {
              const on = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  aria-pressed={on}
                  className={
                    "min-h-14 rounded-2xl px-3 text-left text-base " +
                    (on ? "bg-slate-100 font-semibold text-slate-900" : "bg-slate-800 text-slate-100")
                  }
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A yes-or-no that reads as a sentence. A 24px box inside a 56px row, so the thumb has room. */
export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-14 items-center gap-3 text-slate-100">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6" />
      <span>{label}</span>
    </label>
  );
}
