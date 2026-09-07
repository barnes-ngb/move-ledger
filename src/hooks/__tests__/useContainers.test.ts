import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

const spy = vi.hoisted(() => ({
  subscriptions: 0,
  fail: null as null | (() => void),
  send: null as null | ((c: unknown[]) => void),
}));

vi.mock("../../repositories", () => ({
  watchContainers: (_id: string, onData: (c: unknown[]) => void, onError: () => void) => {
    spy.subscriptions += 1;
    spy.send = onData;
    spy.fail = onError;
    return () => undefined;
  },
}));

const { useContainers } = await import("../useContainers");

describe("useContainers", () => {
  beforeEach(() => {
    spy.subscriptions = 0;
    spy.fail = null;
    spy.send = null;
  });

  it("reports a stopped listener rather than an empty list", () => {
    const { result } = renderHook(() => useContainers("m1"));
    expect(result.current.failed).toBe(false);

    act(() => spy.fail?.());

    // An empty array and a dead listener are indistinguishable without this.
    expect(result.current.failed).toBe(true);
    expect(result.current.containers).toEqual([]);
  });

  it("subscribes again on retry", () => {
    const { result } = renderHook(() => useContainers("m1"));
    act(() => spy.fail?.());
    expect(spy.subscriptions).toBe(1);

    act(() => result.current.retry());

    expect(result.current.failed).toBe(false);
    expect(spy.subscriptions).toBe(2);

    act(() => spy.send?.([{ id: "c1" }]));
    expect(result.current.containers).toHaveLength(1);
  });

  it("does not subscribe without a move", () => {
    renderHook(() => useContainers(null));
    expect(spy.subscriptions).toBe(0);
  });

  /**
   * An empty array before the first delivery and an empty array after it are
   * not the same thing, and Add box reserving against the first one is how
   * production issued number 1 twice.
   */
  it("says nothing has loaded until the listener delivers, even an empty list", () => {
    const { result } = renderHook(() => useContainers("m1"));
    expect(result.current.loaded).toBe(false);
    expect(result.current.containers).toEqual([]);

    act(() => spy.send?.([]));

    expect(result.current.loaded).toBe(true);
    expect(result.current.containers).toEqual([]);
  });

  it("forgets that it loaded when the listener is opened again", () => {
    const { result } = renderHook(() => useContainers("m1"));
    act(() => spy.send?.([{ id: "c1" }]));
    expect(result.current.loaded).toBe(true);

    act(() => spy.fail?.());
    act(() => result.current.retry());

    expect(result.current.loaded).toBe(false);
    act(() => spy.send?.([{ id: "c1" }]));
    expect(result.current.loaded).toBe(true);
  });
});
