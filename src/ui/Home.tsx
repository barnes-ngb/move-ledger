import { useState } from "react";
import type { Container } from "../domain";
import type { MoveContext } from "../hooks/useMove";
import { useContainers } from "../hooks/useContainers";
import { AddBox } from "./box/AddBox";
import { BoxDetail } from "./box/BoxDetail";
import { FindBox } from "./box/FindBox";
import { Button, Screen } from "./kit";

type View = { name: "home" } | { name: "add" } | { name: "find" } | { name: "detail"; id: string };

export function Home({ ctx, uid, onSetup }: { ctx: MoveContext; uid: string; onSetup: () => void }) {
  const [view, setView] = useState<View>({ name: "home" });
  const containers = useContainers(ctx.move?.id ?? null);

  if (!ctx.move || !ctx.me) return null;
  const moveId = ctx.move.id;

  if (view.name === "add") {
    return (
      <AddBox
        moveId={moveId}
        me={ctx.me}
        containers={containers}
        zones={ctx.zones}
        uid={uid}
        onClose={() => setView({ name: "home" })}
      />
    );
  }

  if (view.name === "find") {
    return (
      <FindBox
        containers={containers}
        zones={ctx.zones}
        onOpen={(c) => setView({ name: "detail", id: c.id })}
      />
    );
  }

  if (view.name === "detail") {
    const found = containers.find((c) => c.id === view.id);
    if (!found) return <Screen title="That box is gone">{null}</Screen>;
    return (
      <BoxDetail
        moveId={moveId}
        container={found as Container}
        zones={ctx.zones}
        uid={uid}
        onClose={() => setView({ name: "find" })}
      />
    );
  }

  const mine = containers.filter((c) => c.ownerMemberId === ctx.me!.id).length;

  return (
    <div className="flex min-h-full flex-col justify-between p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-slate-100">{ctx.move.name}</h2>
        <p className="text-slate-400">
          {containers.length} box{containers.length === 1 ? "" : "es"}, {mine} of them yours.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Button onClick={() => setView({ name: "add" })}>Add a box</Button>
        <Button onClick={() => setView({ name: "find" })} tone="quiet">
          Find a box
        </Button>
        <button onClick={onSetup} className="min-h-12 text-slate-400 underline">
          Rooms and members
        </button>
      </div>
    </div>
  );
}
