import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ContainerPhoto } from "../../../domain";
import type { PhotoView } from "../../../hooks/usePhotos";

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

function open(photos: PhotoView[] = []) {
  render(<PhotoStrip moveId="m1" containerId="c1" uid="uid-1" photos={photos} />);
}

function photo(id: string, over: Partial<ContainerPhoto> = {}): ContainerPhoto {
  return {
    id,
    moveId: "m1",
    containerId: "c1",
    type: "contents",
    width: 1600,
    height: 1200,
    bytes: 220_000,
    uploadState: "pending",
    attempts: 0,
    createdAt: "2026-10-17T10:00:00.000Z",
    createdBy: "uid-1",
    ...over,
  };
}

/** The input behind a control, found by the label the control carries. */
function inputFor(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function choose(label: string, count = 1) {
  const files = Array.from({ length: count }, (_, i) => new File([`bytes${i}`], `box${i}.jpg`, { type: "image/jpeg" }));
  fireEvent.change(inputFor(label), { target: { files } });
}

beforeEach(() => {
  vi.restoreAllMocks();
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

/**
 * The library hands back several photos at once; the camera, one. Layers of a
 * box are often photographed first and attached after.
 */
describe("adding several photos at once", () => {
  it("lets the library hand back several and keeps the camera to one", () => {
    open();
    expect(inputFor("Choose a photo").hasAttribute("multiple")).toBe(true);
    expect(inputFor("Take a photo").hasAttribute("multiple")).toBe(false);
  });

  it("adds every file, one after another, stamped in the order chosen", async () => {
    open();
    choose("Choose a photo", 3);
    await waitFor(() => expect(mocks.capturePhoto).toHaveBeenCalledTimes(3));
    const stamps = mocks.capturePhoto.mock.calls.map((c) => (c[0] as { createdAt: string }).createdAt);
    expect(new Set(stamps).size).toBe(3);
    expect([...stamps].sort()).toEqual(stamps);
    expect(Date.parse(stamps[2]!) - Date.parse(stamps[0]!)).toBe(2);
  });

  it("never starts the next before the last has been written", async () => {
    const finishes: Array<(id: string) => void> = [];
    mocks.capturePhoto.mockImplementation(() => new Promise<string>((resolve) => finishes.push(resolve)));
    open();
    choose("Choose a photo", 2);
    await waitFor(() => expect(mocks.capturePhoto).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Adding 1 of 2")).toBeDefined();
    expect(screen.getByText("Take a photo").hasAttribute("disabled")).toBe(true);
    finishes[0]!("p1");
    await waitFor(() => expect(screen.getByText("Adding 2 of 2")).toBeDefined());
    expect(mocks.capturePhoto).toHaveBeenCalledTimes(2);
    finishes[1]!("p2");
    await waitFor(() => expect(screen.getByText("Choose a photo")).toBeDefined());
  });

  it("keeps going past one that fails and says how many did", async () => {
    mocks.capturePhoto
      .mockResolvedValueOnce("p1")
      .mockRejectedValueOnce(new Error("too big"))
      .mockResolvedValueOnce("p3");
    open();
    choose("Choose a photo", 3);
    await waitFor(() =>
      expect(screen.getByText("Could not add 1 of those 3 photos. Try those again.")).toBeDefined()
    );
    expect(mocks.capturePhoto).toHaveBeenCalledTimes(3);
  });
});

describe("a photo that has not been sent", () => {
  it("offers Send again where the bytes are", () => {
    open([{ photo: photo("p1", { uploadState: "failed" }), localUrl: "blob:p1" }]);
    expect(screen.getByLabelText("Send photo 1 again")).toBeDefined();
  });

  /**
   * The bytes of a photo the other phone took are on that phone. Pressing
   * this here would reset a record and send nothing.
   */
  it("does not offer it for a photo whose bytes are on the other phone", () => {
    open([{ photo: photo("p1", { uploadState: "failed" }) }]);
    expect(screen.queryByLabelText("Send photo 1 again")).toBeNull();
    expect(screen.getByText("Not on this phone yet")).toBeDefined();
  });
});

describe("a photo that will not load here", () => {
  it("says it is not available offline rather than showing a broken image", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    open([{ photo: photo("p1", { uploadState: "uploaded", downloadUrl: "https://example/p1.jpg" }) }]);
    const img = document.querySelector("img")!;
    fireEvent.error(img);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("Not available offline")).toBeDefined();
  });

  /**
   * A failure while the browser already reports a network raises no online
   * event to try again on. Raised in review on pull request 27.
   */
  it("says it could not load when online, and tries again on a tap", () => {
    open([{ photo: photo("p1", { uploadState: "uploaded", downloadUrl: "https://example/p1.jpg" }) }]);
    fireEvent.error(document.querySelector("img")!);
    expect(screen.getByText("Could not load. Tap to try again")).toBeDefined();
    fireEvent.click(screen.getByLabelText("Open photo 1"));
    expect(document.querySelector("img")?.getAttribute("src")).toBe("https://example/p1.jpg");
  });
});
