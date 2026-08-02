import { useState } from "react";
import type { User } from "firebase/auth";
import { signOut } from "../auth";
import { Screen } from "./kit";

/**
 * Shown to a signed-in person who belongs to no move. Creating a second move
 * is deliberately not offered here: for this household there is exactly one,
 * and an accidental second one is a confusing mess to unpick.
 */
export function WaitingForInvite({ user }: { user: User }) {
  const [copied, setCopied] = useState(false);

  return (
    <Screen title="Almost there">
      <p className="text-slate-300">Read this id to the person who set up the move.</p>
      <p className="break-all rounded-lg bg-slate-800 p-3 font-mono text-sm text-slate-200">{user.uid}</p>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(user.uid);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="min-h-14 rounded-xl bg-slate-700 px-5 font-medium text-slate-100"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <p className="text-sm text-slate-400">Once you are added, this screen becomes the move.</p>
      <button onClick={() => void signOut()} className="min-h-12 self-start text-slate-400 underline">
        Sign out
      </button>
    </Screen>
  );
}
