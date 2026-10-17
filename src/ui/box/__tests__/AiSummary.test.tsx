import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Container, ContainerPhoto } from "../../../domain";
import { makeContainer, makeZone } from "../../../domain/__tests__/factories";

/**
 * The panel's two calls to the function, with the call itself stubbed at
 * `askForSummary`. What is asserted is what the panel does with the answers:
 * Ask again replaces the suggestion only once every photo has answered and
 * leaves it alone otherwise, and the ask control appears for exactly the
 * photos that uploaded and never got a list.
 */
const mocks = vi.hoisted(() => ({
  askForSummary: vi.fn(),
  replaceAiSummary: vi.fn(),
  acceptAiSummary: vi.fn(),
  dismissAiSummary: vi.fn(),
  updatePhotoRecord: vi.fn(),
}));

vi.mock("../../../repositories", () => ({
  acceptAiSummary: mocks.acceptAiSummary,
  dismissAiSummary: mocks.dismissAiSummary,
  replaceAiSummary: mocks.replaceAiSummary,
  updatePhotoRecord: mocks.updatePhotoRecord,
  writeInBackground: (work: Promise<unknown>) => void work.catch(() => undefined),
}));
vi.mock("../../../photos/summary", () => ({ askForSummary: mocks.askForSummary }));

const { AiSummary } = await import("../AiSummary");

const zones = [makeZone()];
const NOW = "2026-10-17T12:00:00.000Z";

function photo(over: Partial<ContainerPhoto> = {}): ContainerPhoto {
  return {
    id: "p1",
    moveId: "m1",
    containerId: "c1",
    type: "contents",
    storagePath: "moves/m1/c1/p1.jpg",
    width: 1600,
    height: 1200,
    bytes: 200_000,
    uploadState: "uploaded",
    attempts: 0,
    createdAt: NOW,
    createdBy: "uid-1",
    ...over,
  };
}

const suggested = makeContainer({ aiSummary: "A kettle and two mugs", aiCategories: ["kitchen"] });
const twoPhotos = [photo(), photo({ id: "p2", storagePath: "moves/m1/c1/p2.jpg" })];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.replaceAiSummary.mockImplementation((_m: string, c: Container) => ({
    value: c,
    written: Promise.resolve(),
  }));
});

