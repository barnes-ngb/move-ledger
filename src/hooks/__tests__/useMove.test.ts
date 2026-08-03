import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The repositories module is replaced rather than Firestore, because what is
 * under test is the hook's own contract: a listener that stops must end
 * loading and leave a state a screen can render. Everything below the
 * repository boundary is covered by `repositories/__tests__/shared.test.ts`.
 */
const spy = vi.hoisted(() => ({
  moveSubscriptions: 0,
  sendMoves: null as null | ((moves: unknown[]) => void),
  failMoves: null as null | (() => void),
  failMembers: null as null | (() => void),
  stopped: 0,
}));

vi.mock("../../repositories", () => {
  const stop = () => {
    spy.stopped += 1;
  };
  return {
    watchMoves: (_uid: string, onData: (m: unknown[]) => void, onError: () => void) => {
      spy.moveSubscriptions += 1;
      spy.sendMoves = onData;
      spy.failMoves = onError;
      return stop;
    },
    watchMembers: (_id: string, _onData: unknown, onError: () => void) => {
      spy.failMembers = onError;
      return stop;
    },
    watchZones: () => stop,
    watchLocations: () => stop,
  };
});

const { useMove } = await import("../useMove");

describe("useMove", () => {
  beforeEach(() => {
    spy.moveSubscriptions = 0;
    spy.sendMoves = null;
    spy.failMoves = null;
    spy.failMembers = null;
    spy.stopped = 0;
  });

  it("ends loading when the move listener stops", () => {
    const { result } = renderHook(() => useMove("u1"));
    expect(result.current.loading).toBe(true);

    act(() => spy.failMoves?.());

    expect(result.current.loading).toBe(false);
    expect(result.current.failed).toBe(true);
    expect(result.current.move).toBeNull();
  });

  it("subscribes again on retry and clears the failure", () => {
    const { result } = renderHook(() => useMove("u1"));
    act(() => spy.failMoves?.());
    expect(spy.moveSubscriptions).toBe(1);

    act(() => result.current.retry());

    expect(result.current.failed).toBe(false);
    expect(result.current.loading).toBe(true);
    expect(spy.moveSubscriptions).toBe(2);

    act(() => spy.sendMoves?.([{ id: "m1" }]));
    expect(result.current.loading).toBe(false);
    expect(result.current.move?.id).toBe("m1");
  });

  it("marks the context failed when the members listener stops", () => {
    const { result } = renderHook(() => useMove("u1"));
    act(() => spy.sendMoves?.([{ id: "m1" }]));
    expect(result.current.failed).toBe(false);

    act(() => spy.failMembers?.());

    // `me` is still null here. Without `failed` the app would read that as an
    // invite this person is waiting for rather than as a listener that died.
    expect(result.current.failed).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.me).toBeNull();
  });
});
