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
});
