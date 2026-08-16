import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Container, MoveMember } from "../../../domain";
import { makeContainer, makeZone } from "../../../domain/__tests__/factories";

/**
 * The repositories and the photo hook are stubbed so this file never reaches
 * `lib/firebase`, which initializes an app at import. `PhotoStrip` is stubbed
 * for a second reason: capture needs a canvas and IndexedDB, and jsdom has
 * neither.
 *
 * What is worth asserting here is the way out. The number is reserved on
 * mount and is spent whether or not the box is saved, so leaving without an
 * answer about the draft is how numbers go missing. Reserving itself is
 * covered by `numbers.test.ts` and by the write-seam tests; this proves the
 * screen asks before it strands anything.
 */
const mocks = vi.hoisted(() => ({
  reserveContainer: vi.fn(),
  deleteContainer: vi.fn(),
  saveContainer: vi.fn(),
  setStatus: vi.fn(),
}));

const pending = { value: undefined, written: Promise.resolve() };

vi.mock("../../../repositories", () => ({
  reserveContainer: mocks.reserveContainer,
  deleteContainer: mocks.deleteContainer,
  saveContainer: mocks.saveContainer,
  setStatus: mocks.setStatus,
  writeInBackground: (work: Promise<unknown>) => void work.catch(() => undefined),
}));

vi.mock("../../../hooks/usePhotos", () => ({ usePhotos: () => [] }));
vi.mock("../PhotoStrip", () => ({ PhotoStrip: () => null }));

const { AddBox } = await import("../AddBox");

const zones = [makeZone()];

const me: MoveMember = {
  id: "mem1",
  moveId: "m1",
  uid: "uid-1",
  displayName: "Nathan",
  role: "owner",
  numberRangeStart: 1,
  numberRangeEnd: 499,
};

const draft: Container = makeContainer({
  id: "c9",
  sequenceNumber: 42,
  displayCode: "042",
  status: "filling",
});

function open() {
  const onLeave = vi.fn();
  render(
    <AddBox moveId="m1" me={me} containers={[]} zones={zones} uid="uid-1" onLeave={onLeave} />
  );
  return onLeave;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reserveContainer.mockReturnValue({ value: draft, written: Promise.resolve() });
  mocks.deleteContainer.mockResolvedValue(pending);
  mocks.saveContainer.mockReturnValue({ value: draft, written: Promise.resolve() });
  mocks.setStatus.mockReturnValue({ value: draft, written: Promise.resolve() });
});

describe("AddBox", () => {
  it("shows the reserved number before anything is entered", () => {
    open();
    // Twice on purpose: the number a person reads, and the label instruction
    // a screen reader reads out.
    expect(screen.getAllByText("042").length).toBe(2);
  });

  it("does not leave on the back control alone", () => {
    const onLeave = open();
    fireEvent.click(screen.getByText("Back"));
    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByText("Leave box 042?")).toBeDefined();
  });

  /**
   * The exit a phone offers and a test harness does not. Without the guard the
   * pop takes the screen away and the draft is stranded silently, which is the
   * thing APPLY-10 built the question for.
   */
  it("asks the same question when the phone's back gesture fires", async () => {
    const onLeave = open();
    window.history.pushState(null, "");
    window.history.back();
    await waitFor(() => expect(screen.getByText("Leave box 042?")).toBeDefined());
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("names the number that is at stake", () => {
    open();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText(/Number 042 is already reserved/)).toBeDefined();
  });

  it("deletes the draft when that is the answer, so the number goes back", async () => {
    const onLeave = open();
    fireEvent.click(screen.getByText("Back"));
    fireEvent.click(screen.getByText("Delete the draft"));
    expect(mocks.deleteContainer).toHaveBeenCalledWith("m1", "c9", "uid-1");
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
  });

  /**
   * The guard inside `deleteContainer` can refuse, and the person was just
   * told the number would go back to their range. Leaving anyway would make
   * that a lie and take the only screen that could say otherwise with it.
   */
  it("stays on the sheet and says so when the draft cannot be deleted", async () => {
    mocks.deleteContainer.mockRejectedValue(new Error("This box cannot be deleted."));
    const onLeave = open();
    fireEvent.click(screen.getByText("Back"));
    fireEvent.click(screen.getByText("Delete the draft"));
    await waitFor(() => expect(screen.getByText("This box cannot be deleted.")).toBeDefined());
    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.getByText("Keep the draft")).toBeDefined();
  });

  it("leaves the draft alone when that is the answer", () => {
    const onLeave = open();
    fireEvent.click(screen.getByText("Back"));
    fireEvent.click(screen.getByText("Keep the draft"));
    expect(mocks.deleteContainer).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("stays on the box when neither answer is wanted", () => {
    const onLeave = open();
    fireEvent.click(screen.getByText("Back"));
    fireEvent.click(screen.getByText("Stay on this box"));
    expect(mocks.deleteContainer).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.queryByText("Leave box 042?")).toBeNull();
  });

  it("saves and finishes without asking about a draft, because there is not one", () => {
    const onLeave = open();
    fireEvent.click(screen.getByText("Save and finish"));
    expect(mocks.saveContainer).toHaveBeenCalledTimes(1);
    expect(mocks.deleteContainer).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
