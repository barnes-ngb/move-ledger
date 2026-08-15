import { useState } from "react";
import type { User } from "firebase/auth";
import type { MoveContext } from "../../hooks/useMove";
import { CreateMove } from "./CreateMove";
import { ExportPanel } from "./ExportPanel";
import { Members } from "./Members";
import { Rooms } from "./Rooms";

/**
 * Stage is derived from data rather than held in state wherever possible, so
 * a refresh mid-setup resumes where it left off instead of starting over.
 *
 * `onExit` is null while there is nowhere to go: a move with no rooms is held
 * here, because a box with no room has no color to write on it. Once a room
 * exists this screen is an ordinary destination reached from the move, and it
 * gets the back control every other screen has.
 */
export function Setup({
  user,
  ctx,
  onFinished,
  onExit,
}: {
  user: User;
  ctx: MoveContext;
  onFinished: () => void;
  onExit: (() => void) | null;
}) {
  const [stage, setStage] = useState<"rooms" | "members">("rooms");

  if (!ctx.move || !ctx.me) return <CreateMove user={user} />;
  const move = ctx.move;
  if (stage === "rooms") {
    return (
      <Rooms
        move={move}
        zones={ctx.zones}
        onDone={() => setStage("members")}
        onBack={onExit}
        exportPanel={
          <ExportPanel
            move={move}
            members={ctx.members}
            zones={ctx.zones}
            locations={ctx.locations}
          />
        }
      />
    );
  }
  // Back here is the room list rather than the move: this is the second step
  // of two, and the step before it is where a person would be going.
  return (
    <Members
      move={move}
      members={ctx.members}
      onDone={onFinished}
      onBack={() => setStage("rooms")}
    />
  );
}
