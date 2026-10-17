import { collection, deleteDoc, doc, getDoc, getDocFromCache, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { moveSchema, type Move } from "../domain/schemas";
import {
  createValidated,
  newId,
  nowIso,
  subscribeValidated,
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

/**
 * The fields of a move a screen may change. `memberUids` is not one of them,
 * and neither are the id or the creation stamp.
 *
 * Membership is written only by `addMemberToMove` and `removeMember`, as an
 * `arrayUnion` or `arrayRemove`. This used to take the whole move and write it
 * back, so turning the contents list on wrote this phone's copy of
 * `memberUids` along with it. Offline, that copy could predate a member being
 * added or removed, and the queued toggle replayed afterward put the old array
 * back: a helper added on the couch lost access with nothing on any screen to
 * repair it, and a removed one got it back.
 */
export type MoveFields = Partial<Pick<Move, "name" | "status" | "originLocationId" | "destinationLocationId" | "aiEnabled">>;

/**
 * Strict, so a caller that spreads a whole move in is refused at runtime as
 * well as by the compiler: `memberUids` is an unknown key here and throws
 * before anything reaches Firestore.
 */
const moveFieldsSchema = moveSchema
  .pick({ name: true, status: true, originLocationId: true, destinationLocationId: true, aiEnabled: true })
  .partial()
  .strict();

/** Writes only the fields it is handed, plus `updatedAt`. */
export function updateMove(moveId: string, fields: MoveFields): PendingWrite<MoveFields> {
  const parsed = moveFieldsSchema.parse(fields);
  return {
    value: parsed,
    written: updateDoc(doc(moves(), moveId), { ...parsed, updatedAt: nowIso() }),
  };
}

/** The contents list setting. Both answers are written, because absent means unasked. */
export function setAiEnabled(moveId: string, aiEnabled: boolean): PendingWrite<MoveFields> {
  return updateMove(moveId, { aiEnabled });
}

/**
 * The two places a move runs between, linked once their documents exist. The
 * first-run flow is the only caller.
 */
export function setMoveLocations(
  moveId: string,
  originLocationId: string,
  destinationLocationId: string
): PendingWrite<MoveFields> {
  return updateMove(moveId, { originLocationId, destinationLocationId });
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
