import { describe, expect, it } from "vitest";
import {
  RangeExhaustedError,
  isWithinRange,
  nextSequenceNumber,
  rangesOverlap,
  remainingInRange,
  toDisplayCode,
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
