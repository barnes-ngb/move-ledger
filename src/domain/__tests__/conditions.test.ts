import { describe, expect, it } from "vitest";
import { clearCondition, hasCondition, reportCondition } from "../conditions";
import { transition } from "../status";
import { makeContainer } from "./factories";

const now = "2026-07-26T12:00:00.000Z";

describe("conditions", () => {
  it("records damage without touching status", () => {
    const loaded = makeContainer({ status: "loaded" });
    const { container, event } = reportCondition(
      loaded,
      "damaged",
      { note: "corner crushed", photoIds: ["p1", "p2"] },
      "mem1",
      now
    );
    expect(container.status).toBe("loaded");
    expect(container.conditions.damaged?.reportedBy).toBe("mem1");
    expect(container.conditions.damaged?.photoIds).toHaveLength(2);
    expect(event.type).toBe("condition_reported");
  });

  it("lets a damaged box keep moving through the pipeline", () => {
    const loaded = makeContainer({ status: "loaded" });
    const damaged = reportCondition(loaded, "damaged", { photoIds: [] }, "mem1", now).container;
    const unloaded = transition(damaged, "unloaded", "mem1", now).container;
    expect(unloaded.status).toBe("unloaded");
    expect(hasCondition(unloaded, "damaged")).toBe(true);
  });

  it("holds missing and damaged at the same time", () => {
    const a = reportCondition(makeContainer(), "missing", { photoIds: [] }, "mem1", now).container;
    const b = reportCondition(a, "damaged", { photoIds: [] }, "mem1", now).container;
    expect(hasCondition(b, "missing")).toBe(true);
    expect(hasCondition(b, "damaged")).toBe(true);
  });

  it("clears a condition when the box turns up", () => {
    const missing = reportCondition(makeContainer(), "missing", { photoIds: [] }, "mem1", now).container;
    const found = clearCondition(missing, "missing", "mem1", now).container;
    expect(hasCondition(found, "missing")).toBe(false);
    expect(found.status).toBe("packed");
  });

  it("does not mutate the container it was given", () => {
    const original = makeContainer();
    reportCondition(original, "damaged", { photoIds: [] }, "mem1", now);
    expect(original.conditions.damaged).toBeUndefined();
  });
});
