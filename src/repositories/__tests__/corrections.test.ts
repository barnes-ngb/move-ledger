import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Container, ContainerPhoto } from "../../domain";

/**
 * The correction paths, stubbed at the SDK boundary. Two of the three defects
 * these guard are invisible to a type checker and to any test that only reads
 * back the returned object:
 *
 * - clearing an optional field has to reach Firestore as a `deleteField`
 *   sentinel, because a key merely left out of an update leaves the stored
 *   value in place and the box comes back still voided;
 * - `deleteContainer` has to refuse a box whose number was written on
 *   cardboard, reading the stored document rather than trusting its caller.
 *
 * The third is ordering inside `deletePhoto`, which is asserted by recording
 * the calls rather than by inspecting a result.
 */
const mocks = vi.hoisted(() => ({
  order: [] as string[],
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  getDocFromCache: vi.fn(),
  getDoc: vi.fn(),
  deleteObject: vi.fn(),
  deleteBlob: vi.fn(),
  clearBackoff: vi.fn(),
  kickUploader: vi.fn(),
}));

/** A stand-in for the sentinel. Identity is all the assertions need. */
const DELETE_FIELD = { __sentinel: "delete" };

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...parts: string[]) => parts.join("/"),
  doc: (ref: string, id: string) => `${ref}/${id}`,
  deleteField: () => DELETE_FIELD,
  deleteDoc: (...args: unknown[]) => {
    mocks.order.push("firestore");
    return mocks.deleteDoc(...args);
  },
  getDoc: mocks.getDoc,
  getDocFromCache: mocks.getDocFromCache,
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: (ref: unknown) => ref,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
}));

vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => path,
  deleteObject: (...args: unknown[]) => {
    mocks.order.push("storage");
    return mocks.deleteObject(...args);
  },
}));

vi.mock("../../lib/firebase", () => ({ db: {}, storage: {} }));

vi.mock("../../photos/db", () => ({
  deleteBlob: (...args: unknown[]) => {
    mocks.order.push("dexie");
    return mocks.deleteBlob(...args);
  },
}));

vi.mock("../../photos/uploader", () => ({
  clearBackoff: mocks.clearBackoff,
  kickUploader: mocks.kickUploader,
}));

const { deleteContainer, unvoidContainer, voidContainer } = await import("../containers");
const { deletePhoto, retryUpload } = await import("../photos");
const { ContainerNotDeletableError } = await import("../../domain/lifecycle");

const NOW = "2026-08-15T12:00:00.000Z";

function makeContainer(over: Partial<Container> = {}): Container {
  return {
    id: "c1",
    moveId: "m1",
    sequenceNumber: 42,
    displayCode: "042",
    type: "box",
    ownerMemberId: "mem1",
    status: "packed",
    unpackPriority: "normal",
    flags: {
      fragile: false,
      heavy: false,
      keepUpright: false,
      doNotStack: false,
      containsLiquids: false,
      temperatureSensitive: false,
      highValue: false,
      importantDocuments: false,
    },
    conditions: {},
    createdAt: NOW,
    createdBy: "mem1",
    updatedAt: NOW,
    updatedBy: "mem1",
    searchText: "042",
    ...over,
  };
}

function makePhoto(over: Partial<ContainerPhoto> = {}): ContainerPhoto {
  return {
    id: "p1",
    moveId: "m1",
    containerId: "c1",
    type: "contents",
    width: 1600,
    height: 1200,
    bytes: 200_000,
    uploadState: "failed",
    attempts: 5,
    createdAt: NOW,
    createdBy: "mem1",
    ...over,
  };
}

/** The fields half of the last `updateDoc` call. */
function lastUpdate(): Record<string, unknown> {
  return mocks.updateDoc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
}

function snapshotOf(container: Container) {
  const { id, ...data } = container;
  return { exists: () => true, id, data: () => data };
}

beforeEach(() => {
  mocks.order.length = 0;
  vi.clearAllMocks();
  mocks.deleteDoc.mockResolvedValue(undefined);
  mocks.updateDoc.mockResolvedValue(undefined);
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.deleteBlob.mockResolvedValue(undefined);
});

describe("voidContainer", () => {
  it("stamps the box and leaves the document in the collection", () => {
    const result = voidContainer("m1", makeContainer(), "uid-1");

    expect(result.value.voidedBy).toBe("uid-1");
    expect(result.value.voidedAt).toEqual(expect.any(String));
    // The number is still in the collection, which is the whole point.
    expect(result.value.sequenceNumber).toBe(42);
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
  });

  it("logs the event", () => {
    voidContainer("m1", makeContainer(), "uid-1");

    const logged = mocks.setDoc.mock.calls.map((c) => c[1] as { type?: string });
    expect(logged.some((e) => e.type === "container_voided")).toBe(true);
  });
});

