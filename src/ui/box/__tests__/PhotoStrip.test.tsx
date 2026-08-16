import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The two ways a photo gets onto a box.
 *
 * `capturePhoto` is stubbed because it needs a canvas and IndexedDB and jsdom
 * has neither, and the repositories are stubbed so this file never reaches
 * `lib/firebase`. What is left is the part that broke on a real phone: which
 * inputs exist and what each one asks the browser for.
 *
 * jsdom does not open a camera or a file picker, so this proves the request
 * and not the answer. Which app Android actually offers for each control is
 * the half only a phone can show.
 */
const mocks = vi.hoisted(() => ({ capturePhoto: vi.fn() }));

vi.mock("../../../photos/capture", () => ({ capturePhoto: mocks.capturePhoto }));
vi.mock("../../../repositories", () => ({
  retryUpload: vi.fn(),
  writeInBackground: (work: Promise<unknown>) => void work.catch(() => undefined),
}));
vi.mock("../PhotoViewer", () => ({ PhotoViewer: () => null }));

const { PhotoStrip } = await import("../PhotoStrip");

function open() {
  render(<PhotoStrip moveId="m1" containerId="c1" uid="uid-1" photos={[]} />);
}

/** The input behind a control, found by the label the control carries. */
function inputFor(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function choose(label: string) {
  const file = new File(["bytes"], "box.jpg", { type: "image/jpeg" });
  fireEvent.change(inputFor(label), { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.capturePhoto.mockResolvedValue("p1");
});

describe("adding a photo", () => {
  it("offers the camera and the library as two controls", () => {
    open();
    expect(screen.getByText("Take a photo")).toBeDefined();
    expect(screen.getByText("Choose a photo")).toBeDefined();
  });

  /**
   * `capture` is a hint. With it, Android opened the camera and hid the
   * library; without it, Android offered files and hid the camera. So one
   * input asks for the camera and the other does not ask for anything.
   */
  it("asks for the camera on one input and not on the other", () => {
    open();
    expect(inputFor("Take a photo").getAttribute("capture")).toBe("environment");
    expect(inputFor("Choose a photo").hasAttribute("capture")).toBe(false);
    expect(inputFor("Take a photo").getAttribute("accept")).toBe("image/*");
    expect(inputFor("Choose a photo").getAttribute("accept")).toBe("image/*");
  });

  it("sends a photo from the camera down the existing path", async () => {
    open();
    choose("Take a photo");
    await waitFor(() => expect(mocks.capturePhoto).toHaveBeenCalledTimes(1));
    expect(mocks.capturePhoto.mock.calls[0]![0]).toMatchObject({
      moveId: "m1",
      containerId: "c1",
      actorUid: "uid-1",
      kind: "contents",
    });
  });

  it("sends a photo from the library down the same path", async () => {
    open();
    choose("Choose a photo");
    await waitFor(() => expect(mocks.capturePhoto).toHaveBeenCalledTimes(1));
    expect(mocks.capturePhoto.mock.calls[0]![0]).toMatchObject({
      moveId: "m1",
      containerId: "c1",
      kind: "contents",
    });
  });

  it("says which control is working while the photo is written", async () => {
    let finish: (id: string) => void = () => undefined;
    mocks.capturePhoto.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    open();
    choose("Take a photo");

    await waitFor(() => expect(screen.getByText("Adding")).toBeDefined());
    expect(screen.queryByText("Take a photo")).toBeNull();
    expect(screen.getByText("Choose a photo").hasAttribute("disabled")).toBe(true);

    finish("p1");
    await waitFor(() => expect(screen.getByText("Take a photo")).toBeDefined());
  });

  it("says so when the photo could not be added", async () => {
    mocks.capturePhoto.mockRejectedValue(new Error("no room"));
    open();
    choose("Choose a photo");
    await waitFor(() =>
      expect(screen.getByText("Could not add that photo. Try again.")).toBeDefined()
    );
  });
});
