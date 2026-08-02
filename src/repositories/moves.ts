import { collection, deleteDoc, doc } from "firebase/firestore";
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

/** Rules restrict reads to member moves, so an unfiltered subscription returns only ours. */
export function watchMoves(onData: (m: Move[]) => void): () => void {
  return subscribeValidated(moves(), moveSchema, onData);
}

export async function deleteMove(moveId: string): Promise<void> {
  await deleteDoc(doc(moves(), moveId));
}
