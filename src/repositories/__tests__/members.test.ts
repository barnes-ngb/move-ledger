import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Move, MoveMember } from "../../domain";

/**
 * Removing a member, stubbed at the SDK boundary. What matters is what reaches
 * Firestore, which a test reading back the returned object cannot see:
 *
 * - their uid leaves `memberUids`, and nobody else's does;
 * - the member record is updated with `removedAt` alone and never deleted,
 *   because it holds the range and the watermark that keep their numbers from
 *   being handed out again;
 * - the two refusals happen before anything is written.
 */
const mocks = vi.hoisted(() => ({
  order: [] as string[],
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...parts: string[]) => parts.join("/"),
  doc: (ref: string, id: string) => `${ref}/${id}`,
  deleteDoc: mocks.deleteDoc,
  onSnapshot: vi.fn(),
  query: (ref: unknown) => ref,
  setDoc: mocks.setDoc,
  updateDoc: (ref: string, fields: unknown) => {
    mocks.order.push(ref);
    return mocks.updateDoc(ref, fields);
  },
  where: vi.fn(),
}));

vi.mock("../../lib/firebase", () => ({ db: {} }));

const { removeMember } = await import("../members");

const NOW = "2026-10-17T12:00:00.000Z";

const move: Move = {
  id: "m1",
  name: "KC to DFW",
  status: "packing",
  memberUids: ["u-nathan", "u-shelly", "u-alex"],
  createdAt: NOW,
  updatedAt: NOW,
};

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
  mocks.order.length = 0;
  mocks.updateDoc.mockResolvedValue(undefined);
});

describe("removeMember", () => {
  it("takes their uid out of memberUids and leaves everyone else", async () => {
    const result = removeMember("m1", member({}), move, "u-nathan");
    await result.written;
    const [ref, fields] = mocks.updateDoc.mock.calls[0]!;
    expect(ref).toBe("moves/m1");
    expect((fields as Move).memberUids).toEqual(["u-nathan", "u-shelly"]);
  });

  it("stamps removedAt as the only field on the member record, and deletes nothing", async () => {
    const result = removeMember("m1", member({}), move, "u-nathan");
    await result.written;
    const [ref, fields] = mocks.updateDoc.mock.calls[1]!;
    expect(ref).toBe("moves/m1/members/mem-alex");
    expect(Object.keys(fields as object)).toEqual(["removedAt"]);
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("removes access before it stamps the record", () => {
    removeMember("m1", member({}), move, "u-nathan");
    expect(mocks.order).toEqual(["moves/m1", "moves/m1/members/mem-alex"]);
  });

  it("hands back the record with its range and watermark intact", () => {
    const { value } = removeMember("m1", member({}), move, "u-shelly");
    expect(value.removedAt).toBeDefined();
    expect(value).toMatchObject({ numberRangeStart: 1000, numberRangeEnd: 1499, highestIssued: 1012 });
  });

  it("refuses removing yourself and writes nothing", () => {
    expect(() => removeMember("m1", member({}), move, "u-alex")).toThrow("You cannot remove yourself");
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it("refuses removing the owner and writes nothing", () => {
    const owner = member({ id: "mem-nathan", uid: "u-nathan", displayName: "Nathan", role: "owner" });
    expect(() => removeMember("m1", owner, move, "u-shelly")).toThrow("cannot be removed");
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it("refuses removing somebody already removed and writes nothing", () => {
    expect(() => removeMember("m1", member({ removedAt: NOW }), move, "u-nathan")).toThrow("already removed");
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});
