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
}));

const pending = { value: undefined, written: Promise.resolve() };

vi.mock("../../../repositories", () => ({
  deleteContainer: mocks.deleteContainer,
  voidContainer: mocks.voidContainer,
  unvoidContainer: mocks.unvoidContainer,
  reportContainerCondition: mocks.reportContainerCondition,
  clearContainerCondition: mocks.clearContainerCondition,
  saveContainer: vi.fn(() => pending),
  setStatus: vi.fn(() => pending),
  setTitle: mocks.setTitle,
  writeInBackground: (work: Promise<unknown>) => void work.catch(() => undefined),
}));

vi.mock("../../../hooks/usePhotos", () => ({ usePhotos: () => [] }));
vi.mock("../PhotoStrip", () => ({ PhotoStrip: () => null }));
vi.mock("../AiSummary", () => ({ AiSummary: () => null }));

const { BoxDetail } = await import("../BoxDetail");

const NOW = "2026-08-15T12:00:00.000Z";
const zones = [makeZone()];

function open(container: Container) {
  const onClose = vi.fn();
  render(
    <BoxDetail moveId="m1" container={container} zones={zones} uid="uid-1" onClose={onClose} />
  );
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteContainer.mockResolvedValue(pending);
  mocks.voidContainer.mockReturnValue(pending);
  mocks.unvoidContainer.mockReturnValue(pending);
  mocks.reportContainerCondition.mockReturnValue(pending);
  mocks.clearContainerCondition.mockReturnValue(pending);
  mocks.setTitle.mockReturnValue(pending);
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
