import { describe, expect, it } from "vitest";
import {
  careToText,
  nextStatus,
  parseCareImport,
  putProvider,
  removeProvider,
  setLean,
  setProviderStatus,
  sortNeeds,
  sortProviders,
} from "../care";
import type { CareNeed, CareProvider } from "../schemas";

const NOW = "2026-11-06T12:00:00.000Z";

function provider(over: Partial<CareProvider> = {}): CareProvider {
  return { id: "p1", name: "Dr. A", status: "not_called", ...over };
}

function need(over: Partial<CareNeed> = {}): CareNeed {
  return {
    id: "n1",
    moveId: "m1",
    title: "Everyday doctor",
    order: 0,
    providers: [provider()],
    updatedAt: NOW,
    updatedBy: "uid-1",
    ...over,
  };
}

describe("status", () => {
  it("cycles not called, called, booked, and back", () => {
    expect(nextStatus("not_called")).toBe("called");
    expect(nextStatus("called")).toBe("booked");
    expect(nextStatus("booked")).toBe("not_called");
  });

  it("does not cycle out of passed by a tap", () => {
    // Passed is reached only through the form; a tap lands on the resting state.
    expect(nextStatus("passed")).toBe("not_called");
  });

  it("changes one option and leaves the rest", () => {
    const n = need({ providers: [provider({ id: "a" }), provider({ id: "b" })] });
    const out = setProviderStatus(n, "b", "booked");
    expect(out.providers.map((p) => p.status)).toEqual(["not_called", "booked"]);
  });
});

describe("the lean", () => {
  it("is held by at most one option", () => {
    const n = need({ providers: [provider({ id: "a", lean: true }), provider({ id: "b" })] });
    const out = setLean(n, "b");
    expect(out.providers.map((p) => p.lean)).toEqual([undefined, true]);
  });

  it("is displaced when a new option arrives leaning", () => {
    const n = need({ providers: [provider({ id: "a", lean: true })] });
    const out = putProvider(n, provider({ id: "b", lean: true }));
    expect(out.providers.map((p) => [p.id, p.lean])).toEqual([
      ["a", undefined],
      ["b", true],
    ]);
  });

  it("sorts first on the card", () => {
    const list = [provider({ id: "a" }), provider({ id: "b", lean: true }), provider({ id: "c" })];
    expect(sortProviders(list).map((p) => p.id)).toEqual(["b", "a", "c"]);
  });
});

describe("options on a card", () => {
  it("replaces by id and appends when new", () => {
    const n = need();
    const replaced = putProvider(n, provider({ id: "p1", name: "Dr. A, renamed" }));
    expect(replaced.providers).toHaveLength(1);
    expect(replaced.providers[0]?.name).toBe("Dr. A, renamed");
    const appended = putProvider(n, provider({ id: "p2", name: "Dr. B" }));
    expect(appended.providers.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("removes by id", () => {
    expect(removeProvider(need(), "p1").providers).toEqual([]);
  });
});

describe("cards", () => {
  it("sort by order, then title", () => {
    const list = [need({ id: "x", order: 2, title: "B" }), need({ id: "y", order: 2, title: "A" }), need({ id: "z", order: 0 })];
    expect(sortNeeds(list).map((n) => n.id)).toEqual(["z", "y", "x"]);
  });
});

describe("paste import", () => {
  const ctx = { moveId: "m1", uid: "uid-1", now: NOW, newId: (() => { let i = 0; return () => `id${++i}`; })(), firstOrder: 3 };

  it("turns the pasted shape into stored cards, numbered after the existing ones", () => {
    const text = JSON.stringify([
      { title: "Bladder", note: "Two to pick from.", providers: [{ name: "Dr. A", lean: true }, { name: "Dr. B", status: "called" }] },
      { title: "Hip" },
    ]);
    const out = parseCareImport(text, ctx);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.needs.map((n) => [n.title, n.order])).toEqual([
      ["Bladder", 3],
      ["Hip", 4],
    ]);
    expect(out.needs[0]?.providers.map((p) => [p.name, p.status, p.lean])).toEqual([
      ["Dr. A", "not_called", true],
      ["Dr. B", "called", undefined],
    ]);
    expect(out.needs[1]?.providers).toEqual([]);
    expect(out.needs[0]?.updatedBy).toBe("uid-1");
  });

  it("keeps only the first lean when the paste carries two", () => {
    const text = JSON.stringify([{ title: "T", providers: [{ name: "A", lean: true }, { name: "B", lean: true }] }]);
    const out = parseCareImport(text, ctx);
    if (!out.ok) throw new Error(out.message);
    expect(out.needs[0]?.providers.map((p) => p.lean)).toEqual([true, undefined]);
  });

  it("says what is wrong in one sentence", () => {
    expect(parseCareImport("not json", ctx)).toMatchObject({ ok: false });
    const missingTitle = parseCareImport(JSON.stringify([{ providers: [] }]), ctx);
    expect(missingTitle.ok).toBe(false);
    if (!missingTitle.ok) expect(missingTitle.message).toContain("0.title");
  });

  it("drops keys it does not know rather than refusing", () => {
    const out = parseCareImport(JSON.stringify([{ title: "T", extra: 1, providers: [{ name: "A", rating: 5 }] }]), ctx);
    expect(out.ok).toBe(true);
  });
});

describe("copy as text", () => {
  it("writes the lean first, marks it, and shows the status", () => {
    const n = need({
      title: "Bladder",
      note: "Two to pick from.",
      providers: [provider({ id: "a", name: "Dr. A", status: "called" }), provider({ id: "b", name: "Dr. B", practice: "Clinic", lean: true, phone: "817-555-0100", why: "Kind, listens." })],
    });
    const text = careToText([n]);
    expect(text).toBe(
      ["BLADDER", "Two to pick from.", "  * Dr. B (Clinic) [Not called]", "    Kind, listens.", "    817-555-0100", "  - Dr. A [Called]", ""].join("\n")
    );
  });

  it("says when a card has nothing on it", () => {
    expect(careToText([need({ providers: [] })])).toContain("(no options yet)");
  });
});
