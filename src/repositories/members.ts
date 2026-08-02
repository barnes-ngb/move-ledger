import { moveMemberSchema, rangesOverlap, type MoveMember } from "../domain";
import { db } from "../lib/firebase";
import { createValidated, moveScoped, newId, subscribeValidated } from "./shared";

const members = (moveId: string) => moveScoped(db, moveId, "members");

/**
 * Refuses an overlapping range at the door. Overlap is how two boxes end up
 * wearing the same number, and no later code can repair that.
 */
export async function addMember(
  moveId: string,
  member: Omit<MoveMember, "id" | "moveId">,
  existing: readonly MoveMember[]
): Promise<MoveMember> {
  for (const other of existing) {
    if (rangesOverlap(member, other)) {
      throw new Error(
        `Range ${member.numberRangeStart} to ${member.numberRangeEnd} overlaps ${other.displayName}'s range.`
      );
    }
  }
  return createValidated(members(moveId), moveMemberSchema, { ...member, id: newId(), moveId });
}

export function watchMembers(moveId: string, onData: (m: MoveMember[]) => void): () => void {
  return subscribeValidated(members(moveId), moveMemberSchema, onData);
}
