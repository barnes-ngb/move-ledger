import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Container } from "../../../domain";
import { makeContainer, makeZone } from "../../../domain/__tests__/factories";

/**
 * The repositories and the photo hook are stubbed so this file never reaches
 * `lib/firebase`, which initializes an app at import.
 *
 * What is worth asserting here is which of the two removals this screen picks
 * and that neither happens on one press. `canDelete` is tested against the
 * domain in `lifecycle.test.ts`; this proves the screen asks it rather than
 * deciding for itself.
 */
const mocks = vi.hoisted(() => ({
  deleteContainer: vi.fn(),
  voidContainer: vi.fn(),
  unvoidContainer: vi.fn(),
  reportContainerCondition: vi.fn(),
  clearContainerCondition: vi.fn(),
  setTitle: vi.fn(),
  setContentsItems: vi.fn(),
  setStatus: vi.fn(),
}));

const pending = { value: undefined, written: Promise.resolve() };

vi.mock("../../../repositories", () => ({
  deleteContainer: mocks.deleteContainer,
  voidContainer: mocks.voidContainer,
  unvoidContainer: mocks.unvoidContainer,
  reportContainerCondition: mocks.reportContainerCondition,
  clearContainerCondition: mocks.clearContainerCondition,
  saveContainer: vi.fn(() => pending),
  setStatus: mocks.setStatus,
  setTitle: mocks.setTitle,
  setContentsItems: mocks.setContentsItems,
  writeInBackground: (work: Promise<unknown>) => void work.catch(() => undefined),
}));

vi.mock("../../../hooks/usePhotos", () => ({ usePhotos: () => [] }));
vi.mock("../PhotoStrip", () => ({ PhotoStrip: () => null }));
vi.mock("../AiSummary", () => ({ AiSummary: () => null }));

const { BoxDetail } = await import("../BoxDetail");

const NOW = "2026-08-15T12:00:00.000Z";
const zones = [makeZone()];

function open(container: Container) {
  const onBack = vi.fn();
  render(<BoxDetail moveId="m1" container={container} zones={zones} uid="uid-1" onBack={onBack} />);
  return onBack;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteContainer.mockResolvedValue(pending);
  mocks.voidContainer.mockReturnValue(pending);
  mocks.unvoidContainer.mockReturnValue(pending);
  mocks.reportContainerCondition.mockReturnValue(pending);
  mocks.clearContainerCondition.mockReturnValue(pending);
  mocks.setTitle.mockReturnValue(pending);
  mocks.setContentsItems.mockReturnValue(pending);
  mocks.setStatus.mockReturnValue(pending);
});

describe("removing a box", () => {
  const draft = makeContainer({ status: "filling" });
  const written = makeContainer({ status: "filling", labelConfirmedAt: NOW });

  it("offers delete for a box nobody has written on", () => {
    open(draft);
    expect(screen.getByText("Delete this box")).toBeDefined();
    expect(screen.queryByText("Void this box")).toBeNull();
  });

  it("offers void for a box that has been written on", () => {
    open(written);
    expect(screen.getByText("Void this box")).toBeDefined();
    expect(screen.queryByText("Delete this box")).toBeNull();
  });

  it("does nothing on the first press", () => {
    open(draft);
    fireEvent.click(screen.getByText("Delete this box"));
    expect(mocks.deleteContainer).not.toHaveBeenCalled();
  });

  it("says the number will be used again before deleting", () => {
    open(draft);
    fireEvent.click(screen.getByText("Delete this box"));
    expect(screen.getByText(/goes back and will be given to the next box/)).toBeDefined();
  });

  it("says the number is retired before voiding", () => {
    open(written);
    fireEvent.click(screen.getByText("Void this box"));
    expect(screen.getByText(/never be given to another box/)).toBeDefined();
  });

  it("deletes once confirmed", () => {
    open(draft);
    fireEvent.click(screen.getByText("Delete this box"));
    fireEvent.click(screen.getAllByText("Delete this box")[1]!);
    expect(mocks.deleteContainer).toHaveBeenCalledWith("m1", "c1", "uid-1");
    expect(mocks.voidContainer).not.toHaveBeenCalled();
  });

  it("voids once confirmed", () => {
    open(written);
    fireEvent.click(screen.getByText("Void this box"));
    fireEvent.click(screen.getAllByText("Void this box")[1]!);
    expect(mocks.voidContainer).toHaveBeenCalledTimes(1);
    expect(mocks.deleteContainer).not.toHaveBeenCalled();
  });

  it("keeps the box when the confirmation is declined", () => {
    open(written);
    fireEvent.click(screen.getByText("Void this box"));
    fireEvent.click(screen.getByText("Keep it"));
    expect(mocks.voidContainer).not.toHaveBeenCalled();
  });
});

