import { describe, expect, it } from "vitest";
import {
  activityEventSchema,
  containerPhotoSchema,
  containerSchema,
  moveMemberSchema,
  moveSchema,
  zoneSchema,
} from "../schemas";
import { makeContainer } from "./factories";

const NOW = "2026-07-25T18:00:00.000Z";

function makePhoto(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    moveId: "m1",
    containerId: "c1",
    type: "contents",
    width: 1600,
    height: 1200,
    bytes: 200_000,
    uploadState: "uploaded",
    attempts: 0,
    createdAt: NOW,
    createdBy: "mem1",
    ...over,
  };
}

function makeMove(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    name: "KC to DFW",
    status: "packing",
    memberUids: ["u1"],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("containerSchema", () => {
  it("accepts a valid container", () => {
    expect(containerSchema.safeParse(makeContainer()).success).toBe(true);
  });

  it("rejects a sequence number of zero", () => {
    expect(containerSchema.safeParse(makeContainer({ sequenceNumber: 0 })).success).toBe(false);
  });

  it("rejects a status that is really a condition", () => {
    expect(containerSchema.safeParse(makeContainer({ status: "damaged" as never })).success).toBe(false);
  });

  it("rejects a timestamp that is not ISO 8601", () => {
    expect(containerSchema.safeParse(makeContainer({ createdAt: "26 July 2026" })).success).toBe(false);
  });
});

describe("zoneSchema", () => {
  it("requires a colorName that can be written by hand", () => {
    const base = { id: "z1", moveId: "m1", locationId: "l1", name: "Kitchen", shortCode: "KIT", colorValue: "#2563c9", sortOrder: 0 };
    expect(zoneSchema.safeParse({ ...base, colorName: "BLUE" }).success).toBe(true);
    expect(zoneSchema.safeParse({ ...base, colorName: "Light Blue" }).success).toBe(false);
  });
});

describe("containerPhotoSchema summaryState", () => {
  it("accepts a photo with no summaryState, which is what every existing document has", () => {
    expect(containerPhotoSchema.safeParse(makePhoto()).success).toBe(true);
  });

  it("accepts every state the function and the client can write", () => {
    for (const state of ["none", "queued", "done", "skipped", "failed"]) {
      expect(containerPhotoSchema.safeParse(makePhoto({ summaryState: state })).success).toBe(true);
    }
  });

  it("rejects a state outside the enum", () => {
    expect(containerPhotoSchema.safeParse(makePhoto({ summaryState: "dismissed" })).success).toBe(false);
  });
});

describe("moveSchema aiEnabled", () => {
  it("treats absent as distinct from false, so both parse", () => {
    expect(moveSchema.safeParse(makeMove()).success).toBe(true);
    expect(moveSchema.safeParse(makeMove({ aiEnabled: false })).success).toBe(true);
    expect(moveSchema.safeParse(makeMove({ aiEnabled: true })).success).toBe(true);
  });

  it("leaves aiEnabled out of the parsed object when it was absent", () => {
    const parsed = moveSchema.parse(makeMove());
    expect("aiEnabled" in parsed).toBe(false);
  });

  it("rejects a non-boolean", () => {
    expect(moveSchema.safeParse(makeMove({ aiEnabled: "yes" })).success).toBe(false);
  });
});

describe("activityEventSchema", () => {
  it("accepts the summary_generated type", () => {
    const event = {
      id: "a1",
      moveId: "m1",
      containerId: "c1",
      actorId: "u1",
      type: "summary_generated",
      occurredAt: NOW,
      payload: { photoId: "p1", confidence: 0.86 },
    };
    expect(activityEventSchema.safeParse(event).success).toBe(true);
  });
});

describe("moveMemberSchema", () => {
  it("rejects a range that ends before it starts", () => {
    const base = { id: "mem1", moveId: "m1", uid: "u1", displayName: "Nathan", role: "owner" as const };
    expect(moveMemberSchema.safeParse({ ...base, numberRangeStart: 1, numberRangeEnd: 499 }).success).toBe(true);
    expect(moveMemberSchema.safeParse({ ...base, numberRangeStart: 500, numberRangeEnd: 1 }).success).toBe(false);
  });

  /**
   * The watermark is optional because every member written before APPLY-13
   * lacks it, and absent reads as 0. What it can never be is negative or a
   * fraction: it is a box number or nothing.
   */
  it("accepts an absent, zero, or whole-number watermark and nothing else", () => {
    const member = {
      id: "mem1", moveId: "m1", uid: "u1", displayName: "Nathan", role: "owner" as const,
      numberRangeStart: 1, numberRangeEnd: 499,
    };
    expect(moveMemberSchema.safeParse(member).success).toBe(true);
    expect(moveMemberSchema.safeParse({ ...member, highestIssued: 0 }).success).toBe(true);
    expect(moveMemberSchema.safeParse({ ...member, highestIssued: 42 }).success).toBe(true);
    expect(moveMemberSchema.safeParse({ ...member, highestIssued: -1 }).success).toBe(false);
    expect(moveMemberSchema.safeParse({ ...member, highestIssued: 1.5 }).success).toBe(false);
    expect(moveMemberSchema.safeParse({ ...member, highestIssued: "42" }).success).toBe(false);
  });

  /**
   * Optional because every member written before APPLY-15 lacks it, and absent
   * means still on the move. Present, it is a timestamp like every other one.
   */
  it("accepts an absent or ISO removedAt and nothing else", () => {
    const member = {
      id: "mem3", moveId: "m1", uid: "u3", displayName: "Alex", role: "member" as const,
      numberRangeStart: 1000, numberRangeEnd: 1499,
    };
    expect(moveMemberSchema.safeParse(member).success).toBe(true);
    expect(moveMemberSchema.safeParse({ ...member, removedAt: NOW }).success).toBe(true);
    expect(moveMemberSchema.safeParse({ ...member, removedAt: "yesterday" }).success).toBe(false);
    expect(moveMemberSchema.safeParse({ ...member, removedAt: 0 }).success).toBe(false);
  });
});

describe("container size and weight", () => {
  const ok = (over: Record<string, unknown>) => containerSchema.safeParse(makeContainer(over)).success;

  it("accepts a box with neither, which is every box from before", () => {
    expect(ok({})).toBe(true);
  });

  it("accepts each named size and refuses one it does not know", () => {
    for (const size of ["bin_large", "bin_medium", "box_large", "box_medium", "box_small", "other"]) {
      expect(ok({ size })).toBe(true);
    }
    expect(ok({ size: "tote" })).toBe(false);
  });

  it("takes a weight over 0 and up to 500 with one decimal", () => {
    expect(ok({ weightLb: 0.1 })).toBe(true);
    expect(ok({ weightLb: 12.3 })).toBe(true);
    expect(ok({ weightLb: 500 })).toBe(true);
    expect(ok({ weightLb: 0 })).toBe(false);
    expect(ok({ weightLb: -4 })).toBe(false);
    expect(ok({ weightLb: 500.1 })).toBe(false);
    expect(ok({ weightLb: 12.34 })).toBe(false);
  });

  it("bounds a typed volume", () => {
    expect(ok({ size: "other", volumeCuFt: 40 })).toBe(true);
    expect(ok({ size: "other", volumeCuFt: 0 })).toBe(false);
    expect(ok({ size: "other", volumeCuFt: 201 })).toBe(false);
  });
});

describe("move capacity", () => {
  const move = {
    id: "m1",
    name: "KC to DFW",
    status: "packing",
    memberUids: ["u1"],
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("is optional, and positive when present", () => {
    expect(moveSchema.safeParse(move).success).toBe(true);
    expect(moveSchema.safeParse({ ...move, capacityCuFt: 1420, capacityLb: 8400 }).success).toBe(true);
    expect(moveSchema.safeParse({ ...move, capacityCuFt: 0 }).success).toBe(false);
  });
});
