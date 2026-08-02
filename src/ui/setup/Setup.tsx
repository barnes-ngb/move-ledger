import { useState } from "react";
import type { User } from "firebase/auth";
import type { MoveContext } from "../../hooks/useMove";
import { CreateMove } from "./CreateMove";
import { Members } from "./Members";
import { Rooms } from "./Rooms";

/**
 * Stage is derived from data rather than held in state wherever possible, so
 * a refresh mid-setup resumes where it left off instead of starting over.
 */
export function Setup({ user, ctx, onFinished }: { user: User; ctx: MoveContext; onFinished: () => void }) {
  const [stage, setStage] = useState<"rooms" | "members">("rooms");

  if (!ctx.move || !ctx.me) return <CreateMove user={user} />;
  if (stage === "rooms") {
    return <Rooms move={ctx.move} zones={ctx.zones} onDone={() => setStage("members")} />;
  }
  return <Members move={ctx.move} members={ctx.members} onDone={onFinished} />;
}
