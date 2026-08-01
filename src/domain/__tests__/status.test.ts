import { describe, expect, it } from "vitest";
import { IllegalTransitionError, canTransition, nextStatuses, transition } from "../status";
import { makeContainer } from "./factories";

describe("canTransition", () => {
  it("allows the normal pipeline", () => {
    expect(canTransition("filling", "packed")).toBe(true);
    expect(canTransition("packed", "staged")).toBe(true);
    expect(canTransition("staged", "loaded")).toBe(true);
    expect(canTransition("loaded", "unloaded")).toBe(true);
    expect(canTransition("unloaded", "opened")).toBe(true);
    expect(canTransition("opened", "emptied")).toBe(true);
  });

  it("lets a packed box skip staging and go onto the truck", () => {
    expect(canTransition("packed", "loaded")).toBe(true);
  });

  it("refuses a forward jump that skips the truck", () => {
    expect(canTransition("packed", "unloaded")).toBe(false);
    expect(canTransition("filling", "opened")).toBe(false);
  });

  it("allows any backward move, because corrections happen", () => {
    expect(canTransition("loaded", "packed")).toBe(true);
    expect(canTransition("emptied", "filling")).toBe(true);
  });

  it("treats a no-op as not a transition", () => {
    expect(canTransition("packed", "packed")).toBe(false);
  });
});

describe("nextStatuses", () => {
  it("gives the buttons the detail screen should show", () => {
    expect(nextStatuses("packed")).toEqual(["staged", "loaded"]);
    expect(nextStatuses("emptied")).toEqual([]);
  });
});

describe("transition", () => {
  const now = "2026-07-26T12:00:00.000Z";

  it("returns the updated container and an activity event", () => {
    const { container, event } = transition(makeContainer(), "loaded", "mem2", now);
    expect(container.status).toBe("loaded");
    expect(container.updatedBy).toBe("mem2");
    expect(container.updatedAt).toBe(now);
    expect(event.type).toBe("status_changed");
    expect(event.payload).toEqual({ from: "packed", to: "loaded", backward: false });
  });

  it("marks a backward move so the history reads honestly", () => {
    const loaded = makeContainer({ status: "loaded" });
    const { event } = transition(loaded, "packed", "mem1", now);
    expect(event.payload).toMatchObject({ backward: true });
  });

  it("does not mutate the container it was given", () => {
    const original = makeContainer();
    transition(original, "loaded", "mem1", now);
    expect(original.status).toBe("packed");
  });

  it("throws on an illegal forward jump", () => {
    expect(() => transition(makeContainer(), "opened", "mem1", now)).toThrow(IllegalTransitionError);
  });
});
