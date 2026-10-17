import { doc, updateDoc } from "firebase/firestore";
import { moveMemberSchema, rangesOverlap, removalRefusal, type Move, type MoveMember } from "../domain";
import { db } from "../lib/firebase";
import { updateMove } from "./moves";
import { allWritten, createValidated, moveScoped, newId, nowIso, subscribeValidated, type PendingWrite } from "./shared";

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
 * Takes a member off the move. Two writes, in this order:
 *
 * 1. Their uid leaves `memberUids`. That is the whole of losing access: every
 *    rule in the move authorizes on that array, so their listeners stop and
 *    anything their phone has not sent yet is refused when it arrives.
 * 2. `removedAt` is stamped on their member record. The record is never
 *    deleted. It holds their range and their watermark, and without it the
 *    range assignment could hand their numbers to the next person, which is
 *    two boxes wearing one number. Their boxes keep `ownerMemberId` and stay.
 *
 * The stamp is written as that one field rather than the whole record. The
 * copy this phone holds can be behind the server's, and a full write would
 * carry a stale `highestIssued` that the rules refuse for going down, which
 * would take the stamp with it.
 */
export function removeMember(
  moveId: string,
  member: MoveMember,
  move: Move,
  actorUid: string
): PendingWrite<MoveMember> {
  const refusal = removalRefusal(member, actorUid);
  if (refusal) throw new Error(refusal);
  const removedAt = nowIso();
  const value = moveMemberSchema.parse({ ...member, removedAt });
  const access = updateMove({ ...move, memberUids: move.memberUids.filter((uid) => uid !== member.uid) });
  const stamp = updateDoc(doc(members(moveId), member.id), { removedAt });
  return { value, written: allWritten(access.written, stamp) };
}

export function watchMembers(
  moveId: string,
  onData: (m: MoveMember[]) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(members(moveId), moveMemberSchema, onData, { onError });
}
