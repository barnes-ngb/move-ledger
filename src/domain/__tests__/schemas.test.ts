import { describe, expect, it } from "vitest";
import { containerSchema, moveMemberSchema, zoneSchema } from "../schemas";
import { makeContainer } from "./factories";

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

describe("moveMemberSchema", () => {
  it("rejects a range that ends before it starts", () => {
    const base = { id: "mem1", moveId: "m1", uid: "u1", displayName: "Nathan", role: "owner" as const };
    expect(moveMemberSchema.safeParse({ ...base, numberRangeStart: 1, numberRangeEnd: 499 }).success).toBe(true);
    expect(moveMemberSchema.safeParse({ ...base, numberRangeStart: 500, numberRangeEnd: 1 }).success).toBe(false);
  });
});
