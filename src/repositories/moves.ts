import { collection, deleteDoc, doc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { moveSchema, type Move } from "../domain/schemas";
import { createValidated, newId, nowIso, subscribeValidated, updateValidated } from "./shared";

const moves = () => collection(db, "moves");

export async function createMove(name: string, creatorUid: string): Promise<Move> {
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

export async function updateMove(next: Move): Promise<Move> {
  return updateValidated(moves(), moveSchema, { ...next, updatedAt: nowIso() });
}

/**
 * Filtered on memberUids rather than relying on the rules to narrow the
 * result. Firestore rules are not filters: an unfiltered list query fails
 * outright the moment it touches a document the caller cannot read. The
 * query and firestore.rules now assert the same thing.
 */
export function watchMoves(uid: string, onData: (m: Move[]) => void): () => void {
  return subscribeValidated(moves(), moveSchema, onData, undefined, where("memberUids", "array-contains", uid));
}

export async function deleteMove(moveId: string): Promise<void> {
  await deleteDoc(doc(moves(), moveId));
}