describe("a voided box", () => {
  const voided = makeContainer({ voidedAt: NOW, voidedBy: "mem1" });

  it("says so, and says the number is not coming back", () => {
    open(voided);
    expect(screen.getByText("Voided")).toBeDefined();
    expect(screen.getByText(/will not be given to another box/)).toBeDefined();
  });

  it("hides the actions that no longer make sense", () => {
    open(voided);
    expect(screen.queryByText("Save note")).toBeNull();
    expect(screen.queryByText("Save title")).toBeNull();
    expect(screen.queryByText("Report damaged")).toBeNull();
    expect(screen.queryByText("Change room")).toBeNull();
    expect(screen.queryByText("Mark staged")).toBeNull();
  });

  it("offers the undo, which needs no confirmation because it takes nothing away", () => {
    open(voided);
    fireEvent.click(screen.getByText("Put this box back"));
    expect(mocks.unvoidContainer).toHaveBeenCalledTimes(1);
  });
});

describe("conditions", () => {
  const report = { reportedAt: NOW, reportedBy: "mem1", photoIds: [] };

  it("reports one without touching status", () => {
    open(makeContainer({ status: "loaded" }));
    fireEvent.click(screen.getByText("Report damaged"));
    expect(mocks.reportContainerCondition).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({ status: "loaded" }),
      "damaged",
      { photoIds: [] },
      "uid-1"
    );
  });

  it("keeps the status buttons on a box carrying a condition, per ADR-0003", () => {
    open(makeContainer({ status: "packed", conditions: { damaged: report } }));
    expect(screen.getByText("Mark staged")).toBeDefined();
    expect(screen.getByText("Mark loaded")).toBeDefined();
  });

  it("shows both at once", () => {
    open(makeContainer({ conditions: { missing: report, damaged: report } }));
    expect(screen.getByText("Missing")).toBeDefined();
    expect(screen.getByText("Damaged")).toBeDefined();
  });

  it("clears one that is already set", () => {
    open(makeContainer({ conditions: { missing: report } }));
    fireEvent.click(screen.getByText("Mark found"));
    expect(mocks.clearContainerCondition).toHaveBeenCalledWith(
      "m1",
      expect.anything(),
      "missing",
      "uid-1"
    );
  });
});

describe("title", () => {
  it("saves what was typed", () => {
    open(makeContainer());
    fireEvent.change(screen.getByPlaceholderText("winter coats"), {
      target: { value: "winter coats" },
    });
    fireEvent.click(screen.getByText("Save title"));
    expect(mocks.setTitle).toHaveBeenCalledWith("m1", expect.anything(), "winter coats", zones, "uid-1");
  });

  it("stays disabled until the text changes", () => {
    open(makeContainer({ title: "winter coats" }));
    expect(screen.getByText("Save title").hasAttribute("disabled")).toBe(true);
  });
});

/**
 * Until APPLY-11 the contents list could be corrected only in the moment a
 * suggestion was accepted. Once it was confirmed text, nothing edited it.
 * Since APPLY-18 it is a list, read one item per line and edited one per line.
 *
 * The save goes through `setContentsItems` rather than a field write, and
 * that is the point of these: `searchText` is rebuilt in there, so what a
 * search answers for stays what the screen shows.
 */
