import { afterEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { collection, disableNetwork, doc, getFirestore, onSnapshot, writeBatch } from "firebase/firestore";
import { z } from "zod";
import { createValidated, updateValidated } from "../shared";

/**
 * The defect this file exists for, run against the real SDK rather than a
 * stub, because the whole claim is about SDK behavior.
 *
 * A Firestore write promise settles when the server acknowledges the write.
 * The local cache is updated first and listeners fire immediately, so offline
 * the data is there and the promise is not. Anything that awaited one of those
 * promises for its own progress hung: Add box showed "..." for the number and
 * kept both Save buttons disabled for as long as the phone had no signal.
 *
 * No project is contacted. `disableNetwork` is called before the first write,
 * so the SDK never opens a connection and the fake project id is never used
 * for anything.
 */
const schema = z.object({ id: z.string().min(1), n: z.number() });

let app: FirebaseApp | undefined;
let created = 0;

async function offlineCollection() {
  created += 1;
  app = initializeApp({ projectId: `offline-writes-${created}`, apiKey: "test", appId: "test" }, `offline-${created}`);
  const db = getFirestore(app);
  await disableNetwork(db);
  return collection(db, "things");
}

/**
 * "Never settles" is not observable from a test. What is observable is that it
 * has not settled while the app has already moved on, which is the only thing
 * the interface cares about.
 */
function settledWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  return Promise.race([
    work.then(() => true).catch(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}

afterEach(async () => {
  if (app) await deleteApp(app);
  app = undefined;
});

describe("writes with the network down", () => {
  it("hands back the created document without waiting for the server", async () => {
    const ref = await offlineCollection();

    const write = createValidated(ref, schema, { id: "box-1", n: 42 });

    // This is what Add box puts on screen. It is available synchronously.
    expect(write.value).toEqual({ id: "box-1", n: 42 });
    expect(await settledWithin(write.written, 300)).toBe(false);
  }, 20_000);

  it("hands back the updated document without waiting for the server", async () => {
    const ref = await offlineCollection();

    createValidated(ref, schema, { id: "box-1", n: 1 });
    const update = updateValidated(ref, schema, { id: "box-1", n: 2 });

    expect(update.value).toEqual({ id: "box-1", n: 2 });
    expect(await settledWithin(update.written, 300)).toBe(false);
  }, 20_000);

  it("delivers the write to a listener while the server has not seen it", async () => {
    const ref = await offlineCollection();
    const seen: Array<{ id: string; n: number }> = [];
    const stop = onSnapshot(collection(ref.firestore, "things"), (snap) => {
      snap.docs.forEach((d) => seen.push({ id: d.id, n: d.data().n as number }));
    });

    const write = createValidated(ref, schema, { id: "box-2", n: 7 });
    await new Promise((r) => setTimeout(r, 100));
    stop();

    // The subscriptions the screens read from fire on the local write. That is
    // what makes not awaiting `written` safe rather than merely faster.
    expect(seen).toContainEqual({ id: "box-2", n: 7 });
    expect(await settledWithin(write.written, 300)).toBe(false);
  }, 20_000);

  /**
   * `reserveContainer` writes the container and the member's watermark as one
   * batch. The claim that lets it do that offline is that a batch queues like
   * a single write: applied to the cache at once, delivered to listeners at
   * once, and settled on the server later. Asserted against the real SDK for
   * the same reason the rest of this file is.
   */
  it("applies a batch to the cache as a whole while the server has not seen it", async () => {
    const ref = await offlineCollection();
    const seen: string[] = [];
    const stop = onSnapshot(collection(ref.firestore, "things"), (snap) => {
      seen.push(snap.docs.map((d) => `${d.id}=${d.data().n}`).sort().join(","));
    });

    const batch = writeBatch(ref.firestore);
    batch.set(doc(ref, "box-3"), { n: 3 });
    batch.set(doc(ref, "member"), { n: 3 });
    const committed = batch.commit();
    await new Promise((r) => setTimeout(r, 100));
    stop();

    // Both documents arrive in one snapshot. There is no delivery with the
    // container and not the watermark.
    expect(seen).toContain("box-3=3,member=3");
    expect(seen.some((s) => s === "box-3=3" || s === "member=3")).toBe(false);
    expect(await settledWithin(committed, 300)).toBe(false);
  }, 20_000);

  it("rejects a document that fails its schema before anything is queued", async () => {
    const ref = await offlineCollection();

    // Validation is still synchronous and still throws. Offline changed where
    // the wait went, not whether a bad document can reach Firestore.
    expect(() => createValidated(ref, schema, { id: "", n: 1 })).toThrow();
  }, 20_000);
});
