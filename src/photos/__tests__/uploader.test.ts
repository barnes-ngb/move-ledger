import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cloud Storage and Firestore are both replaced by the injected dependencies
 * `drainOnce` takes, which is why that seam exists. Only the module import
 * needs a stub: `uploader.ts` reaches for the live SDK handles at load time
 * and a unit test must not touch a real project.
 */
vi.mock("../../lib/firebase", () => ({ storage: {}, db: {}, auth: {}, app: {} }));

import type { PhotoBlob } from "../db";

const { BACKOFF_MS, MAX_ATTEMPTS, MAX_CONCURRENT, drainOnce, __resetUploaderState } = await import(
  "../uploader"
);

function blob(photoId: string, createdAt: string): PhotoBlob {
  return {
    photoId,
    moveId: "move-1",
    containerId: "box-1",
    blob: new Blob([photoId]),
    createdAt,
  };
}

const result = { storagePath: "moves/move-1/box-1/x.jpg", downloadUrl: "https://example/x.jpg" };

/** Every dependency recorded, each one overridable per test. */
function deps(over: Partial<Parameters<typeof drainOnce>[0]> = {}) {
  const calls = { uploaded: [] as string[], confirmed: [] as string[], removed: [] as string[] };
  const failures: Array<{ photoId: string; attempts: number }> = [];
  const base = {
    list: async () => [] as PhotoBlob[],
    upload: async (b: PhotoBlob) => {
      calls.uploaded.push(b.photoId);
      return result;
    },
    confirm: async (b: PhotoBlob) => {
      calls.confirmed.push(b.photoId);
    },
    fail: async (b: PhotoBlob, attempts: number) => {
      failures.push({ photoId: b.photoId, attempts });
    },
    remove: async (photoId: string) => {
      calls.removed.push(photoId);
    },
  };
  return { deps: { ...base, ...over }, calls, failures };
}

