import { describe, expect, it } from "vitest";
import {
  RangeExhaustedError,
  isWithinRange,
  nextSequenceNumber,
  rangesOverlap,
  remainingInRange,
  toDisplayCode,
  nextMemberRange,
} from "../numbers";

const nathan = { numberRangeStart: 1, numberRangeEnd: 499 };
const shelly = { numberRangeStart: 500, numberRangeEnd: 999 };

describe("nextSequenceNumber", () => {
  it("starts at the bottom of the range when nothing is used", () => {
    expect(nextSequenceNumber(nathan, [])).toBe(1);
    expect(nextSequenceNumber(shelly, [])).toBe(500);
  });

  it("continues from the highest used number", () => {
    expect(nextSequenceNumber(nathan, [1, 2, 3])).toBe(4);
  });

  it("ignores numbers belonging to the other member", () => {
    expect(nextSequenceNumber(nathan, [1, 2, 500, 501, 502])).toBe(3);
  });

  it("never refills a gap left by a deleted box", () => {
    expect(nextSequenceNumber(nathan, [1, 2, 3, 7])).toBe(8);
  });

  /**
   * The reason voiding exists. A gap in the middle of the range is never
   * refilled, but the top of the range is not a gap: drop the highest number
   * and the very next box is handed that same number back. Two pieces of
   * cardboard would then carry it, and nothing downstream can tell them apart.
   *
   * This is pinned rather than fixed. Reserving from a high-water mark stored
   * on the member would be the alternative, and it fails offline for exactly
   * the reason the disjoint ranges exist. Keeping the voided document in the
   * collection is what holds the mark instead, so the rule this test states
   * has to keep being true for that to work.
   */
  it("reissues the top number once the box holding it is gone", () => {
    expect(nextSequenceNumber(nathan, [1, 2, 3])).toBe(4);
    expect(nextSequenceNumber(nathan, [1, 2])).toBe(3);
  });

  it("keeps counting past a voided box, because its number stays in the list", () => {
    const voidedBox = 3;
    expect(nextSequenceNumber(nathan, [1, 2, voidedBox])).toBe(4);
  });

  it("throws once the range is spent", () => {
    const tiny = { numberRangeStart: 1, numberRangeEnd: 2 };
    expect(() => nextSequenceNumber(tiny, [1, 2])).toThrow(RangeExhaustedError);
  });
});

describe("remainingInRange", () => {
  it("reports the full range before anything is used", () => {
    expect(remainingInRange(nathan, [])).toBe(499);
  });

  it("shrinks as numbers are consumed", () => {
    expect(remainingInRange(nathan, [1, 2, 3])).toBe(496);
  });
});

describe("isWithinRange", () => {
  it("includes both ends", () => {
    expect(isWithinRange(1, nathan)).toBe(true);
    expect(isWithinRange(499, nathan)).toBe(true);
    expect(isWithinRange(500, nathan)).toBe(false);
  });
});

describe("toDisplayCode", () => {
  it("pads to three digits", () => {
    expect(toDisplayCode(1)).toBe("001");
    expect(toDisplayCode(42)).toBe("042");
    expect(toDisplayCode(999)).toBe("999");
  });

  it("widens rather than truncating past a thousand", () => {
    expect(toDisplayCode(1042)).toBe("1042");
  });
});

describe("rangesOverlap", () => {
  it("catches an overlap that would let two boxes share a number", () => {
    expect(rangesOverlap(nathan, shelly)).toBe(false);
    expect(rangesOverlap(nathan, { numberRangeStart: 400, numberRangeEnd: 700 })).toBe(true);
  });
});

describe("nextMemberRange", () => {
  const range = (start: number, end: number) => ({ numberRangeStart: start, numberRangeEnd: end });

  it("gives a third member 1000 to 1499 after 1 to 499 and 500 to 999", () => {
    expect(nextMemberRange([range(1, 499), range(500, 999)])).toEqual(range(1000, 1499));
  });

  it("gives the second member 500 to 999, which is what the screen used to hardcode", () => {
    expect(nextMemberRange([range(1, 499)])).toEqual(range(500, 999));
  });

  it("starts at 1 for a move with nobody on it", () => {
    expect(nextMemberRange([])).toEqual(range(1, 499));
  });

  it("counts from the highest end, whatever order the members arrive in", () => {
    expect(nextMemberRange([range(1000, 1499), range(1, 499), range(500, 999)])).toEqual(range(1500, 1999));
  });

  it("rounds an odd range up to the next whole block rather than starting mid-block", () => {
    expect(nextMemberRange([range(1, 499), range(500, 700)])).toEqual(range(1000, 1499));
  });

  /**
   * The caller passes removed members in with everyone else. The function has
   * no way to tell them apart, and that is the point: a range is retired, not
   * freed, so it is never the top of anything a new member can be given.
   */
  it("never hands out a range a removed member held", () => {
    const removedHelper = { ...range(1000, 1499), removedAt: "2026-11-01T00:00:00.000Z" };
    const next = nextMemberRange([range(1, 499), range(500, 999), removedHelper]);
    expect(next).toEqual(range(1500, 1999));
    expect(rangesOverlap(next, removedHelper)).toBe(false);
  });

  it("produces four-digit display codes, which the keypad can type", () => {
    const next = nextMemberRange([range(1, 499), range(500, 999)]);
    expect(toDisplayCode(next.numberRangeStart)).toBe("1000");
    expect(toDisplayCode(next.numberRangeEnd)).toBe("1499");
    expect(nextSequenceNumber(next, [])).toBe(1000);
  });
});
