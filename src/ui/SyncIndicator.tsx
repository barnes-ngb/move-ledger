import { useOnline } from "../hooks/useOnline";

/**
 * Doc 04 screen 9. The wording is deliberate: offline data is held, not lost,
 * not pending, not unsaved. A user who believes their work might vanish will
 * stop trusting the app, and that costs more than any bug.
 */
export function SyncIndicator() {
  const online = useOnline();
  return (
    <span
      className={
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium " +
        (online ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200")
      }
    >
      <span className={"size-2 rounded-full " + (online ? "bg-emerald-400" : "bg-amber-300")} />
      {online ? "Synced" : "Offline, changes held here"}
    </span>
  );
}
