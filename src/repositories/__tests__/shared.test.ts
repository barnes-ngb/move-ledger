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

const { subscribeValidated } = await import("../shared");

const schema = z.object({ id: z.string(), n: z.number() });
const ref = {} as never;

/** The three arguments the SDK was handed on the last call. */
function lastCall() {
  const call = mocks.onSnapshot.mock.calls.at(-1) as [unknown, (s: unknown) => void, (e: unknown) => void];
  return { onNext: call[1], onError: call[2] };
}

function snapshot(docs: Array<{ id: string; body: unknown }>) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.body })) };
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
    expect(onData).toHaveBeenCalledWith([{ id: "good", n: 1 }]);
  });
});
