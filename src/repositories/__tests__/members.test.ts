import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent, MoveMember } from "../../domain";

/**
 * Removing a member, stubbed at the SDK boundary. What matters is what reaches
 * Firestore, which a test reading back the returned object cannot see:
 *
 * - their uid leaves `memberUids` as an `arrayRemove`, never as a whole new
 *   array, so a membership change another phone made survives;
 * - the member record is updated with `removedAt` alone and never deleted,
 *   because it holds the range and the watermark that keep their numbers from
 *   being handed out again;
 * - a `member_removed` activity event names who removed them;
 * - the refusals happen before anything is written.
 */
const mocks = vi.hoisted(() => ({
  order: [] as string[],
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

/** Stand-ins for the array sentinels. Shape is all the assertions need. */
vi.mock("firebase/firestore", () => ({
  arrayRemove: (...values: unknown[]) => ({ __arrayRemove: values }),
  arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
  collection: (_db: unknown, ...parts: string[]) => parts.join("/"),
  doc: (ref: string, id: string) => `${ref}/${id}`,
  deleteDoc: mocks.deleteDoc,
  onSnapshot: vi.fn(),
  query: (ref: unknown) => ref,
  setDoc: (ref: string, data: unknown) => {
    mocks.order.push(ref.split("/").slice(0, 3).join("/"));
    return mocks.setDoc(ref, data);
  },
  orderBy: vi.fn(),
  updateDoc: (ref: string, fields: unknown) => {
    mocks.order.push(ref);
    return mocks.updateDoc(ref, fields);
  },
  where: vi.fn(),
}));

vi.mock("../../lib/firebase", () => ({ db: {} }));

const { removeMember } = await import("../members");

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
  mocks.order.length = 0;
  mocks.updateDoc.mockResolvedValue(undefined);
  mocks.setDoc.mockResolvedValue(undefined);
});

describe("removeMember", () => {
  it("takes their uid out of memberUids with arrayRemove rather than a whole array", async () => {
    const result = removeMember("m1", member({}), "u-nathan");
    await result.written;
    const [ref, fields] = mocks.updateDoc.mock.calls[0]!;
    expect(ref).toBe("moves/m1");
    expect((fields as { memberUids: unknown }).memberUids).toEqual({ __arrayRemove: ["u-alex"] });
  });

  it("logs who removed them, with their range", async () => {
    const result = removeMember("m1", member({}), "u-shelly");
    await result.written;
    const [ref, event] = mocks.setDoc.mock.calls[0]!;
    expect(ref).toMatch(/^moves\/m1\/activity\//);
    expect(event as ActivityEvent).toMatchObject({
      actorId: "u-shelly",
      type: "member_removed",
      occurredAt: result.value.removedAt,
      payload: { memberId: "mem-alex", uid: "u-alex", numberRangeStart: 1000, numberRangeEnd: 1499 },
    });
  });

  it("stamps removedAt as the only field on the member record, and deletes nothing", async () => {
    const result = removeMember("m1", member({}), "u-nathan");
    await result.written;
    const [ref, fields] = mocks.updateDoc.mock.calls[1]!;
    expect(ref).toBe("moves/m1/members/mem-alex");
    expect(Object.keys(fields as object)).toEqual(["removedAt"]);
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
    // The only document created is the activity event, never a member record.
    expect(mocks.setDoc.mock.calls.map(([r]) => r).every((r) => String(r).startsWith("moves/m1/activity/"))).toBe(true);
  });

  it("removes access before it stamps the record", () => {
    removeMember("m1", member({}), "u-nathan");
    expect(mocks.order).toEqual(["moves/m1", "moves/m1/members/mem-alex", "moves/m1/activity"]);
  });

  it("hands back the record with its range and watermark intact", () => {
    const { value } = removeMember("m1", member({}), "u-shelly");
    expect(value.removedAt).toBeDefined();
    expect(value).toMatchObject({ numberRangeStart: 1000, numberRangeEnd: 1499, highestIssued: 1012 });
  });

  it("refuses removing yourself and writes nothing", () => {
    expect(() => removeMember("m1", member({}), "u-alex")).toThrow("You cannot remove yourself");
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("refuses removing the owner and writes nothing", () => {
    const owner = member({ id: "mem-nathan", uid: "u-nathan", displayName: "Nathan", role: "owner" });
    expect(() => removeMember("m1", owner, "u-shelly")).toThrow("cannot be removed");
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("refuses removing somebody already removed and writes nothing", () => {
    expect(() => removeMember("m1", member({ removedAt: NOW }), "u-nathan")).toThrow("already removed");
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});
