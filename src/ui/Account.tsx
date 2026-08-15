import { useState } from "react";
import type { User } from "firebase/auth";
import { signOut } from "../auth";

/**
 * Exists for one reason. ADR-0005 onboards the second member by having the
 * first add her uid to the move, and there is otherwise no way to see a uid
 * without a console. This is the couch step.
 */
export function Account({ user }: { user: User }) {
  const [copied, setCopied] = useState(false);

  async function copyUid() {
    await navigator.clipboard.writeText(user.uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <p className="text-sm text-slate-400">Signed in as</p>
        <p className="text-lg text-slate-100">{user.displayName ?? user.email ?? "Unknown"}</p>
      </div>

      <div>
        <p className="text-sm text-slate-400">Your account id</p>
        <p className="mt-1 break-all rounded-lg bg-slate-800 p-3 font-mono text-sm text-slate-200">{user.uid}</p>
        <button
          onClick={copyUid}
          className="mt-3 min-h-14 rounded-xl bg-slate-700 px-5 font-medium text-slate-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="text-sm text-slate-400">
        Boxes, rooms, and search arrive in the next build. This one exists to prove sign-in and installation
        work on this phone.
      </p>

      <button onClick={() => void signOut()} className="min-h-14 self-start text-slate-400 underline">
        Sign out
      </button>
    </div>
  );
}
