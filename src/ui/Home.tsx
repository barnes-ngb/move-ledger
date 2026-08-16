import type { Container } from "../domain";
import type { MoveContext } from "../hooks/useMove";
import { useContainers } from "../hooks/useContainers";
import { usePhotoCounts } from "../hooks/usePhotoCounts";
import { AddBox } from "./box/AddBox";
import { BoxDetail } from "./box/BoxDetail";
import { BoxList } from "./box/BoxList";
import { FindBox } from "./box/FindBox";
import { useHistoryView } from "./history";
import { Button, Screen, SubscriptionFailed } from "./kit";
import { useOfferHome } from "./nav";

/**
 * `detail` carries the view it was opened from rather than routing back to a
 * fixed screen, so Back returns to the list with its filter text still in it.
 * The text lives here, on the view, for the same reason: unmounting the list
 * to show a box must not throw away what the person typed to find it.
 *
 * The view is held in session history rather than in `useState`, so the system
 * back gesture moves through these screens instead of closing the app. See
 * `src/ui/history.ts`. Every field here survives `structuredClone`, which is
 * what the browser does to it, and the nested `from` travels with the rest.
 */
type View =
  | { name: "home" }
  | { name: "add" }
  | { name: "find" }
  | { name: "list"; query: string }
  | { name: "detail"; id: string; from: View };

/** The move overview. Stable so it can be the root of the history slot. */
const HOME: View = { name: "home" };

/** What the back control on box detail says, given where it was opened from. */
function backLabel(from: View): string {
  if (from.name === "list") return "Back to the list";
  if (from.name === "find") return "Back to find";
  return "Back";
}

export function Home({ ctx, uid, onSetup }: { ctx: MoveContext; uid: string; onSetup: () => void }) {
  const nav = useHistoryView<View>("move", HOME);
  const view = nav.view;
  const { containers, failed, retry } = useContainers(ctx.move?.id ?? null);
  const photoCounts = usePhotoCounts(ctx.move?.id ?? null, view.name === "list");

  // Every screen under this one goes home through the header title. Add box
  // is the exception and takes the header itself, because leaving it means
  // answering for the draft first.
  useOfferHome(view.name !== "add", nav.home);

  if (!ctx.move || !ctx.me) return null;
  const moveId = ctx.move.id;

  // Containers are subscribed here rather than in useMove, so the failure is
  // answered here too. Falling through would show a box count of zero and let
  // Add box reserve a number against an empty list, which is the one mistake
  // in this app that a marker makes permanent.
  if (failed) return <SubscriptionFailed title="Cannot load your boxes" onRetry={retry} />;

  if (view.name === "add") {
    return (
      <AddBox
        moveId={moveId}
        me={ctx.me}
        containers={containers}
        zones={ctx.zones}
        uid={uid}
        onLeave={nav.home}
      />
    );
  }

  if (view.name === "find") {
    const from: View = view;
    return (
      <FindBox
        containers={containers}
        zones={ctx.zones}
        onOpen={(c) => nav.open({ name: "detail", id: c.id, from })}
        onBack={nav.back}
      />
    );
  }

  if (view.name === "list") {
    const from: View = view;
    return (
      <BoxList
        containers={containers}
        zones={ctx.zones}
        photoCounts={photoCounts}
        query={view.query}
        // The filter text replaces this entry rather than pushing one. It is
        // the same screen, and a person who typed eight letters to find a box
        // should not have to press back eight times to leave it.
        onQueryChange={(query) => nav.update({ name: "list", query })}
        onOpen={(c) => nav.open({ name: "detail", id: c.id, from })}
        onBack={nav.back}
      />
    );
  }

  if (view.name === "detail") {
    const found = containers.find((c) => c.id === view.id);
    if (!found) {
      return (
        <Screen title="That box is gone" onBack={nav.back}>
          {null}
        </Screen>
      );
    }
    return (
      <BoxDetail
        moveId={moveId}
        container={found as Container}
        zones={ctx.zones}
        uid={uid}
        backLabel={backLabel(view.from)}
        onBack={nav.back}
      />
    );
  }

  const mine = containers.filter((c) => c.ownerMemberId === ctx.me!.id).length;

  return (
    <div className="flex min-h-full flex-col justify-between p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-slate-100">{ctx.move.name}</h2>
        {/* Doc 04 section 1: a person who has not started is not shown a row
            of zeroes. Three lines explaining the physical system, and the
            route to room setup, because a move with no rooms has no color to
            write on a box. */}
        {containers.length === 0 ? (
          <div className="flex flex-col gap-1 text-slate-400">
            <p>Every box gets a number and a room color.</p>
            <p>You write both on the box with a marker.</p>
            <p>Photograph what is inside before you seal it.</p>
          </div>
        ) : (
          <p className="text-slate-400">
            {containers.length} box{containers.length === 1 ? "" : "es"}, {mine} of them yours.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Button onClick={() => nav.open({ name: "add" })}>Add a box</Button>
        <Button onClick={() => nav.open({ name: "find" })} tone="quiet">
          Find a box
        </Button>
        <Button onClick={() => nav.open({ name: "list", query: "" })} tone="quiet">
          See all boxes
        </Button>
        <button onClick={onSetup} className="min-h-14 text-slate-400 underline">
          Rooms and members
        </button>
      </div>
    </div>
  );
}
