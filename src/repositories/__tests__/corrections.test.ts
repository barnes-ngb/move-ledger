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
  getDocsFromCache: vi.fn(),
  getDocs: vi.fn(),
  deleteObject: vi.fn(),
  deleteBlob: vi.fn(),
  deleteBlobsFor: vi.fn(),
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
  getDocs: mocks.getDocs,
  getDocsFromCache: mocks.getDocsFromCache,
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: (ref: unknown) => ref,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  where: vi.fn(),
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
  deleteBlobsFor: mocks.deleteBlobsFor,
}));

vi.mock("../../photos/uploader", () => ({
  clearBackoff: mocks.clearBackoff,
  kickUploader: mocks.kickUploader,
}));

const { deleteContainer, setContentsSummary, unvoidContainer, voidContainer } = await import(
  "../containers"
);
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

/**
 * Both reads answer, because the code asks the server first and falls back.
 * A test that cares which one answered sets them apart itself.
 */
function serve(container: Container) {
  mocks.getDoc.mockResolvedValue(snapshotOf(container));
  mocks.getDocFromCache.mockResolvedValue(snapshotOf(container));
}

beforeEach(() => {
  mocks.order.length = 0;
  vi.clearAllMocks();
  mocks.deleteDoc.mockResolvedValue(undefined);
  mocks.updateDoc.mockResolvedValue(undefined);
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.deleteBlob.mockResolvedValue(undefined);
  mocks.deleteBlobsFor.mockResolvedValue(undefined);
  mocks.getDocs.mockResolvedValue({ docs: [] });
  mocks.getDocsFromCache.mockResolvedValue({ docs: [] });
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
    serve(makeContainer({ status: "filling" }));

    await deleteContainer("m1", "c1", "uid-1");

    expect(mocks.deleteDoc).toHaveBeenCalledWith("moves/m1/containers/c1");
  });

  it("refuses a box that was already written on, even if the caller says otherwise", async () => {
    serve(makeContainer({ status: "filling", labelConfirmedAt: NOW }));

    await expect(deleteContainer("m1", "c1", "uid-1")).rejects.toThrow(ContainerNotDeletableError);
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
  });

  it("refuses a box past filling", async () => {
    serve(makeContainer({ status: "packed" }));

    await expect(deleteContainer("m1", "c1", "uid-1")).rejects.toThrow(ContainerNotDeletableError);
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
  });

  /**
   * The guard decides whether a number is free. The other phone can confirm a
   * label at any moment, so deciding that from this phone's cache when the
   * server is reachable is deciding it from a copy that may already be wrong.
   */
  it("asks the server before deciding a number is free", async () => {
    mocks.getDoc.mockResolvedValue(snapshotOf(makeContainer({ status: "filling" })));

    await deleteContainer("m1", "c1", "uid-1");

    expect(mocks.getDoc).toHaveBeenCalled();
    expect(mocks.getDocFromCache).not.toHaveBeenCalled();
  });

  it("falls back to the cache, so a draft can still be deleted with no signal", async () => {
    mocks.getDoc.mockRejectedValue(new Error("offline"));
    mocks.getDocFromCache.mockResolvedValue(snapshotOf(makeContainer({ status: "filling" })));

    await deleteContainer("m1", "c1", "uid-1");

    expect(mocks.deleteDoc).toHaveBeenCalledWith("moves/m1/containers/c1");
  });

  /**
   * Capture writes a photo document as soon as the shutter closes, which is
   * before the box is saved. So a box that is still a draft, and therefore the
   * only kind that can be deleted, is exactly the kind that can be holding
   * photos nothing else would ever clean up.
   */
  it("takes the box's photos with it", async () => {
    serve(makeContainer({ status: "filling" }));
    const { id: _p1, ...one } = makePhoto({ id: "p1", storagePath: "moves/m1/c1/p1.jpg" });
    const { id: _p2, ...two } = makePhoto({ id: "p2" });
    mocks.getDocs.mockResolvedValue({
      docs: [
        { id: "p1", data: () => one },
        { id: "p2", data: () => two },
      ],
    });

    await deleteContainer("m1", "c1", "uid-1");

    expect(mocks.deleteDoc).toHaveBeenCalledWith("moves/m1/photos/p1");
    expect(mocks.deleteDoc).toHaveBeenCalledWith("moves/m1/photos/p2");
    expect(mocks.deleteObject).toHaveBeenCalledWith("moves/m1/c1/p1.jpg");
    expect(mocks.deleteDoc).toHaveBeenCalledWith("moves/m1/containers/c1");
  });

  it("sweeps local bytes whose document never arrived", async () => {
    serve(makeContainer({ status: "filling" }));

    await deleteContainer("m1", "c1", "uid-1");

    expect(mocks.deleteBlobsFor).toHaveBeenCalledWith("c1");
  });

  /**
   * `container_created` was written when the number was reserved and cannot be
   * removed, so an export that stopped here would show a box appearing and
   * then nothing at all.
   */
  it("logs the deletion, so the history explains where the box went", async () => {
    serve(makeContainer({ status: "filling", sequenceNumber: 42, displayCode: "042" }));

    await deleteContainer("m1", "c1", "uid-1");

    const logged = mocks.setDoc.mock.calls.map((c) => c[1] as Record<string, unknown>);
    const event = logged.find((e) => e.type === "container_deleted");
    expect(event).toBeDefined();
    expect(event?.actorId).toBe("uid-1");
    expect(event?.payload).toMatchObject({ sequenceNumber: 42, displayCode: "042" });
  });

  it("logs no event for each photo it takes with it", async () => {
    serve(makeContainer({ status: "filling" }));
    const { id: _p1, ...one } = makePhoto({ id: "p1" });
    mocks.getDocs.mockResolvedValue({ docs: [{ id: "p1", data: () => one }] });

    await deleteContainer("m1", "c1", "uid-1");

    const logged = mocks.setDoc.mock.calls.map((c) => c[1] as { type?: string });
    expect(logged.some((e) => e.type === "photo_deleted")).toBe(false);
  });
});

