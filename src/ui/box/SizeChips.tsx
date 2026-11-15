import type { Ref } from "react";
import { SIZE_ORDER, sizeLabel, type ContainerSize } from "../../domain";

/**
 * Six chips, one tap each, for what kind of box this is. A tap on the chip
 * already chosen clears it, because an optional field needs a way back to
 * nothing and a seventh "None" chip would be one more target for the thumb.
 * ADR-0007.
 */
export function SizeChips({
  selected,
  onSelect,
}: {
  selected?: ContainerSize;
  onSelect: (size: ContainerSize | null) => void;
}) {
  return (
    <div role="group" aria-label="Size" className="grid grid-cols-3 gap-2">
      {SIZE_ORDER.map((s) => {
        const on = s === selected;
        return (
          <button
            key={s}
            onClick={() => onSelect(on ? null : s)}
            aria-pressed={on}
            className={
              "min-h-14 rounded-2xl px-2 text-base " +
              (on ? "bg-slate-100 font-semibold text-slate-900" : "bg-slate-800 text-slate-100")
            }
          >
            {sizeLabel(s)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A number typed on the decimal keypad, with its unit beside it. Saves on
 * blur rather than on each keystroke, so "3" on the way to "31.5" is never
 * written. The field holds text, and the caller parses it.
 */
export function NumberField({
  label,
  unit,
  value,
  onChange,
  onCommit,
  autoFocus,
  inputRef,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="mt-1 flex items-center gap-3">
        <input
          ref={inputRef}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit?.();
          }}
          inputMode="decimal"
          autoFocus={autoFocus}
          className="min-h-14 w-full rounded-xl bg-slate-800 px-4 text-lg text-slate-100"
        />
        <span className="text-lg text-slate-300">{unit}</span>
      </span>
    </label>
  );
}
