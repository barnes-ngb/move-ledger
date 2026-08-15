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

/**
 * Multi-line free text. Used by the contents list, which is prose a person
 * corrects rather than a structured field. Nothing here adds formatting: the
 * text is searched word by word, so bullets and markup would become part of
 * what a search has to match.
 */
export function TextArea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-400">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1 w-full rounded-xl bg-slate-800 p-4 text-lg leading-relaxed text-slate-100"
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

/**
 * What a stopped listener looks like. A spinner is the wrong answer here: the
 * data is not on its way, and nothing will arrive without another attempt.
 *
 * The wording follows docs/09-glossary.md. The reason a listener stopped is a
 * Firestore code and it stays in the console. On screen it is one plain
 * sentence, because the person reading it is standing in a room holding a box
 * and the only useful action is the button.
 */
export function SubscriptionFailed({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Screen title={title}>
      <p className="text-slate-400">
        Move Ledger stopped receiving data for this move. Nothing you saved is gone.
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </Screen>
  );
}