describe("deletePhoto", () => {
  it("removes the object, then the document, then the local bytes", () => {
    deletePhoto("m1", makePhoto({ storagePath: "moves/m1/c1/p1.jpg" }), "uid-1");

    expect(mocks.order).toEqual(["storage", "firestore", "dexie"]);
  });

  it("skips Storage for a photo that never got there", () => {
    deletePhoto("m1", makePhoto(), "uid-1");

    expect(mocks.order).toEqual(["firestore", "dexie"]);
  });

  /**
   * The correction that produced this test. Awaiting the Storage delete held
   * the Firestore delete behind however long the Storage SDK spends retrying,
   * which offline is around two minutes of a deleted photo still on screen.
   */
  it("does not wait for Storage before removing the document", () => {
    mocks.deleteObject.mockReturnValue(new Promise(() => undefined));

    deletePhoto("m1", makePhoto({ storagePath: "moves/m1/c1/p1.jpg" }), "uid-1");

    // Same tick, with the Storage call still outstanding.
    expect(mocks.deleteDoc).toHaveBeenCalledWith("moves/m1/photos/p1");
    expect(mocks.deleteBlob).toHaveBeenCalledWith("p1");
  });

  it("keeps going when the object will not delete", async () => {
    mocks.deleteObject.mockRejectedValue(new Error("no signal"));

    await deletePhoto("m1", makePhoto({ storagePath: "moves/m1/c1/p1.jpg" }), "uid-1").written;

    // An orphaned object costs a fraction of a cent. A photo that will not go
    // away costs trust.
    expect(mocks.deleteDoc).toHaveBeenCalledWith("moves/m1/photos/p1");
    expect(mocks.deleteBlob).toHaveBeenCalledWith("p1");
  });

  it("logs the event", () => {
    deletePhoto("m1", makePhoto(), "uid-1");

    const logged = mocks.setDoc.mock.calls.map((c) => c[1] as { type?: string });
    expect(logged.some((e) => e.type === "photo_deleted")).toBe(true);
  });

  it("stops the uploader chasing bytes whose document is gone", () => {
    deletePhoto("m1", makePhoto(), "uid-1");

    expect(mocks.clearBackoff).toHaveBeenCalledWith("p1");
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

/**
 * The contents list, corrected after the fact. Search reads `searchText` and
 * nothing else, so a write that skipped the rebuild would leave a box coming
 * back for words it no longer holds, or not coming back for the ones it does.
 */
describe("setContentsSummary", () => {
  const zones = [
    {
      id: "z1",
      moveId: "m1",
      locationId: "l1",
      name: "Kitchen",
      shortCode: "KIT",
      colorName: "BLUE",
      colorValue: "#2563c9",
      sortOrder: 0,
    },
  ];

  const box = makeContainer({
    destinationZoneId: "z1",
    contentsSummary: "kettle and two mugs",
    searchText: "042 kettle and two mugs kitchen",
  });

  it("rebuilds searchText around the new text", () => {
    const result = setContentsSummary("m1", box, "kettle, two mugs, tea towels", zones, "uid-1");

    expect(result.value.contentsSummary).toBe("kettle, two mugs, tea towels");
    expect(result.value.searchText).toBe("042 kettle, two mugs, tea towels kitchen");
    expect(result.value.searchText).not.toContain("and two mugs kitchen");
  });

  it("keeps the room name in searchText, since the room is one of the things searched", () => {
    const result = setContentsSummary("m1", box, "winter boots", zones, "uid-1");

    expect(result.value.searchText).toContain("kitchen");
  });

  it("sends a delete sentinel when the list is emptied, because an absent key leaves it stored", () => {
    const result = setContentsSummary("m1", box, "   ", zones, "uid-1");

    expect("contentsSummary" in result.value).toBe(false);
    expect(result.value.searchText).toBe("042 kitchen");
    const fields = lastUpdate();
    expect(fields.contentsSummary).toBe(DELETE_FIELD);
    expect(Object.values(fields)).not.toContain(undefined);
  });

  it("stamps who changed it", () => {
    const result = setContentsSummary("m1", box, "winter boots", zones, "uid-9");

    expect(result.value.updatedBy).toBe("uid-9");
  });
});
