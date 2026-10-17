import { collection, deleteDoc, doc, getDoc, getDocFromCache, where } from "firebase/firestore";
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

/**
 * Whether this move has the contents list turned on, read from the local
 * cache first. The uploader asks after every upload and must not pay a server
 * read to do it; `watchMoves` keeps this document in the cache, including a
 * Turn it on tapped a moment ago that the server has not acknowledged yet.
 *
 * Absent means nobody has been asked, which is not consent, so anything but
 * an explicit true reads as off. So does a move this phone cannot read.
 */
export async function isSummaryEnabled(moveId: string): Promise<boolean> {
  const ref = doc(moves(), moveId);
  let snap;
  try {
    snap = await getDocFromCache(ref);
  } catch {
    try {
      snap = await getDoc(ref);
    } catch {
      return false;
    }
  }
  return snap.exists() && snap.data().aiEnabled === true;
}

export async function deleteMove(moveId: string): Promise<void> {
  await deleteDoc(doc(moves(), moveId));
}
