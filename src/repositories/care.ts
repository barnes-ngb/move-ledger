import { deleteDoc, doc } from "firebase/firestore";
import { careNeedSchema, type CareNeed } from "../domain/schemas";
import { db } from "../lib/firebase";
import { createValidated, moveScoped, nowIso, subscribeValidated, type PendingWrite } from "./shared";

const care = (moveId: string) => moveScoped(db, moveId, "care");

/**
 * Writes a need whole. Create and update are the same call: the document is
 * small, the screen always holds all of it, and `setDoc` is the write that
 * does not care whether it exists yet. Two phones editing one card offline
 * resolve last-write-wins, which ADR-0002 accepted for everything in the move.
 */
export function saveCareNeed(need: CareNeed, uid: string): PendingWrite<CareNeed> {
  return createValidated(care(need.moveId), careNeedSchema, { ...need, updatedAt: nowIso(), updatedBy: uid });
}

export function watchCare(
  moveId: string,
  onData: (needs: CareNeed[]) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(care(moveId), careNeedSchema, onData, { onError });
}

export async function removeCareNeed(moveId: string, needId: string): Promise<void> {
  await deleteDoc(doc(care(moveId), needId));
}
