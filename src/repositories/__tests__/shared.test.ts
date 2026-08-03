import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * Firestore is stubbed at the SDK boundary rather than run for real. That is
 * worth doing here and nowhere else in this file's neighborhood, because the
 * defect being guarded is exactly what `subscribeValidated` hands to
 * `onSnapshot`. A live Firestore cannot be made to deny a listener on demand
 * from a unit test, and the emulator suite is a separate runner that needs a
 * JRE. What the stub asserts is a real contract: the SDK calls the third
 * argument when a listener dies, and before this change there was no third
 * argument.
 */
const mocks = vi.hoisted(() => ({ onSnapshot: vi.fn() }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: mocks.onSnapshot,
  query: (ref: unknown) => ref,
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

const { serverConfirmed, subscribeValidated } = await import("../shared");

const schema = z.object({ id: z.string(), n: z.number() });
const ref = {} as never;

/** What the SDK was handed on the last call. Options sit second in this overload. */
function lastCall() {
  const call = mocks.onSnapshot.mock.calls.at(-1) as [
    unknown,
    { includeMetadataChanges: boolean },
    (s: unknown) => void,
    (e: unknown) => void,
  ];
  return { options: call[1], onNext: call[2], onError: call[3] };
}

function snapshot(
  docs: Array<{ id: string; body: unknown }>,
  metadata = { fromCache: false, hasPendingWrites: false }
) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.body })), metadata };
}

describe("subscribeValidated", () => {
  beforeEach(() => {
    mocks.onSnapshot.mockReset();
    mocks.onSnapshot.mockReturnValue(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("gives onSnapshot an error callback", () => {
    subscribeValidated(ref, schema, () => undefined);
    expect(typeof lastCall().onError).toBe("function");
  });

  it("routes a stopped listener to onError and never to onData", () => {
    const onData = vi.fn();
    const onError = vi.fn();
    const denied = { code: "permission-denied" };

    subscribeValidated(ref, schema, onData, { onError });
    lastCall().onError(denied);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(denied);
    expect(onData).not.toHaveBeenCalled();
  });

  it("logs the reason even when a caller handles the failure", () => {
    subscribeValidated(ref, schema, () => undefined, { onError: () => undefined });
    lastCall().onError({ code: "unavailable" });
    expect(console.error).toHaveBeenCalled();
  });

  it("logs the reason when no caller handles the failure", () => {
    subscribeValidated(ref, schema, () => undefined);
    expect(() => lastCall().onError({ code: "unavailable" })).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  it("keeps a bad document separate from a stopped listener", () => {
    const onData = vi.fn();
    const onBadDoc = vi.fn();
    const onError = vi.fn();

    subscribeValidated(ref, schema, onData, { onBadDoc, onError });
    lastCall().onNext(snapshot([{ id: "good", body: { n: 1 } }, { id: "bad", body: { n: "nope" } }]));

    expect(onBadDoc).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onData).toHaveBeenCalledWith([{ id: "good", n: 1 }], expect.anything());
  });

  it("passes the snapshot origin to onData", () => {
    const onData = vi.fn();

    subscribeValidated(ref, schema, onData);
    lastCall().onNext(snapshot([{ id: "a", body: { n: 1 } }], { fromCache: true, hasPendingWrites: true }));

    expect(onData).toHaveBeenCalledWith([{ id: "a", n: 1 }], {
      fromCache: true,
      hasPendingWrites: true,
    });
  });

  it("watches metadata only when a caller asks for it", () => {
    subscribeValidated(ref, schema, () => undefined);
    expect(lastCall().options.includeMetadataChanges).toBe(false);

    // Without this, the acknowledgement of a local write changes no document
    // and Firestore raises no snapshot, so a caller waiting for the server
    // waits forever.
    subscribeValidated(ref, schema, () => undefined, { watchMetadata: true });
    expect(lastCall().options.includeMetadataChanges).toBe(true);
  });
});

describe("serverConfirmed", () => {
  it("is true only when the server has answered and holds no unsent write", () => {
    expect(serverConfirmed({ fromCache: false, hasPendingWrites: false })).toBe(true);
    expect(serverConfirmed({ fromCache: true, hasPendingWrites: false })).toBe(false);
    expect(serverConfirmed({ fromCache: false, hasPendingWrites: true })).toBe(false);
  });
});
