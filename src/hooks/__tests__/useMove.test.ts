import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The repositories module is replaced rather than Firestore, because what is
 * under test is the hook's own contract: when a listener may be opened, how
 * many times a stopped one is reopened, and what a screen is told in between.
 * Everything below the repository boundary is covered by
 * `repositories/__tests__/shared.test.ts`.
 */
const spy = vi.hoisted(() => ({
  moveSubscriptions: 0,
  memberSubscriptions: 0,
  sendMoves: null as null | ((moves: unknown[], origin: unknown) => void),
  failMoves: null as null | (() => void),
  sendMembers: null as null | ((members: unknown[]) => void),
  failMembers: null as null | (() => void),
  stopped: 0,
}));

vi.mock("../../repositories", () => {
  const stop = () => {
    spy.stopped += 1;
  };
  return {
    watchMoves: (_uid: string, onData: (m: unknown[], origin: unknown) => void, onError: () => void) => {
      spy.moveSubscriptions += 1;
      spy.sendMoves = onData;
      spy.failMoves = onError;
      return stop;
    },
    watchMembers: (_id: string, onData: (m: unknown[]) => void, onError: () => void) => {
      spy.memberSubscriptions += 1;
      spy.sendMembers = onData;
      spy.failMembers = onError;
      return stop;
    },
    watchZones: () => stop,
    watchLocations: () => stop,
  };
});

const { useMove } = await import("../useMove");

/** A snapshot the server has answered for and holds no unsent write. */
const CONFIRMED = { fromCache: false, hasPendingWrites: false };
/** A local write, or a cold cache read, that the server has not seen yet. */
const PENDING = { fromCache: true, hasPendingWrites: true };

/** The backoff in useMove, in order. Kept here so the budget is asserted, not assumed. */
const DELAYS = [300, 1200, 3000] as const;
const GRACE = 4000;

/** Deny the members listener until the last retry is spent. */
function denyMembersThroughBudget() {
  act(() => spy.failMembers?.());
  for (const delay of DELAYS) {
    act(() => void vi.advanceTimersByTime(delay));
    act(() => spy.failMembers?.());
  }
}

describe("useMove", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    spy.moveSubscriptions = 0;
    spy.memberSubscriptions = 0;
    spy.sendMoves = null;
    spy.failMoves = null;
    spy.sendMembers = null;
    spy.failMembers = null;
    spy.stopped = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the subcollections shut while the move is unconfirmed", () => {
    const { result } = renderHook(() => useMove("u1"));

    act(() => spy.sendMoves?.([{ id: "m1" }], PENDING));

    // The race this hook exists to prevent: three listeners opened against a
    // document only this phone has, all three denied by rules that are right.
    expect(spy.memberSubscriptions).toBe(0);
    // And it reads as a wait, because that is what it is.
    expect(result.current.loading).toBe(true);
    expect(result.current.failed).toBe(false);
  });

  it("opens the subcollections once the server confirms the move", () => {
    const { result } = renderHook(() => useMove("u1"));
    act(() => spy.sendMoves?.([{ id: "m1" }], PENDING));

    act(() => spy.sendMoves?.([{ id: "m1" }], CONFIRMED));

    expect(spy.memberSubscriptions).toBe(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.move?.id).toBe("m1");
  });

  it("reads an unconfirmed move anyway once the wait runs out", () => {
    const { result } = renderHook(() => useMove("u1"));
    act(() => spy.sendMoves?.([{ id: "m1" }], PENDING));

    // Offline the confirmation never comes. A phone in a garage still has to
    // reach its own move, so the gate expires rather than holding forever.
    act(() => void vi.advanceTimersByTime(GRACE));

    expect(spy.memberSubscriptions).toBe(1);
    expect(result.current.loading).toBe(false);
  });

  it("keeps working when a later local edit arrives unconfirmed", () => {
    const { result } = renderHook(() => useMove("u1"));
    act(() => spy.sendMoves?.([{ id: "m1" }], CONFIRMED));

    act(() => spy.sendMoves?.([{ id: "m1", name: "renamed" }], PENDING));

    // Renaming the move must not drop the app back to a spinner and tear down
    // three healthy listeners. Confirmation is a fact about the document.
    expect(spy.memberSubscriptions).toBe(1);
    expect(result.current.loading).toBe(false);
  });

  it("recovers when a denied listener succeeds inside the retry budget", () => {
    const { result } = renderHook(() => useMove("u1"));
    act(() => spy.sendMoves?.([{ id: "m1" }], CONFIRMED));

    act(() => spy.failMembers?.());
    act(() => void vi.advanceTimersByTime(DELAYS[0]));
    act(() => spy.failMembers?.());
    act(() => void vi.advanceTimersByTime(DELAYS[1]));
    act(() => spy.sendMembers?.([{ id: "x", uid: "u1" }]));

    expect(spy.memberSubscriptions).toBe(3);
    expect(result.current.failed).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.me?.uid).toBe("u1");
  });

  it("fails only after the denials outlast the budget", () => {
    const { result } = renderHook(() => useMove("u1"));
    act(() => spy.sendMoves?.([{ id: "m1" }], CONFIRMED));

    denyMembersThroughBudget();

    // `me` is still null here. Without `failed` the app would read that as an
    // invite this person is waiting for rather than as a listener that died.
    expect(spy.memberSubscriptions).toBe(DELAYS.length + 1);
    expect(result.current.failed).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.me).toBeNull();
  });

  it("gives a listener the whole budget again after it delivers", () => {
    const { result } = renderHook(() => useMove("u1"));
    act(() => spy.sendMoves?.([{ id: "m1" }], CONFIRMED));
    act(() => spy.failMembers?.());
    act(() => void vi.advanceTimersByTime(DELAYS[0]));
    act(() => spy.sendMembers?.([]));

    const opened = spy.memberSubscriptions;
    denyMembersThroughBudget();

    // Three more reopenings, not two. The denial it already survived is not
    // charged against a listener that has since delivered.
    expect(spy.memberSubscriptions).toBe(opened + DELAYS.length);
    expect(result.current.failed).toBe(true);
  });

  it("ends loading when the move listener stops for good", () => {
    const { result } = renderHook(() => useMove("u1"));
    expect(result.current.loading).toBe(true);

    act(() => spy.failMoves?.());
    for (const delay of DELAYS) {
      act(() => void vi.advanceTimersByTime(delay));
      act(() => spy.failMoves?.());
    }

    expect(result.current.loading).toBe(false);
    expect(result.current.failed).toBe(true);
    expect(result.current.move).toBeNull();
  });

  it("subscribes again on retry and clears the failure", () => {
    const { result } = renderHook(() => useMove("u1"));
    act(() => spy.sendMoves?.([{ id: "m1" }], CONFIRMED));
    denyMembersThroughBudget();
    expect(result.current.failed).toBe(true);
    const opened = spy.moveSubscriptions;

    act(() => result.current.retry());

    expect(result.current.failed).toBe(false);
    expect(result.current.loading).toBe(true);
    expect(spy.moveSubscriptions).toBe(opened + 1);

    act(() => spy.sendMoves?.([{ id: "m1" }], CONFIRMED));
    expect(result.current.loading).toBe(false);
    expect(result.current.move?.id).toBe("m1");
  });
});
