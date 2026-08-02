import { useState } from "react";
import { signInWithGoogle } from "../auth";

/**
 * One button. Doc 04 has no sign-in screen because ADR-0005 reduced it to
 * this. The error line exists because a closed or blocked popup is silent
 * otherwise, and a user who taps and sees nothing taps again forever.
 */
export function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
      setError(
        code === "auth/popup-blocked"
          ? "The browser blocked the sign-in window. Allow popups for this site and try again."
          : code === "auth/popup-closed-by-user"
            ? "Sign-in was cancelled."
            : "Sign-in failed. Check the connection and try again."
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 p-8 text-center">
      <div>
        <h1 className="text-3xl font-semibold text-slate-100">Move Ledger</h1>
        <p className="mt-2 text-slate-400">Boxes for the move to DFW.</p>
      </div>
      <button
        onClick={onSignIn}
        disabled={busy}
        className="min-h-16 w-full max-w-xs rounded-2xl bg-sky-500 px-6 text-lg font-semibold text-slate-950 disabled:opacity-60"
      >
        {busy ? "Signing in" : "Sign in with Google"}
      </button>
      {error ? <p className="max-w-xs text-sm text-amber-300">{error}</p> : null}
    </div>
  );
}
