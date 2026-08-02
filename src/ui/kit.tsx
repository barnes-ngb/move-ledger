import type { ReactNode } from "react";

/**
 * Shared primitives. Every touch target is at least 56px tall, per
 * docs/04-screen-specifications.md, because these are used one-handed while
 * holding something else.
 */
export function Button({
  children,
  onClick,
  disabled,
  tone = "primary",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "quiet";
}) {
  const base = "min-h-14 w-full rounded-2xl px-5 text-lg font-semibold disabled:opacity-50";
  const skin = tone === "primary" ? "bg-sky-500 text-slate-950" : "bg-slate-700 text-slate-100";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${skin}`}>
      {children}
    </button>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="mt-1 min-h-14 w-full rounded-xl bg-slate-800 px-4 text-lg text-slate-100 placeholder:text-slate-500"
      />
    </label>
  );
}

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 p-6">
      <h2 className="text-2xl font-semibold text-slate-100">{title}</h2>
      {children}
    </div>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  return message ? <p className="text-sm text-amber-300">{message}</p> : null;
}
