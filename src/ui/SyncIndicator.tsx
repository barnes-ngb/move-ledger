import { useOnline } from "../hooks/useOnline";

/**
 * Doc 04 screen 9, with the strings taken from doc 09, which arbitrates
 * naming. Two rules drive the wording. Offline data is saved, not lost, not
 * pending, not unsaved: a user who believes their work might vanish will stop
 * trusting the app, and that costs more than any bug. And the online state
 * reads "Online" rather than "Synced" because doc 09 bars sync as a
 * user-facing word, and because useOnline reports connectivity, not whether
 * every write has landed.
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
      {online ? "Online" : "Offline, changes saved here"}
    </span>
  );
}
