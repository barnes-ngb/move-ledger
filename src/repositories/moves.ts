import { arrayRemove, arrayUnion, collection, deleteDoc, doc, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { moveSchema, type Move } from "../domain/schemas";
import {
  createValidated,
  newId,
  nowIso,
  subscribeValidated,
  updateValidated,
  type PendingWrite,
  type SnapshotOrigin,
} from "./shared";

const moves = () => collection(db, "moves");

export function createMove(name: string, creatorUid: string): PendingWrite<Move> {
  const now = nowIso();
  return createValidated(moves(), moveSchema, {
    id: newId(),
    name,
    status: "planning",
    memberUids: [creatorUid],
    createdAt: now,
    updatedAt: now,
  });
}

export function updateMove(next: Move): PendingWrite<Move> {
  return updateValidated(moves(), moveSchema, { ...next, updatedAt: nowIso() });
}

/**
 * Membership changes are written as array operations, never as a whole new
 * `memberUids`. Two phones changing membership from their own cached copy
 * would otherwise each send the full array they last saw, and the later write
 * would put back a uid the earlier one removed: a person marked removed whom
 * the rules still let in. `arrayUnion` and `arrayRemove` merge on the server,
 * and queue offline like any other write.
 */
export function addMemberUid(moveId: string, uid: string): Promise<void> {
  return updateDoc(doc(moves(), moveId), { memberUids: arrayUnion(uid), updatedAt: nowIso() });
}

export function removeMemberUid(moveId: string, uid: string): Promise<void> {
  return updateDoc(doc(moves(), moveId), { memberUids: arrayRemove(uid), updatedAt: nowIso() });
}

/**
 * Filtered on memberUids rather than relying on the rules to narrow the
 * result. Firestore rules are not filters: an unfiltered list query fails
 * outright the moment it touches a document the caller cannot read. The
 * query and firestore.rules now assert the same thing.
 *
 * The only listener in the app that watches metadata. A caller has to know
 * whether the move it just received exists on the server, because everything
 * under `/moves/{id}` is read against the server's copy of that document.
 */
export function watchMoves(
  uid: string,
  onData: (m: Move[], origin: SnapshotOrigin) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(
    moves(),
    moveSchema,
    onData,
    { onError, watchMetadata: true },
    where("memberUids", "array-contains", uid)
  );
}

export async function deleteMove(moveId: string): Promise<void> {
  await deleteDoc(doc(moves(), moveId));
}
