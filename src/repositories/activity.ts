import { orderBy } from "firebase/firestore";
import { activityEventSchema, type ActivityEvent } from "../domain/schemas";
import { db } from "../lib/firebase";
import {
  createValidated,
  moveScoped,
  newId,
  nowIso,
  subscribeValidated,
  type PendingWrite,
} from "./shared";

const activity = (moveId: string) => moveScoped(db, moveId, "activity");

/** Append-only, enforced again at the rules level. Nothing edits an event. */
export function logActivity(
  moveId: string,
  event: Omit<ActivityEvent, "id" | "moveId" | "occurredAt"> & { occurredAt?: string }
): PendingWrite<ActivityEvent> {
  return createValidated(activity(moveId), activityEventSchema, {
    ...event,
    id: newId(),
    moveId,
    occurredAt: event.occurredAt ?? nowIso(),
  });
}

export function watchActivity(
  moveId: string,
  onData: (e: ActivityEvent[]) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(
    activity(moveId),
    activityEventSchema,
    onData,
    { onError },
    orderBy("occurredAt", "desc")
  );
}