describe("the contents list", () => {
  function field(): HTMLTextAreaElement {
    return screen.getByLabelText("Contents, one per line") as HTMLTextAreaElement;
  }

  function lines(): (string | null)[] {
    return screen.getAllByRole("listitem").map((li) => li.textContent);
  }

  const listed = { contentsItems: ["kettle", "two mugs"], contentsSummary: "kettle, two mugs" };

  it("shows what the box holds one item per line", () => {
    open(makeContainer(listed));
    expect(lines()).toEqual(["kettle", "two mugs"]);
    expect(screen.queryByLabelText("Contents, one per line")).toBeNull();
  });

  it("splits a list from before items without writing anything", () => {
    open(makeContainer({ contentsSummary: "kettle, two mugs" }));
    expect(lines()).toEqual(["kettle", "two mugs"]);
    expect(mocks.setContentsItems).not.toHaveBeenCalled();
  });

  it("opens the field with one item per line, ready to correct", () => {
    open(makeContainer(listed));
    fireEvent.click(screen.getByText("Edit contents"));
    expect(field().value).toBe("kettle\ntwo mugs");
  });

  it("saves a correction through the path that rebuilds searchText", () => {
    open(makeContainer(listed));
    fireEvent.click(screen.getByText("Edit contents"));
    fireEvent.change(field(), { target: { value: "kettle\n two mugs \n\ntea towels" } });
    fireEvent.click(screen.getByText("Save contents"));
    expect(mocks.setContentsItems).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({ id: "c1" }),
      ["kettle", "two mugs", "tea towels"],
      zones,
      "uid-1"
    );
  });

  it("puts the list back unchanged on Cancel", () => {
    open(makeContainer(listed));
    fireEvent.click(screen.getByText("Edit contents"));
    fireEvent.change(field(), { target: { value: "something else" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(lines()).toEqual(["kettle", "two mugs"]);
    expect(mocks.setContentsItems).not.toHaveBeenCalled();
  });

  it("takes a list on a box that never had one, straight into the field", () => {
    open(makeContainer());
    fireEvent.change(field(), { target: { value: "winter boots" } });
    fireEvent.click(screen.getByText("Save contents"));
    expect(mocks.setContentsItems).toHaveBeenCalledWith(
      "m1",
      expect.anything(),
      ["winter boots"],
      zones,
      "uid-1"
    );
  });

  it("stays disabled until an item changes", () => {
    open(makeContainer(listed));
    fireEvent.click(screen.getByText("Edit contents"));
    expect(screen.getByText("Save contents").hasAttribute("disabled")).toBe(true);
    // A blank line and stray spaces are not a change.
    fireEvent.change(field(), { target: { value: " kettle\n\ntwo mugs " } });
    expect(screen.getByText("Save contents").hasAttribute("disabled")).toBe(true);
  });

  it("shows the accepted suggestion as the list, so it is not saved back empty", () => {
    const before = makeContainer();
    const { rerender } = render(
      <BoxDetail moveId="m1" container={before} zones={zones} uid="uid-1" onBack={() => undefined} />
    );
    expect(field().value).toBe("");

    // What accepting a suggestion does to this screen while it is open.
    const after = makeContainer({ contentsItems: ["two lamps", "a rug"], contentsSummary: "two lamps, a rug" });
    rerender(
      <BoxDetail moveId="m1" container={after} zones={zones} uid="uid-1" onBack={() => undefined} />
    );
    expect(lines()).toEqual(["two lamps", "a rug"]);
    fireEvent.click(screen.getByText("Edit contents"));
    expect(field().value).toBe("two lamps\na rug");
  });

  it("shows the categories as chips under the list", () => {
    open(makeContainer({ ...listed, contentsCategories: ["kitchen"] }));
    expect(screen.getByText("Kinds of things")).toBeDefined();
    expect(lines()).toContain("kitchen");
  });

  it("is read-only on a voided box, like everything else on it", () => {
    open(makeContainer({ ...listed, voidedAt: NOW, voidedBy: "mem1" }));
    expect(lines()).toEqual(["kettle", "two mugs"]);
    expect(screen.queryByText("Save contents")).toBeNull();
    expect(screen.queryByText("Edit contents")).toBeNull();
  });
});

/**
 * A mis-tap on Mark loaded used to be permanent: only the forward moves were
 * offered. The backward ones sit behind a quiet control, so the forward
 * buttons stay the obvious thing on the screen. Doc 04 section 6.
 */
describe("changing status", () => {
  it("offers the forward moves and hides the backward ones until asked", () => {
    open(makeContainer({ status: "loaded" }));
    expect(screen.getByText("Mark unloaded")).toBeDefined();
    expect(screen.queryByText("Mark packed")).toBeNull();
    expect(screen.getByText("Change status")).toBeDefined();
  });

  it("reveals every backward move canTransition allows", () => {
    open(makeContainer({ status: "loaded", labelConfirmedAt: NOW }));
    fireEvent.click(screen.getByText("Change status"));
    for (const word of ["Mark draft", "Mark packed", "Mark staged"]) expect(screen.getByText(word)).toBeDefined();
    // Shown once, above, rather than twice.
    expect(screen.getAllByText("Mark unloaded")).toHaveLength(1);
  });

  it("takes a box back a step and closes the control", () => {
    const box = makeContainer({ status: "loaded", labelConfirmedAt: NOW });
    open(box);
    fireEvent.click(screen.getByText("Change status"));
    fireEvent.click(screen.getByText("Mark packed"));
    expect(mocks.setStatus).toHaveBeenCalledWith("m1", box, "packed", "uid-1");
    expect(screen.queryByText("Mark staged")).toBeNull();
  });

  it("can be put away without changing anything", () => {
    open(makeContainer({ status: "loaded" }));
    fireEvent.click(screen.getByText("Change status"));
    fireEvent.click(screen.getByText("Keep this status"));
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(screen.queryByText("Mark packed")).toBeNull();
  });

  it("does not offer it on a draft, which has nowhere to go back to", () => {
    open(makeContainer({ status: "filling" }));
    expect(screen.queryByText("Change status")).toBeNull();
  });

  it("reads a draft as a draft, never as filling", () => {
    open(makeContainer({ status: "filling" }));
    expect(screen.getByText("draft")).toBeDefined();
    expect(screen.queryByText("filling")).toBeNull();
  });
});
