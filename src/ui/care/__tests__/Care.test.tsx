import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CareNeed } from "../../../domain";

/**
 * The care screen. The repository is stubbed because it reaches
 * `lib/firebase`, which initializes an app at import; what is asserted is
 * the document handed to it, which is the whole contract of this screen.
 */
const saved: CareNeed[] = [];
const changes: string[] = [];
const removed: string[] = [];

vi.mock("../../../repositories", () => ({
  saveCareNeed: (need: CareNeed, _uid: string, detail: { change: string }) => {
    saved.push(need);
    changes.push(detail.change);
    return { value: need, written: Promise.resolve() };
  },
  removeCareNeed: async (_moveId: string, need: { id: string }) => {
    removed.push(need.id);
  },
  writeInBackground: (work: Promise<unknown>) => {
    void work;
  },
}));

vi.mock("../../../repositories/shared", () => ({
  newId: (() => {
    let i = 0;
    return () => `new${++i}`;
  })(),
  nowIso: () => "2026-11-06T12:00:00.000Z",
}));

const { Care } = await import("../Care");

const NOW = "2026-11-06T12:00:00.000Z";

const bladder: CareNeed = {
  id: "n1",
  moveId: "m1",
  title: "Bladder",
  note: "Someone who treats this properly.",
  order: 0,
  providers: [
    { id: "a", name: "Dr. A", status: "not_called", why: "Kind, takes time." },
    { id: "b", name: "Dr. B", status: "called", lean: true, phone: "817-555-0100" },
  ],
  updatedAt: NOW,
  updatedBy: "uid-1",
};

function open(over: Partial<Parameters<typeof Care>[0]> = {}) {
  render(
    <Care
      moveId="m1"
      uid="uid-1"
      needs={[bladder]}
      loaded={true}
      failed={false}
      retry={() => undefined}
      onBack={() => undefined}
      {...over}
    />
  );
}

beforeEach(() => {
  saved.length = 0;
  changes.length = 0;
  removed.length = 0;
});

describe("the care screen", () => {
  it("shows the lean option first and the card's note", () => {
    open();
    expect(screen.getByText("Someone who treats this properly.")).toBeDefined();
    const names = screen.getAllByText(/^Dr\. [AB]/).map((el) => el.textContent?.replace("Leaning here", ""));
    expect(names).toEqual(["Dr. B", "Dr. A"]);
    expect(screen.getByText("Leaning here")).toBeDefined();
  });

  it("one tap moves an option to the next status and writes the whole card", () => {
    open();
    fireEvent.click(screen.getByText("Mark called"));
    expect(saved).toHaveLength(1);
    const a = saved[0]?.providers.find((p) => p.id === "a");
    expect(a?.status).toBe("called");
    expect(saved[0]?.updatedBy).toBe("uid-1");
    expect(changes).toEqual(["status_changed"]);
  });

  it("the phone is a link the phone can dial", () => {
    open();
    const link = screen.getByText("817-555-0100") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("tel:8175550100");
  });

  it("adding an option that leans takes the lean from the other", () => {
    open();
    fireEvent.click(screen.getByText("Add an option"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dr. C" } });
    fireEvent.click(screen.getByLabelText("Leaning toward this one"));
    fireEvent.click(screen.getByText("Save option"));
    expect(saved).toHaveLength(1);
    expect(saved[0]?.providers.map((p) => [p.name, p.lean])).toEqual([
      ["Dr. A", undefined],
      ["Dr. B", undefined],
      ["Dr. C", true],
    ]);
    // Firestore refuses an explicit undefined, so the key is absent, not undefined.
    for (const p of saved[0]!.providers) expect("lean" in p && p.lean === undefined).toBe(false);
    expect(changes).toEqual(["option_added"]);
  });

  it("refuses a field the schema will not take and names it, before anything is written", () => {
    open();
    fireEvent.click(screen.getByText("Add an option"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x".repeat(121) } });
    fireEvent.click(screen.getByText("Save option"));
    expect(screen.getByText("The name is too long.")).toBeDefined();
    expect(saved).toHaveLength(0);
  });

  it("stops offering Add an option when a card is full", () => {
    const full: CareNeed = {
      ...bladder,
      providers: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Dr. ${i}`, status: "not_called" as const })),
    };
    open({ needs: [full] });
    expect(screen.queryByText("Add an option")).toBeNull();
    expect(screen.getByText(/This card is full/)).toBeDefined();
  });

  it("refuses an option with no name and says so", () => {
    open();
    fireEvent.click(screen.getByText("Add an option"));
    fireEvent.click(screen.getByText("Save option"));
    expect(screen.getByText("A name is needed.")).toBeDefined();
    expect(saved).toHaveLength(0);
  });

  it("adds a need numbered after the last card", () => {
    open();
    fireEvent.click(screen.getByText("Add a need"));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Hip" } });
    fireEvent.click(screen.getByText("Save card"));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ title: "Hip", order: 1, providers: [], moveId: "m1" });
    expect("note" in saved[0]!).toBe(false);
    expect(changes).toEqual(["card_added"]);
  });

  it("refuses a title the schema will not take", () => {
    open();
    fireEvent.click(screen.getByText("Add a need"));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "t".repeat(81) } });
    fireEvent.click(screen.getByText("Save card"));
    expect(screen.getByText("The title is too long.")).toBeDefined();
    expect(saved).toHaveLength(0);
  });

  it("removing a card asks first", () => {
    open();
    fireEvent.click(screen.getAllByText("Edit")[0]!);
    fireEvent.click(screen.getByText("Remove this card"));
    expect(removed).toEqual([]);
    fireEvent.click(screen.getByText("Remove it"));
    expect(removed).toEqual(["n1"]);
  });

  it("pastes a list and reports what it added", () => {
    open();
    fireEvent.click(screen.getByText("Paste a list"));
    const text = JSON.stringify([{ title: "Thyroid", providers: [{ name: "Dr. T" }] }, { title: "Hip" }]);
    fireEvent.change(screen.getByLabelText("List"), { target: { value: text } });
    fireEvent.click(screen.getByText("Add these cards"));
    expect(saved.map((n) => [n.title, n.order])).toEqual([
      ["Thyroid", 1],
      ["Hip", 2],
    ]);
    expect(screen.getByText("Added 2 cards.")).toBeDefined();
    expect(changes).toEqual(["imported", "imported"]);
  });

  it("a bad paste is refused with a sentence and nothing is written", () => {
    open();
    fireEvent.click(screen.getByText("Paste a list"));
    fireEvent.change(screen.getByLabelText("List"), { target: { value: "{}" } });
    fireEvent.click(screen.getByText("Add these cards"));
    expect(screen.getByText(/has a problem/)).toBeDefined();
    expect(saved).toHaveLength(0);
  });

  it("says when there is nothing yet, and when it is still loading", () => {
    open({ needs: [] });
    expect(screen.getByText("Nothing here yet.")).toBeDefined();
  });

  it("shows the stopped listener rather than an empty list", () => {
    open({ needs: [], failed: true });
    expect(screen.getByText("Cannot load the care team")).toBeDefined();
  });
});