describe("Ask again", () => {
  it("does not clear the old suggestion before asking", async () => {
    mocks.askForSummary.mockResolvedValue({ summary: "a lamp" });
    render(<AiSummary moveId="m1" container={suggested} zones={zones} photos={twoPhotos} uid="uid-1" />);

    fireEvent.click(screen.getByText("Ask again, 2 photos"));

    expect(mocks.dismissAiSummary).not.toHaveBeenCalled();
    expect(screen.getByText("A kettle and two mugs")).toBeDefined();
    await waitFor(() => expect(mocks.replaceAiSummary).toHaveBeenCalled());
  });

  it("asks every contents photo for its answer back rather than a write", async () => {
    mocks.askForSummary.mockResolvedValue({ summary: "a lamp" });
    render(<AiSummary moveId="m1" container={suggested} zones={zones} photos={twoPhotos} uid="uid-1" />);

    fireEvent.click(screen.getByText("Ask again, 2 photos"));

    await waitFor(() => expect(mocks.askForSummary).toHaveBeenCalledTimes(2));
    expect(mocks.askForSummary).toHaveBeenCalledWith("m1", "p1", { redo: true, returnOnly: true });
    expect(mocks.askForSummary).toHaveBeenCalledWith("m1", "p2", { redo: true, returnOnly: true });
  });

  it("replaces the suggestion with every answer once all of them arrive", async () => {
    mocks.askForSummary
      .mockResolvedValueOnce({ items: ["books", "a lamp"], summary: "books, a lamp", categories: ["books"] })
      .mockResolvedValueOnce({ items: ["A lamp", "tea towels"], categories: ["lighting", "books"] });
    render(<AiSummary moveId="m1" container={suggested} zones={zones} photos={twoPhotos} uid="uid-1" />);

    fireEvent.click(screen.getByText("Ask again, 2 photos"));

    await waitFor(() => expect(mocks.replaceAiSummary).toHaveBeenCalledTimes(1));
    const [, , , items, categories] = mocks.replaceAiSummary.mock.calls[0]!;
    // The second photo's lamp is the first photo's lamp, so it is listed once.
    expect(items).toEqual(["books", "a lamp", "tea towels"]);
    expect(categories).toEqual(["books", "lighting"]);
  });

  /** A function deployed before APPLY-18 answers with a string and nothing else. */
  it("splits a reply from a function that predates items", async () => {
    mocks.askForSummary
      .mockResolvedValueOnce({ summary: "books, a lamp", categories: ["books"] })
      .mockResolvedValueOnce({ summary: "tea towels." });
    render(<AiSummary moveId="m1" container={suggested} zones={zones} photos={twoPhotos} uid="uid-1" />);

    fireEvent.click(screen.getByText("Ask again, 2 photos"));

    await waitFor(() => expect(mocks.replaceAiSummary).toHaveBeenCalledTimes(1));
    expect(mocks.replaceAiSummary.mock.calls[0]![3]).toEqual(["books", "a lamp", "tea towels"]);
  });

  /**
   * The defect this replaced: Ask again dismissed first, so one failed call
   * left an empty box and unmounted the panel that would have said why.
   */
  it("leaves the old text in place and says why when any photo fails", async () => {
    mocks.askForSummary
      .mockResolvedValueOnce({ summary: "books" })
      .mockRejectedValueOnce(new Error("deadline-exceeded"));
    render(<AiSummary moveId="m1" container={suggested} zones={zones} photos={twoPhotos} uid="uid-1" />);

    fireEvent.click(screen.getByText("Ask again, 2 photos"));

    await screen.findByText(/Could not ask again, so the list above is unchanged\. deadline-exceeded/);
    expect(mocks.replaceAiSummary).not.toHaveBeenCalled();
    expect(screen.getByText("A kettle and two mugs")).toBeDefined();
  });

  it("drops the answer if the suggestion was answered while the calls were out", async () => {
    let finish: (v: unknown) => void = () => undefined;
    mocks.askForSummary.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { rerender } = render(
      <AiSummary moveId="m1" container={suggested} zones={zones} photos={[photo()]} uid="uid-1" />
    );

    fireEvent.click(screen.getByText("Ask again, 1 photo"));
    rerender(
      <AiSummary
        moveId="m1"
        container={{ ...suggested, aiSummary: undefined, contentsSummary: "A kettle and two mugs" }}
        zones={zones}
        photos={[photo()]}
        uid="uid-1"
      />
    );
    finish({ summary: "a lamp" });

    await waitFor(() => expect(mocks.askForSummary).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.replaceAiSummary).not.toHaveBeenCalled();
  });

  it("shows the suggested categories beside the text", () => {
    render(<AiSummary moveId="m1" container={suggested} zones={zones} photos={twoPhotos} uid="uid-1" />);

    expect(screen.getByText("Kinds of things")).toBeDefined();
    expect(screen.getByText("kitchen")).toBeDefined();
  });
});

describe("the suggestion as a list", () => {
  const listed = makeContainer({
    aiItems: ["white ceramic vase", "blue plastic bin"],
    aiSummary: "white ceramic vase, blue plastic bin",
  });

  it("shows one item per line", () => {
    render(<AiSummary moveId="m1" container={listed} zones={zones} photos={[photo()]} uid="uid-1" />);

    const lines = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(lines).toEqual(["white ceramic vase", "blue plastic bin"]);
  });

  it("accepts the items as they are", () => {
    mocks.acceptAiSummary.mockReturnValue({ value: listed, written: Promise.resolve() });
    render(<AiSummary moveId="m1" container={listed} zones={zones} photos={[photo()]} uid="uid-1" />);

    fireEvent.click(screen.getByText("Accept"));

    expect(mocks.acceptAiSummary.mock.calls[0]![3]).toEqual(["white ceramic vase", "blue plastic bin"]);
  });

  it("edits one item per line and drops the blank ones", () => {
    mocks.acceptAiSummary.mockReturnValue({ value: listed, written: Promise.resolve() });
    render(<AiSummary moveId="m1" container={listed} zones={zones} photos={[photo()]} uid="uid-1" />);

    fireEvent.click(screen.getByText("Edit"));
    const field = screen.getByLabelText("Contents, one per line") as HTMLTextAreaElement;
    expect(field.value).toBe("white ceramic vase\nblue plastic bin");
    fireEvent.change(field, { target: { value: "white ceramic vase\n\n  stapler  \n" } });
    fireEvent.click(screen.getByText("Save and accept"));

    expect(mocks.acceptAiSummary.mock.calls[0]![3]).toEqual(["white ceramic vase", "stapler"]);
  });
});

