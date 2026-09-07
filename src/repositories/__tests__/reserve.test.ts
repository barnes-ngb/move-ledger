import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Container, MoveMember } from "../../domain";
import { makeContainer } from "../../domain/__tests__/factories";

/**
 * The reservation, stubbed at the SDK boundary. Two things here are invisible
 * to a type checker and to any test that reads only the returned container:
 *
 * - the member's watermark counts as a used number, so a reservation against
 *   an empty list still lands above everything that member has ever been
 *   handed. Production issued number 1 twice before this was true;
 * - the container and the watermark go to Firestore in one batch, never as
 *   two writes, because a crash between them is exactly the hole.
 */
const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  update: vi.fn(),
  commit: vi.fn(),
  batches: 0,
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...parts: string[]) => parts.join("/"),
  doc: (ref: string, id: string) => `${ref}/${id}`,
  deleteField: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocFromCache: vi.fn(),
  getDocs: vi.fn(),
  getDocsFromCache: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: (ref: unknown) => ref,
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: () => {
    mocks.batches += 1;
    return { set: mocks.set, update: mocks.update, commit: mocks.commit };
  },
}));

vi.mock("../../lib/firebase", () => ({ db: {}, storage: {} }));
vi.mock("../../photos/db", () => ({ deleteBlob: vi.fn(), deleteBlobsFor: vi.fn() }));
vi.mock("../../photos/uploader", () => ({ clearBackoff: vi.fn(), kickUploader: vi.fn() }));

const { reserveContainer } = await import("../containers");

const nathan: MoveMember = {
  id: "mem-nathan",
  moveId: "m1",
  uid: "uid-nathan",
  displayName: "Nathan",
  role: "owner",
  numberRangeStart: 1,
  numberRangeEnd: 499,
};

function numbers(...ns: number[]): Container[] {
  return ns.map((n) => makeContainer({ id: `c${n}`, sequenceNumber: n }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.batches = 0;
  mocks.commit.mockResolvedValue(undefined);
});

describe("reserveContainer", () => {
  it("counts from the highest known number when there is no watermark", () => {
    const { value } = reserveContainer("m1", nathan, numbers(1, 2, 3), "uid-nathan");
    expect(value.sequenceNumber).toBe(4);
    expect(value.displayCode).toBe("004");
    expect(value.status).toBe("filling");
  });

  /**
   * The incident. The list is empty because the listener has not delivered,
   * or because this is a fresh install; either way the member document says
   * what has been handed out and the count continues from there.
   */
  it("counts past the watermark when the list is empty", () => {
    const { value } = reserveContainer("m1", { ...nathan, highestIssued: 17 }, [], "uid-nathan");
    expect(value.sequenceNumber).toBe(18);
  });

  it("takes the higher of the list and the watermark", () => {
    const behind = reserveContainer("m1", { ...nathan, highestIssued: 5 }, numbers(1, 9), "uid-nathan");
    expect(behind.value.sequenceNumber).toBe(10);
    const ahead = reserveContainer("m1", { ...nathan, highestIssued: 12 }, numbers(1, 9), "uid-nathan");
    expect(ahead.value.sequenceNumber).toBe(13);
  });

  it("treats an absent watermark as nothing reserved", () => {
    const { value } = reserveContainer("m1", nathan, [], "uid-nathan");
    expect(value.sequenceNumber).toBe(1);
  });

  it("counts past a voided box, which stays in the list", () => {
    const voided = makeContainer({ id: "c1", sequenceNumber: 1, voidedAt: "2026-09-01T00:00:00.000Z" });
    const { value } = reserveContainer("m1", nathan, [voided], "uid-nathan");
    expect(value.sequenceNumber).toBe(2);
  });

  it("writes the container, the watermark, and the event in one batch", () => {
    const { value, written } = reserveContainer("m1", { ...nathan, highestIssued: 41 }, [], "uid-nathan");

    expect(mocks.batches).toBe(1);
    expect(mocks.set).toHaveBeenCalledTimes(2);
    expect(mocks.set).toHaveBeenCalledWith(`moves/m1/containers/${value.id}`, value);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith("moves/m1/members/mem-nathan", { highestIssued: 42 });
    expect(mocks.commit).toHaveBeenCalledTimes(1);

    const event = mocks.set.mock.calls.find(([path]) => String(path).startsWith("moves/m1/activity/"))?.[1];
    expect(event).toMatchObject({
      type: "container_created",
      containerId: value.id,
      actorId: "uid-nathan",
      payload: { sequenceNumber: 42 },
    });
    // The batch's own promise is what the screen hands to the background.
    return expect(written).resolves.toBeUndefined();
  });

  it("throws before any batch is opened when the range is spent", () => {
    const narrow = { ...nathan, numberRangeStart: 1, numberRangeEnd: 2, highestIssued: 2 };
    expect(() => reserveContainer("m1", narrow, [], "uid-nathan")).toThrow();
    expect(mocks.batches).toBe(0);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
