import { describe, expect, it } from "vitest";
import { canDelete, isVoided } from "../lifecycle";
import { makeContainer } from "./factories";

const CONFIRMED = "2026-08-15T09:00:00.000Z";

describe("canDelete", () => {
  it("allows a draft that was never written on", () => {
    expect(canDelete(makeContainer({ status: "filling" }))).toBe(true);
  });

  it("refuses a box past filling even with no label confirmation", () => {
    expect(canDelete(makeContainer({ status: "packed" }))).toBe(false);
  });

  it("refuses a draft whose number was already written on cardboard", () => {
    expect(canDelete(makeContainer({ status: "filling", labelConfirmedAt: CONFIRMED }))).toBe(false);
  });

  it("refuses every status past filling", () => {
    for (const status of ["staged", "loaded", "unloaded", "opened", "emptied"] as const) {
      expect(canDelete(makeContainer({ status }))).toBe(false);
    }
  });
});

describe("isVoided", () => {
  it("is false for a box that has not been voided", () => {
    expect(isVoided(makeContainer())).toBe(false);
  });

  it("is true once voidedAt is stamped", () => {
    expect(isVoided(makeContainer({ voidedAt: CONFIRMED, voidedBy: "mem1" }))).toBe(true);
  });
});
