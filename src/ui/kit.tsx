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

export function Screen({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {onBack ? <BackBar onBack={onBack} /> : null}
      <div className={"flex flex-col gap-6 p-6" + (onBack ? " pt-2" : "")}>
        <h2 className="text-2xl font-semibold text-slate-100">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/**
 * The way back, in the one place every screen puts it: top left, above the
 * scroll area, so it does not move as a list scrolls under it. A standalone
 * PWA shows no browser chrome and therefore no browser back button, so this
 * is the only back there is.
 *
 * 56px square rather than the 44px a back control is usually given, because
 * every other target in this app is 56px and this one is pressed one-handed
 * while holding a box.
 */
export function BackBar({ onBack, label = "Back" }: { onBack: () => void; label?: string }) {
  return (
    <div className="px-3 pt-3">
      <button
        onClick={onBack}
        className="flex min-h-14 min-w-14 items-center gap-1 rounded-xl pr-4 pl-2 text-lg text-slate-300"
      >
        <span aria-hidden="true" className="text-2xl leading-none">
          {"‹"}
        </span>
        {label}
      </button>
    </div>
  );
}

/**
 * The stop before something that cannot be taken back. Deleting a box, voiding
 * a box, and deleting a photo are the only three, and all three are reached
 * one-handed while holding cardboard, so the panel sits at the bottom of the
 * screen where a thumb already is.
 *
 * It does not dismiss on a tap outside. Cancelling by accident is harmless;
 * this exists to make confirming by accident hard. The tap is stopped rather
 * than passed on, because the photo viewer closes on its own backdrop and this
 * opens on top of it.
 */
export function Confirm({
  title,
  detail,
  confirmLabel,
  cancelLabel = "Keep it",
  onConfirm,
  onCancel,
}: {
  title: string;
  detail: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet title={title} detail={detail}>
      <Button onClick={onConfirm}>{confirmLabel}</Button>
      <Button onClick={onCancel} tone="quiet">
        {cancelLabel}
      </Button>
    </Sheet>
  );
}

/**
 * The panel `Confirm` sits in, on its own so a question with three answers
 * can use it too. Leaving Add box is the one: delete the draft, keep it, or
 * stay on the screen, and none of the three is a cancel.
 *
 * It is `fixed`, so it escapes the insets `App` puts on the whole app and
 * carries its own. Bottom matters because it sits on the home indicator;
 * left and right matter in landscape on a phone with a notch.
 */
export function Sheet({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-slate-950/85 p-4"
      style={{
        paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
        paddingLeft: "calc(1rem + env(safe-area-inset-left))",
        paddingRight: "calc(1rem + env(safe-area-inset-right))",
      }}
    >
      <div className="flex flex-col gap-4 rounded-3xl bg-slate-800 p-6">
        <h3 className="text-xl font-semibold text-slate-100">{title}</h3>
        <p className="leading-relaxed text-slate-300">{detail}</p>
        {children}
      </div>
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
