import type { MoveMember } from "./schemas";

export class RangeExhaustedError extends Error {
  constructor(public readonly member: Pick<MoveMember, "displayName" | "numberRangeStart" | "numberRangeEnd">) {
    super(
      `${member.displayName} has used every number from ${member.numberRangeStart} to ${member.numberRangeEnd}.`
    );
    this.name = "RangeExhaustedError";
  }
}

export interface NumberRange {
  numberRangeStart: number;
  numberRangeEnd: number;
}

/** True when n falls inside the member's assigned span, inclusive at both ends. */
export function isWithinRange(n: number, range: NumberRange): boolean {
  return n >= range.numberRangeStart && n <= range.numberRangeEnd;
}

/**
 * The next number this member should use.
 *
 * Takes the highest number already used inside the member's own range and adds one.
 * Gaps left by deleted boxes are never refilled, because a reused number would
 * collide with a marker already written on cardboard.
 *
 * `usedNumbers` may contain numbers belonging to other members. They are ignored.
 */
export function nextSequenceNumber(range: NumberRange, usedNumbers: readonly number[]): number {
  const mine = usedNumbers.filter((n) => isWithinRange(n, range));
  const next = mine.length === 0 ? range.numberRangeStart : Math.max(...mine) + 1;
  if (next > range.numberRangeEnd) {
    throw new RangeExhaustedError({ displayName: "This device", ...range });
  }
  return next;
}

/** How many numbers the member has left. Drives the low-range warning. */
export function remainingInRange(range: NumberRange, usedNumbers: readonly number[]): number {
  const mine = usedNumbers.filter((n) => isWithinRange(n, range));
  const highest = mine.length === 0 ? range.numberRangeStart - 1 : Math.max(...mine);
  return range.numberRangeEnd - highest;
}

/**
 * The number as it is written on the box. Zero padded to three, wider if it has
 * to be. A third member numbers from 1000, so four-digit numbers are real and
 * are written as they are: 1000, never 000 or a truncated 100.
 */
export function toDisplayCode(sequenceNumber: number): string {
  return String(sequenceNumber).padStart(3, "0");
}

/** Two members must not overlap, or two boxes can end up wearing the same number. */
export function rangesOverlap(a: NumberRange, b: NumberRange): boolean {
  return a.numberRangeStart <= b.numberRangeEnd && b.numberRangeStart <= a.numberRangeEnd;
}

/** How many numbers each member is given. The first member's range is 1 to 499 because numbers start at 1. */
export const RANGE_BLOCK = 500;

/**
 * The range for the next member added to a move: the first whole block of 500
 * above the highest end any member has ever held. With 1 to 499 and 500 to 999
 * taken, that is 1000 to 1499.
 *
 * `existing` must include removed members. A removed member's range is retired,
 * not freed: their boxes keep their numbers and the marker is still on the
 * cardboard, so handing the range to somebody else is the duplicate-number
 * collision APPLY-13 closed, arriving by a different door.
 */
export function nextMemberRange(existing: readonly NumberRange[]): NumberRange {
  if (existing.length === 0) return { numberRangeStart: 1, numberRangeEnd: RANGE_BLOCK - 1 };
  const highest = Math.max(...existing.map((r) => r.numberRangeEnd));
  const start = Math.ceil((highest + 1) / RANGE_BLOCK) * RANGE_BLOCK;
  return { numberRangeStart: start, numberRangeEnd: start + RANGE_BLOCK - 1 };
}
