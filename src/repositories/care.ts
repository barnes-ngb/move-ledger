import { doc, writeBatch } from "firebase/firestore";
import { withoutUndefined, type CareChange } from "../domain/care";
import { activityEventSchema, careNeedSchema, type CareNeed } from "../domain/schemas";
import { db } from "../lib/firebase";
import { moveScoped, newId, nowIso, subscribeValidated, type PendingWrite } from "./shared";

const care = (moveId: string) => moveScoped(db, moveId, "care");
const activity = (moveId: string) => moveScoped(db, moveId, "activity");

/** What a care event carries. Enough to read the history without the card. */
export interface CareChangeDetail {
  change: CareChange;
  providerId?: string;
  providerName?: string;
  status?: string;
}

/**
 * Writes a need whole and logs what changed, in one batch. Create and update
 * are the same call: the document is small, the screen always holds all of
 * it, and `setDoc` is the write that does not care whether it exists yet.
 * Two phones editing one card offline resolve last-write-wins, which
 * ADR-0002 accepted for everything in the move.
 *
 * The schema is checked here, synchronously, so a card that fails it never
 * reaches Firestore; the forms check the same schema first so the person
 * sees the reason rather than a thrown error.
 */
export function saveCareNeed(need: CareNeed, uid: string, detail: CareChangeDetail): PendingWrite<CareNeed> {
  const now = nowIso();
  const parsed = withoutUndefined(careNeedSchema.parse({ ...need, updatedAt: now, updatedBy: uid }));
  const event = activityEventSchema.parse({
    id: newId(),
    moveId: need.moveId,
    actorId: uid,
    type: "care_changed",
    occurredAt: now,
    payload: { needId: need.id, title: need.title, ...withoutUndefinedRecord(detail) },
  });
  const batch = writeBatch(db);
  batch.set(doc(care(need.moveId), parsed.id), parsed);
  batch.set(doc(activity(need.moveId), event.id), event);
  return { value: parsed, written: batch.commit() };
}

export function watchCare(
  moveId: string,
  onData: (needs: CareNeed[]) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(care(moveId), careNeedSchema, onData, { onError });
}

export function removeCareNeed(moveId: string, need: Pick<CareNeed, "id" | "title">, uid: string): Promise<void> {
  const event = activityEventSchema.parse({
    id: newId(),
    moveId,
    actorId: uid,
    type: "care_changed",
    occurredAt: nowIso(),
    payload: { needId: need.id, title: need.title, change: "card_removed" },
  });
  const batch = writeBatch(db);
  batch.delete(doc(care(moveId), need.id));
  batch.set(doc(activity(moveId), event.id), event);
  return batch.commit();
}

function withoutUndefinedRecord(o: CareChangeDetail): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}
