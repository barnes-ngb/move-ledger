import { useEffect, useState } from "react";
import { startUploader } from "./photos/uploader";
import { setSummaryEnabled } from "./photos/summary";
import { useAuth } from "./hooks/useAuth";
import { useHasAnyPhoto } from "./hooks/useHasAnyPhoto";
import { useMove } from "./hooks/useMove";
import type { User } from "firebase/auth";
import { ContentsListNotice } from "./ui/ContentsListNotice";
import { Home } from "./ui/Home";
import { useHistoryView } from "./ui/history";
import { HomeSlotProvider, useHomeSlot, useOfferHome } from "./ui/nav";
import { SignIn } from "./ui/SignIn";
import { SubscriptionFailed } from "./ui/kit";
import { SyncIndicator } from "./ui/SyncIndicator";
import { Setup } from "./ui/setup/Setup";
import { WaitingForInvite } from "./ui/WaitingForInvite";

function SignedIn({ user }: { user: User }) {
  const ctx = useMove(user.uid);
  // Rooms and members is a screen reached from the move, so it takes a history
  // entry like every other one. Without it the back gesture closed the app
  // from here too. See `src/ui/history.ts`.
  const setup = useHistoryView<boolean>("setup", false);
  const [noticeAnswered, setNoticeAnswered] = useState(false);

  // Absent means unasked, which is not consent. The uploader defaults to off
  // and only this line ever turns it on.
  const aiEnabled = ctx.move?.aiEnabled;
  useEffect(() => setSummaryEnabled(aiEnabled === true), [aiEnabled]);

  const unasked = ctx.move !== null && aiEnabled === undefined;
  const hasPhoto = useHasAnyPhoto(ctx.move?.id ?? null, unasked);

  // A move with no rooms is held in setup, and there is no home behind that
  // to go to. Leaving is offered only once a room exists, which is also the
  // point at which Home has something to show.
  const showingSetup = setup.view || (ctx.move !== null && ctx.me !== null && ctx.zones.length === 0);
  const canLeaveSetup = ctx.zones.length > 0;
  // Home rather than back: setup is reached from the move overview, and its
  // second step pushes an entry of its own that leaving should not stop at.
  const leaveSetup = setup.home;
  useOfferHome(showingSetup && canLeaveSetup, leaveSetup);

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
  if (showingSetup) {
    return (
      <Setup
        user={user}
        ctx={ctx}
        onFinished={leaveSetup}
        onExit={canLeaveSetup ? leaveSetup : null}
      />
    );
  }
  // After setup, so the question lands when there is a photo to send rather
  // than in the middle of getting the move on its feet.
  if (unasked && hasPhoto && !noticeAnswered) {
    return <ContentsListNotice move={ctx.move} onAnswered={() => setNoticeAnswered(true)} />;
  }
  return <Home ctx={ctx} uid={user.uid} onSetup={() => setup.open(true)} />;
}

function FirstRun({ user, ctx }: { user: User; ctx: ReturnType<typeof useMove> }) {
  const [waiting, setWaiting] = useState(false);
  if (waiting) return <WaitingForInvite user={user} />;
  return (
    <div>
      <Setup user={user} ctx={ctx} onFinished={() => undefined} onExit={null} />
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
  const home = useHomeSlot();

  // The queue drains from here for the whole session: on start, on `online`,
  // and after every capture. Photos taken on a previous visit are still in
  // Dexie and this is what picks them up.
  useEffect(() => startUploader(), []);

  return (
    <div
      className="flex h-full flex-col bg-slate-900 text-slate-100"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <header className="flex items-center justify-between border-b border-slate-800 px-2 py-1 pr-4">
        {/* The title is the way home from every screen that has one. It is
            still the title: same words, same weight, and nothing about it
            moves when it becomes a button. */}
        {home.goHome ? (
          <button
            onClick={home.goHome}
            aria-label="Go to the move"
            className="flex min-h-11 items-center rounded-xl px-2 font-semibold text-slate-100"
          >
            Move Ledger
          </button>
        ) : (
          <span className="px-2 font-semibold">Move Ledger</span>
        )}
        {auth.status === "signedIn" ? <SyncIndicator /> : null}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <HomeSlotProvider claim={home.claim}>
          {auth.status === "loading" ? (
            <div className="flex min-h-full items-center justify-center text-slate-500">Loading</div>
          ) : auth.status === "signedOut" ? (
            <SignIn />
          ) : (
            <SignedIn user={auth.user} />
          )}
        </HomeSlotProvider>
      </main>
    </div>
  );
}