describe("drainOnce", () => {
  beforeEach(() => {
    __resetUploaderState();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("asks for a contents list only after the blob is gone", async () => {
    const order: string[] = [];
    const d = deps({
      list: async () => [blob("p1", "2026-08-15T10:00:01.000Z")],
      confirm: async () => {
        order.push("confirm");
      },
      remove: async () => {
        order.push("remove");
      },
      afterUpload: () => {
        order.push("summary");
      },
    });

    await drainOnce(d.deps);

    // The summary is the least important thing here. Doc 06 deletes the blob
    // only once the metadata write confirms, and nothing about the contents
    // list may come before either step.
    expect(order).toEqual(["confirm", "remove", "summary"]);
  });

  it("treats a failed contents list as a successful upload", async () => {
    const d = deps({
      list: async () => [blob("p1", "2026-08-15T10:00:01.000Z")],
      afterUpload: () => {
        throw new Error("callable unreachable");
      },
    });

    await drainOnce(d.deps);

    // The photo is in Cloud Storage and the blob is gone. If this counted as a
    // failure the uploader would retry an upload that already succeeded, and
    // the packing path would be held hostage by a Phase 3 feature.
    expect(d.calls.removed).toEqual(["p1"]);
    expect(d.failures).toEqual([]);
  });

  it("does not ask for a contents list when the upload failed", async () => {
    const asked: string[] = [];
    const d = deps({
      list: async () => [blob("p1", "2026-08-15T10:00:01.000Z")],
      upload: async () => {
        throw new Error("offline");
      },
      afterUpload: (b) => {
        asked.push(b.photoId);
      },
    });

    await drainOnce(d.deps);

    expect(asked).toEqual([]);
  });

  it("uploads in creation order", async () => {
    const queue = [blob("third", "2026-08-15T10:00:03.000Z"), blob("first", "2026-08-15T10:00:01.000Z")];
    // The queue arrives sorted by createdAt from Dexie. What is asserted here
    // is that the uploader takes the front of that list rather than reordering
    // it, because a person expects their photos back in the order taken.
    const sorted = [...queue].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const d = deps({ list: async () => sorted });

    await drainOnce(d.deps);

    expect(d.calls.uploaded).toEqual(["first", "third"]);
  });

  it("never runs more than MAX_CONCURRENT uploads at once", async () => {
    const queue = ["a", "b", "c", "d", "e"].map((id, i) =>
      blob(id, `2026-08-15T10:00:0${i}.000Z`)
    );
    let live = 0;
    let peak = 0;
    const d = deps({
      list: async () => queue,
      upload: async () => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 5));
        live -= 1;
        return result;
      },
    });

    await drainOnce(d.deps);

    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT);
    expect(peak).toBe(MAX_CONCURRENT);
  });

  it("takes only MAX_CONCURRENT of a longer queue in one pass", async () => {
    const queue = ["a", "b", "c"].map((id, i) => blob(id, `2026-08-15T10:00:0${i}.000Z`));
    const d = deps({ list: async () => queue });

    await drainOnce(d.deps);

    expect(d.calls.uploaded).toEqual(["a", "b"]);
  });

  it("leaves the blob in place and counts the attempt when an upload fails", async () => {
    const queue = [blob("a", "2026-08-15T10:00:00.000Z")];
    const d = deps({
      list: async () => queue,
      upload: async () => {
        throw new Error("no signal");
      },
    });

    await drainOnce(d.deps);

    expect(d.calls.removed).toEqual([]);
    expect(d.calls.confirmed).toEqual([]);
    expect(d.failures).toEqual([{ photoId: "a", attempts: 1 }]);
  });

  it("counts attempts across passes and marks the record failed past the ladder", async () => {
    const queue = [blob("a", "2026-08-15T10:00:00.000Z")];
    let clock = 0;
    const d = deps({
      list: async () => queue,
      upload: async () => {
        throw new Error("no signal");
      },
      now: () => clock,
    });

    // Each pass is run after its back-off has elapsed, so the ladder is what
    // decides how many attempts a photo gets rather than how often the app
    // happens to kick the uploader.
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await drainOnce(d.deps);
      clock += BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)]!;
    }

    expect(d.failures.map((f) => f.attempts)).toEqual([1, 2, 3, 4, 5]);
    expect(d.failures.at(-1)!.attempts).toBe(MAX_ATTEMPTS);
  });

  it("holds a photo back until its back-off has elapsed", async () => {
    const queue = [blob("a", "2026-08-15T10:00:00.000Z")];
    let clock = 0;
    const d = deps({
      list: async () => queue,
      upload: async () => {
        throw new Error("no signal");
      },
      now: () => clock,
    });

    await drainOnce(d.deps);
    await drainOnce(d.deps); // immediately again, inside the first 2s step

    expect(d.failures).toHaveLength(1);

    clock = BACKOFF_MS[0];
    await drainOnce(d.deps);

    expect(d.failures).toHaveLength(2);
  });

  it("removes the blob only after confirm resolves", async () => {
    const queue = [blob("a", "2026-08-15T10:00:00.000Z")];
    const order: string[] = [];
    const d = deps({
      list: async () => queue,
      confirm: async () => {
        await new Promise((r) => setTimeout(r, 5));
        order.push("confirm");
      },
      remove: async () => {
        order.push("remove");
      },
    });

    await drainOnce(d.deps);

    expect(order).toEqual(["confirm", "remove"]);
  });

  it("keeps the blob when the metadata write fails after a successful upload", async () => {
    // The blob outliving its upload is recoverable. The reverse is a photo
    // that exists nowhere, which is the one outcome ADR-0004 forbids.
    const queue = [blob("a", "2026-08-15T10:00:00.000Z")];
    const d = deps({
      list: async () => queue,
      confirm: async () => {
        throw new Error("write rejected");
      },
    });

    await drainOnce(d.deps);

    expect(d.calls.uploaded).toEqual(["a"]);
    expect(d.calls.removed).toEqual([]);
    expect(d.failures).toEqual([{ photoId: "a", attempts: 1 }]);
  });
});
