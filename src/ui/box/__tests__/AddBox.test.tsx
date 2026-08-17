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
  acceptAiSummary: vi.fn(),
  dismissAiSummary: vi.fn(),
  updatePhotoRecord: vi.fn(),
}));

const pending = { value: undefined, written: Promise.resolve() };

vi.mock("../../../repositories", () => ({
  reserveContainer: mocks.reserveContainer,
  deleteContainer: mocks.deleteContainer,
  saveContainer: mocks.saveContainer,
  setStatus: mocks.setStatus,
  acceptAiSummary: mocks.acceptAiSummary,
  dismissAiSummary: mocks.dismissAiSummary,
  updatePhotoRecord: mocks.updatePhotoRecord,
  writeInBackground: (work: Promise<unknown>) => void work.catch(() => undefined),
}));

// `AiSummary` is the real component here, because what this run has to prove is
// that mounting it on this screen changes nothing else on it. The callable
// behind Ask again is stubbed so the Functions SDK is never loaded.
vi.mock("../../../lib/functions", () => ({ summarizePhoto: vi.fn() }));

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

/**
 * `containers` is the live subscription. Passing the draft back through it is
 * how this screen sees anything written to the box while it is open, which is
 * the whole path a suggestion travels.
 */
function open(containers: readonly Container[] = []) {
  const onLeave = vi.fn();
  render(
    <AddBox moveId="m1" me={me} containers={containers} zones={zones} uid="uid-1" onLeave={onLeave} />
  );
  return onLeave;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reserveContainer.mockReturnValue({ value: draft, written: Promise.resolve() });
  mocks.deleteContainer.mockResolvedValue(pending);
  mocks.saveContainer.mockReturnValue({ value: draft, written: Promise.resolve() });
  mocks.setStatus.mockReturnValue({ value: draft, written: Promise.resolve() });
  mocks.acceptAiSummary.mockReturnValue(pending);
  mocks.dismissAiSummary.mockReturnValue(pending);
  mocks.updatePhotoRecord.mockReturnValue(pending);
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

/**
 * A summary is written in the background after a photo uploads, so it lands
 * while the person is usually still on this screen. Until APPLY-12 it landed
 * into a screen that did not render it, and the only way to read it was to save
 * the box, leave, and open it again from the list.
 *
 * These assert the two halves of that: the block appears where the person is
 * standing, and it cannot reach anything else on the screen.
 */
describe("a suggestion arriving while the box is open", () => {
  const suggested: Container = { ...draft, aiSummary: "Books, a lamp, two mugs" };

  it("shows nothing until there is one", () => {
    open([draft]);
    expect(screen.queryByText("Suggested contents")).toBeNull();
  });

  it("shows the block when the live box carries one", () => {
    open([suggested]);
    expect(screen.getByText("Suggested contents")).toBeDefined();
    expect(screen.getByText("Books, a lamp, two mugs")).toBeDefined();
    expect(screen.getByText("Accept")).toBeDefined();
    expect(screen.getByText("Dismiss")).toBeDefined();
  });

  it("accepts without disturbing the room or the note", () => {
    open([suggested]);
    fireEvent.click(screen.getByText("Kitchen"));
    fireEvent.change(screen.getByLabelText("Note, optional"), {
      target: { value: "kettle and mugs" },
    });

    fireEvent.click(screen.getByText("Accept"));

    expect(mocks.acceptAiSummary).toHaveBeenCalledTimes(1);
    expect(mocks.acceptAiSummary.mock.calls[0]?.[3]).toBe("Books, a lamp, two mugs");
    // Both are component state on a screen the suggestion writes around
    // rather than through, so neither can be cleared by answering it.
    expect((screen.getByLabelText("Note, optional") as HTMLInputElement).value).toBe(
      "kettle and mugs"
    );
    expect(screen.getByText("BLUE")).toBeDefined();
  });

  it("dismisses without disturbing the note", () => {
    open([suggested]);
    fireEvent.change(screen.getByLabelText("Note, optional"), { target: { value: "winter coats" } });

    fireEvent.click(screen.getByText("Dismiss"));

    expect(mocks.dismissAiSummary).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Note, optional") as HTMLInputElement).value).toBe(
      "winter coats"
    );
  });

  /**
   * The criterion this screen is measured by. Nothing about a suggestion may
   * change what the two save buttons do.
   */
  it("saves and reserves the next number with a suggestion on screen", () => {
    open([suggested]);
    fireEvent.click(screen.getByText("Save and next"));
    expect(mocks.saveContainer).toHaveBeenCalledTimes(1);
    expect(mocks.setStatus).toHaveBeenCalledTimes(1);
    expect(mocks.reserveContainer).toHaveBeenCalledTimes(2);
  });

  /**
   * `saveContainer` rebuilds `searchText` from what it is handed, so saving the
   * copy reserved on mount took the summary's own words back out of it and the
   * box stopped answering for them.
   */
  it("saves the live box rather than the one reserved on mount", () => {
    open([suggested]);
    fireEvent.click(screen.getByText("Save and finish"));
    expect(mocks.saveContainer.mock.calls[0]?.[1]?.aiSummary).toBe("Books, a lamp, two mugs");
  });
});
