import { arrayRemove, collection, doc, writeBatch } from "firebase/firestore";
import { activityEventSchema, moveMemberSchema, rangesOverlap, removalRefusal, type MoveMember } from "../domain";
import { db } from "../lib/firebase";
import { createValidated, moveScoped, newId, nowIso, subscribeValidated, type PendingWrite } from "./shared";

const members = (moveId: string) => moveScoped(db, moveId, "members");

/**
 * Refuses an overlapping range at the door. Overlap is how two boxes end up
 * wearing the same number, and no later code can repair that.
 */
export function addMember(
  moveId: string,
  member: Omit<MoveMember, "id" | "moveId">,
  existing: readonly MoveMember[]
): PendingWrite<MoveMember> {
  for (const other of existing) {
    if (rangesOverlap(member, other)) {
      throw new Error(
        `Range ${member.numberRangeStart} to ${member.numberRangeEnd} overlaps ${other.displayName}'s range.`
      );
    }
  }
  return createValidated(members(moveId), moveMemberSchema, { ...member, id: newId(), moveId });
}

/**
 * Takes a member off the move. Three writes in one batch, so they land
 * together or not at all. Separately, a removal that reached the server
 * between two of them could leave the rest refused: two members removing each
 * other at once would each lose the authority to finish, and the record would
 * show somebody active who has no access. A batch is evaluated against the
 * move as it stood before it, and queues offline like a single write.
 *
 * 1. Their uid leaves `memberUids`, as an `arrayRemove` rather than a new
 *    array, so a membership change another phone made is not overwritten.
 *    That is the whole of losing access: every rule in the move authorizes on
 *    that array, so their listeners stop and anything their phone has not
 *    sent yet is refused when it arrives.
 * 2. `removedAt` is stamped on their member record. The record is never
 *    deleted. It holds their range and their watermark, and without it the
 *    range assignment could hand their numbers to the next person, which is
 *    two boxes wearing one number. Their boxes keep `ownerMemberId` and stay.
 *
 * The stamp is written as that one field rather than the whole record. The
 * copy this phone holds can be behind the server's, and a full write would
 * carry a stale `highestIssued` that the rules refuse for going down, which
 * would take the stamp with it.
 *
 * 3. A `member_removed` activity event, so the history says who took them off
 *    and when.
 */
export function removeMember(
  moveId: string,
  member: MoveMember,
  actorUid: string
): PendingWrite<MoveMember> {
  const refusal = removalRefusal(member, actorUid);
  if (refusal) throw new Error(refusal);
  const removedAt = nowIso();
  const value = moveMemberSchema.parse({ ...member, removedAt });
  const event = activityEventSchema.parse({
    id: newId(),
    moveId,
    actorId: actorUid,
    type: "member_removed",
    occurredAt: removedAt,
    payload: {
      memberId: member.id,
      uid: member.uid,
      displayName: member.displayName,
      numberRangeStart: member.numberRangeStart,
      numberRangeEnd: member.numberRangeEnd,
    },
  });
  const batch = writeBatch(db);
  batch.update(doc(collection(db, "moves"), moveId), { memberUids: arrayRemove(member.uid), updatedAt: removedAt });
  batch.update(doc(members(moveId), member.id), { removedAt });
  batch.set(doc(moveScoped(db, moveId, "activity"), event.id), event);
  return { value, written: batch.commit() };
}

export function watchMembers(
  moveId: string,
  onData: (m: MoveMember[]) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(members(moveId), moveMemberSchema, onData, { onError });
}
