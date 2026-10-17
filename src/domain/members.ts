import type { MoveMember } from "./schemas";

/** True once a member has been taken off the move. Their record and range stay. */
export function isRemoved(member: Pick<MoveMember, "removedAt">): boolean {
  return member.removedAt !== undefined;
}

/**
 * Why this member cannot be removed by this person, or null if they can.
 *
 * Removing yourself would leave you locked out of a move you may be the only
 * one running, and the owner is the person who set the move up. Both are
 * refused here rather than in the rules: see docs/10-security-rules.md for why
 * the rules do not repeat them.
 */
export function removalRefusal(
  member: Pick<MoveMember, "uid" | "role" | "displayName" | "removedAt">,
  actorUid: string
): string | null {
  if (member.uid === actorUid) return "You cannot remove yourself from the move.";
  if (member.role === "owner") return `${member.displayName} set up the move and cannot be removed.`;
  if (isRemoved(member)) return `${member.displayName} is already removed.`;
  return null;
}
