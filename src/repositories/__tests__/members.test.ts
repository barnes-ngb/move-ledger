import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent, MoveMember } from "../../domain";

/**
 * Removing a member, stubbed at the SDK boundary. What matters is what reaches
 * Firestore, which a test reading back the returned object cannot see:
 *
 * - all three writes go in ONE batch, so they land together or not at all;
 * - their uid leaves `memberUids` as an `arrayRemove`, never as a whole new
 *   array, so a membership change another phone made survives;
 * - the member record is updated with `removedAt` alone and never deleted,
 *   because it holds the range and the watermark that keep their numbers from
 *   being handed out again;
 * - a `member_removed` activity event names who removed them;
 * - the refusals happen before any batch is opened.
 */
const mocks = vi.hoisted(() => ({
  batches: 0,
  ops: [] as Array<[string, string, unknown]>,
  commit: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  arrayRemove: (...values: unknown[]) => ({ __arrayRemove: values }),
  arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
  collection: (_db: unknown, ...parts: string[]) => parts.join("/"),
  doc: (ref: string, id: string) => `${ref}/${id}`,
  deleteDoc: mocks.deleteDoc,
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: (ref: unknown) => ref,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  where: vi.fn(),
  writeBatch: () => {
    mocks.batches += 1;
    return {
      set: (ref: string, data: unknown) => void mocks.ops.push(["set", ref, data]),
      update: (ref: string, data: unknown) => void mocks.ops.push(["update", ref, data]),
      commit: mocks.commit,
    };
  },
}));

vi.mock("../../lib/firebase", () => ({ db: {} }));

const { addMemberToMove, removeMember } = await import("../members");

const NOW = "2026-10-17T12:00:00.000Z";

function member(over: Partial<MoveMember>): MoveMember {
  return {
    id: "mem-alex",
    moveId: "m1",
    uid: "u-alex",
    displayName: "Alex",
    role: "member",
    numberRangeStart: 1000,
    numberRangeEnd: 1499,
    highestIssued: 1012,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.batches = 0;
  mocks.ops.length = 0;
  mocks.commit.mockResolvedValue(undefined);
});

describe("removeMember", () => {
  it("sends all three writes in one batch and hands back its commit", async () => {
    const result = removeMember("m1", member({}), "u-nathan");
    expect(mocks.batches).toBe(1);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.ops.map(([op, ref]) => [op, ref.replace(/activity\/.*/, "activity/*")])).toEqual([
      ["update", "moves/m1"],
      ["update", "moves/m1/members/mem-alex"],
      ["set", "moves/m1/activity/*"],
    ]);
    await expect(result.written).resolves.toBeUndefined();
    // Nothing goes outside the batch.
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
  });

  it("takes their uid out of memberUids with arrayRemove rather than a whole array", () => {
    removeMember("m1", member({}), "u-nathan");
    const [, , fields] = mocks.ops[0]!;
    expect((fields as { memberUids: unknown }).memberUids).toEqual({ __arrayRemove: ["u-alex"] });
  });

  it("stamps removedAt as the only field on the member record", () => {
    removeMember("m1", member({}), "u-nathan");
    const [, , fields] = mocks.ops[1]!;
    expect(Object.keys(fields as object)).toEqual(["removedAt"]);
  });

  it("logs who removed them, with their range", () => {
    const result = removeMember("m1", member({}), "u-shelly");
    const [, , event] = mocks.ops[2]!;
    expect(event as ActivityEvent).toMatchObject({
      actorId: "u-shelly",
      type: "member_removed",
      occurredAt: result.value.removedAt,
      payload: { memberId: "mem-alex", uid: "u-alex", numberRangeStart: 1000, numberRangeEnd: 1499 },
    });
  });

  it("hands back the record with its range and watermark intact", () => {
    const { value } = removeMember("m1", member({}), "u-shelly");
    expect(value.removedAt).toBeDefined();
    expect(value).toMatchObject({ numberRangeStart: 1000, numberRangeEnd: 1499, highestIssued: 1012 });
  });

  it("refuses removing yourself before opening a batch", () => {
    expect(() => removeMember("m1", member({}), "u-alex")).toThrow("You cannot remove yourself");
    expect(mocks.batches).toBe(0);
  });

  it("refuses removing the owner before opening a batch", () => {
    const owner = member({ id: "mem-nathan", uid: "u-nathan", displayName: "Nathan", role: "owner" });
    expect(() => removeMember("m1", owner, "u-shelly")).toThrow("cannot be removed");
    expect(mocks.batches).toBe(0);
  });

  it("refuses removing somebody already removed before opening a batch", () => {
    expect(() => removeMember("m1", member({ removedAt: NOW }), "u-nathan")).toThrow("already removed");
    expect(mocks.batches).toBe(0);
  });
});

describe("addMemberToMove", () => {
  const nathan = member({ id: "mem-nathan", uid: "u-nathan", displayName: "Nathan", role: "owner", numberRangeStart: 1, numberRangeEnd: 499 });
  const shelly = member({ id: "mem-shelly", uid: "u-shelly", displayName: "Shelly", numberRangeStart: 500, numberRangeEnd: 999 });
  const helper = { uid: "u-alex", displayName: "Alex", role: "member" as const, numberRangeStart: 1000, numberRangeEnd: 1499 };

  it("writes their uid and their record in one batch, access first", async () => {
    const result = addMemberToMove("m1", helper, [nathan, shelly]);
    expect(mocks.batches).toBe(1);
    expect(mocks.ops.map(([op, ref]) => [op, ref.replace(/members\/.*/, "members/*")])).toEqual([
      ["update", "moves/m1"],
      ["set", "moves/m1/members/*"],
    ]);
    expect((mocks.ops[0]![2] as { memberUids: unknown }).memberUids).toEqual({ __arrayUnion: ["u-alex"] });
    expect(mocks.ops[1]![2]).toMatchObject({ ...helper, moveId: "m1", id: result.value.id });
    await expect(result.written).resolves.toBeUndefined();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("refuses an overlapping range before opening a batch", () => {
    expect(() => addMemberToMove("m1", { ...helper, numberRangeStart: 900, numberRangeEnd: 1399 }, [nathan, shelly])).toThrow(
      "overlaps Shelly's range"
    );
    expect(mocks.batches).toBe(0);
  });
});
