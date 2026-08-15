import { useEffect, useState } from "react";
import { startUploader } from "./photos/uploader";
import { useAuth } from "./hooks/useAuth";
import { useMove } from "./hooks/useMove";
import type { User } from "firebase/auth";
import { Home } from "./ui/Home";
import { SignIn } from "./ui/SignIn";
import { SubscriptionFailed } from "./ui/kit";
import { SyncIndicator } from "./ui/SyncIndicator";
import { Setup } from "./ui/setup/Setup";
import { WaitingForInvite } from "./ui/WaitingForInvite";

function SignedIn({ user }: { user: User }) {
  const ctx = useMove(user.uid);
  const [setupOpen, setSetupOpen] = useState(false);

  // Checked before loading. A listener that stopped has already cleared
  // loading, but the order says what this screen is for: the failure is a
  // resting state with an action, not a step on the way to the data.
  if (ctx.failed) return <SubscriptionFailed title="Cannot load this move" onRetry={ctx.retry} />;
  if (ctx.loading) return <div className="flex min-h-full items-center justify-center text-slate-500">Loading</div>;

  // No move at all: either this is the first person, or the second person is
  // waiting to be added. The two are indistinguishable from the client, so the
  // first-run screen is offered and the waiting screen is reachable from it.
  if (!ctx.move) return <FirstRun user={user} ctx={ctx} />;
  if (!ctx.me) return <WaitingForInvite user={user} />;
  if (setupOpen || ctx.zones.length === 0) {
    return <Setup user={user} ctx={ctx} onFinished={() => setSetupOpen(false)} />;
  }
  return <Home ctx={ctx} uid={user.uid} onSetup={() => setSetupOpen(true)} />;
}

function FirstRun({ user, ctx }: { user: User; ctx: ReturnType<typeof useMove> }) {
  const [waiting, setWaiting] = useState(false);
  if (waiting) return <WaitingForInvite user={user} />;
  return (
    <div>
      <Setup user={user} ctx={ctx} onFinished={() => undefined} />
      <div className="px-6 pb-8">
        <button onClick={() => setWaiting(true)} className="text-slate-400 underline">
          Someone else set up the move
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const auth = useAuth();

  // The queue drains from here for the whole session: on start, on `online`,
  // and after every capture. Photos taken on a previous visit are still in
  // Dexie and this is what picks them up.
  useEffect(() => startUploader(), []);

  return (
    <div
      className="flex h-full flex-col bg-slate-900 text-slate-100"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <span className="font-semibold">Move Ledger</span>
        {auth.status === "signedIn" ? <SyncIndicator /> : null}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {auth.status === "loading" ? (
          <div className="flex min-h-full items-center justify-center text-slate-500">Loading</div>
        ) : auth.status === "signedOut" ? (
          <SignIn />
        ) : (
          <SignedIn user={auth.user} />
        )}
      </main>
    </div>
  );
}