describe("Write a contents list", () => {
  const bare = makeContainer();

  it("is offered for an uploaded contents photo that never got a list", () => {
    render(<AiSummary moveId="m1" container={bare} zones={zones} photos={[photo()]} uid="uid-1" offerAsk />);

    expect(screen.getByText("Write a contents list")).toBeDefined();
  });

  it("is offered for a photo whose call failed", () => {
    render(
      <AiSummary
        moveId="m1"
        container={bare}
        zones={zones}
        photos={[photo({ summaryState: "failed", summaryError: "internal" })]}
        uid="uid-1"
        offerAsk
      />
    );

    expect(screen.getByText("Write a contents list")).toBeDefined();
  });

  it("is not offered for a photo that has not uploaded, was just asked for, is done, or dismissed", () => {
    const photos = [
      photo({ id: "a", storagePath: undefined }),
      photo({ id: "b", summaryRequestedAt: new Date().toISOString() }),
      photo({ id: "c", summaryState: "done" }),
      photo({ id: "d", summaryState: "skipped" }),
      photo({ id: "e", type: "damage" }),
    ];
    const { container } = render(
      <AiSummary moveId="m1" container={bare} zones={zones} photos={photos} uid="uid-1" offerAsk />
    );

    expect(container.textContent).toBe("");
  });

  it("is not offered where the screen does not ask for it", () => {
    const { container } = render(
      <AiSummary moveId="m1" container={bare} zones={zones} photos={[photo()]} uid="uid-1" />
    );

    expect(container.textContent).toBe("");
  });

  /**
   * A request mark from a page that was closed before its call settled. The
   * function never answered, so nothing will clear it, and without the lease
   * the photo would never be offered again.
   */
  it("is offered again once a request mark is older than the lease", () => {
    const stale = new Date(Date.now() - 3 * 60_000).toISOString();
    render(
      <AiSummary
        moveId="m1"
        container={bare}
        zones={zones}
        photos={[photo({ summaryRequestedAt: stale })]}
        uid="uid-1"
        offerAsk
      />
    );

    expect(screen.getByText("Write a contents list")).toBeDefined();
  });

  it("asks for exactly the unasked photos with ordinary calls", async () => {
    mocks.askForSummary.mockResolvedValue({ summary: "a lamp" });
    const photos = [photo(), photo({ id: "p2", summaryState: "done" }), photo({ id: "p3", summaryState: "failed" })];
    render(<AiSummary moveId="m1" container={bare} zones={zones} photos={photos} uid="uid-1" offerAsk />);

    fireEvent.click(screen.getByText("Write a contents list"));

    await waitFor(() => expect(mocks.askForSummary).toHaveBeenCalledTimes(2));
    expect(mocks.askForSummary).toHaveBeenCalledWith("m1", "p1");
    expect(mocks.askForSummary).toHaveBeenCalledWith("m1", "p3");
  });

  it("keeps the panel up to say why when a call fails", async () => {
    mocks.askForSummary.mockRejectedValue(new Error("resource-exhausted"));
    const { rerender } = render(
      <AiSummary moveId="m1" container={bare} zones={zones} photos={[photo()]} uid="uid-1" offerAsk />
    );

    fireEvent.click(screen.getByText("Write a contents list"));
    // The photo is marked requested while the call is out and stops counting as unasked.
    rerender(
      <AiSummary
        moveId="m1"
        container={bare}
        zones={zones}
        photos={[photo({ summaryRequestedAt: new Date().toISOString() })]}
        uid="uid-1"
        offerAsk
      />
    );

    await screen.findByText(/Could not write the list for every photo\. resource-exhausted/);
  });

  it("says so when there was nothing to list", async () => {
    mocks.askForSummary.mockResolvedValue({ skipped: "nothing visible" });
    render(<AiSummary moveId="m1" container={bare} zones={zones} photos={[photo()]} uid="uid-1" offerAsk />);

    fireEvent.click(screen.getByText("Write a contents list"));

    await screen.findByText("Nothing in these photos was worth listing.");
  });
});