describe("unvoidContainer", () => {
  const voided = makeContainer({ voidedAt: NOW, voidedBy: "uid-1" });

  it("drops the keys from the returned document rather than setting undefined", () => {
    const result = unvoidContainer("m1", voided, "uid-2");

    expect("voidedAt" in result.value).toBe(false);
    expect("voidedBy" in result.value).toBe(false);
  });

  it("sends a delete sentinel, because an absent key would leave the stamp stored", () => {
    unvoidContainer("m1", voided, "uid-2");

    const fields = lastUpdate();
    expect(fields.voidedAt).toBe(DELETE_FIELD);
    expect(fields.voidedBy).toBe(DELETE_FIELD);
    expect(Object.values(fields)).not.toContain(undefined);
  });

  it("logs the event", () => {
    unvoidContainer("m1", voided, "uid-2");

    const logged = mocks.setDoc.mock.calls.map((c) => c[1] as { type?: string });
    expect(logged.some((e) => e.type === "container_unvoided")).toBe(true);
  });
});

describe("deleteContainer", () => {
  it("deletes a draft whose number was never written down", async () => {
    mocks.getDocFromCache.mockResolvedValue(snapshotOf(makeContainer({ status: "filling" })));

    await deleteContainer("m1", "c1");

    expect(mocks.deleteDoc).toHaveBeenCalledWith("moves/m1/containers/c1");
  });

  it("refuses a box that was already written on, even if the caller says otherwise", async () => {
    mocks.getDocFromCache.mockResolvedValue(
      snapshotOf(makeContainer({ status: "filling", labelConfirmedAt: NOW }))
    );

    await expect(deleteContainer("m1", "c1")).rejects.toThrow(ContainerNotDeletableError);
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
  });

  it("refuses a box past filling", async () => {
    mocks.getDocFromCache.mockResolvedValue(snapshotOf(makeContainer({ status: "packed" })));

    await expect(deleteContainer("m1", "c1")).rejects.toThrow(ContainerNotDeletableError);
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
  });

  it("reads from the cache, so it works with no signal", async () => {
    mocks.getDocFromCache.mockResolvedValue(snapshotOf(makeContainer({ status: "filling" })));

    await deleteContainer("m1", "c1");

    expect(mocks.getDoc).not.toHaveBeenCalled();
  });
});

describe("deletePhoto", () => {
  it("removes the object, then the document, then the local bytes", async () => {
    await deletePhoto("m1", makePhoto({ storagePath: "moves/m1/c1/p1.jpg" }));

    expect(mocks.order).toEqual(["storage", "firestore", "dexie"]);
  });

  it("skips Storage for a photo that never got there", async () => {
    await deletePhoto("m1", makePhoto());

    expect(mocks.order).toEqual(["firestore", "dexie"]);
  });

  it("still removes the document and the bytes when the object will not delete", async () => {
    mocks.deleteObject.mockRejectedValue(new Error("no signal"));

    await deletePhoto("m1", makePhoto({ storagePath: "moves/m1/c1/p1.jpg" }));

    // An orphaned object costs a fraction of a cent. A photo that will not go
    // away costs trust.
    expect(mocks.deleteDoc).toHaveBeenCalledWith("moves/m1/photos/p1");
    expect(mocks.deleteBlob).toHaveBeenCalledWith("p1");
  });
});

describe("retryUpload", () => {
  it("puts the record back to pending with the attempt count cleared", () => {
    const result = retryUpload("m1", makePhoto({ lastError: "network" }));

    expect(result.value.uploadState).toBe("pending");
    expect(result.value.attempts).toBe(0);
    expect("lastError" in result.value).toBe(false);
  });

  it("sends a delete sentinel for lastError rather than leaving it stored", () => {
    retryUpload("m1", makePhoto({ lastError: "network" }));

    expect(lastUpdate().lastError).toBe(DELETE_FIELD);
  });

  it("forgets the back-off and kicks the queue, because retry means try now", () => {
    retryUpload("m1", makePhoto({ lastError: "network" }));

    expect(mocks.clearBackoff).toHaveBeenCalledWith("p1");
    expect(mocks.kickUploader).toHaveBeenCalled();
  });
});
