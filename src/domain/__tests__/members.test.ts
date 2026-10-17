import { describe, expect, it } from "vitest";
import { isRemoved, removalRefusal } from "../members";

const owner = { uid: "u-nathan", role: "owner" as const, displayName: "Nathan" };
const shelly = { uid: "u-shelly", role: "member" as const, displayName: "Shelly" };
const helper = { uid: "u-alex", role: "member" as const, displayName: "Alex" };

describe("isRemoved", () => {
  it("reads removedAt and nothing else", () => {
    expect(isRemoved({})).toBe(false);
    expect(isRemoved({ removedAt: "2026-11-01T00:00:00.000Z" })).toBe(true);
    expect(isRemoved({ removedAt: undefined })).toBe(false);
  });
});

describe("removalRefusal", () => {
  it("lets any member remove another ordinary member", () => {
    expect(removalRefusal(helper, owner.uid)).toBeNull();
    expect(removalRefusal(helper, shelly.uid)).toBeNull();
  });

  it("refuses removing yourself", () => {
    expect(removalRefusal(shelly, shelly.uid)).toBe("You cannot remove yourself from the move.");
  });

  it("refuses removing the owner, whoever asks", () => {
    expect(removalRefusal(owner, shelly.uid)).toBe("Nathan set up the move and cannot be removed.");
    expect(removalRefusal(owner, helper.uid)).not.toBeNull();
  });

  it("refuses removing somebody already removed", () => {
    expect(removalRefusal({ ...helper, removedAt: "2026-11-01T00:00:00.000Z" }, owner.uid)).toBe(
      "Alex is already removed."
    );
  });
});
