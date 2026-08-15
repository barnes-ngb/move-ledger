import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PhotoView } from "../../../hooks/usePhotos";

/**
 * The repositories are stubbed so this file never reaches `lib/firebase`,
 * which initializes an app at import. What the delete path needs proving here
 * is the confirmation step and what gets passed on, not the write itself.
 */
const mocks = vi.hoisted(() => ({ deletePhoto: vi.fn() }));

vi.mock("../../../repositories", () => ({
  deletePhoto: mocks.deletePhoto,
  writeInBackground: (work: Promise<unknown>) => void work.catch(() => undefined),
}));

const { PhotoViewer } = await import("../PhotoViewer");

const NOW = "2026-08-15T12:00:00.000Z";

function view(over: { id: string; localUrl?: string; downloadUrl?: string }): PhotoView {
  return {
    photo: {
      id: over.id,
      moveId: "m1",
      containerId: "c1",
      type: "contents",
      ...(over.downloadUrl ? { downloadUrl: over.downloadUrl } : {}),
      width: 1600,
      height: 1200,
      bytes: 220_000,
      uploadState: over.downloadUrl ? "uploaded" : "pending",
      attempts: 0,
      createdAt: NOW,
      createdBy: "mem1",
    },
    ...(over.localUrl ? { localUrl: over.localUrl } : {}),
  };
}

describe("PhotoViewer", () => {
  const photos = [
    view({ id: "p1", localUrl: "blob:one" }),
    view({ id: "p2", downloadUrl: "https://example.test/two.jpg" }),
    view({ id: "p3", localUrl: "blob:three", downloadUrl: "https://example.test/three.jpg" }),
  ];

  // The image carries an empty alt, as the strip's does, so it has no role to
  // query by. There is no honest description of a photograph of a box.
  function shownSrc(): string | null | undefined {
    return document.querySelector("img")?.getAttribute("src");
  }

  function open(startIndex = 0, list: PhotoView[] = photos) {
    mocks.deletePhoto.mockClear();
    mocks.deletePhoto.mockReturnValue({ value: undefined, written: Promise.resolve() });
    const onClose = vi.fn();
    render(
      <PhotoViewer moveId="m1" uid="uid-1" photos={list} startIndex={startIndex} onClose={onClose} />
    );
    return onClose;
  }

  it("opens on the photo that was tapped", () => {
    open(1);
    expect(screen.getByText("2 of 3")).toBeDefined();
    expect(shownSrc()).toBe("https://example.test/two.jpg");
  });

  it("prefers the local blob so a photo taken offline opens", () => {
    open(2);
    expect(shownSrc()).toBe("blob:three");
  });

  it("moves through the photos in the order they were taken", () => {
    open(0);
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("2 of 3")).toBeDefined();
    fireEvent.click(screen.getByText("Previous"));
    expect(screen.getByText("1 of 3")).toBeDefined();
  });

  it("stops at both ends", () => {
    open(0);
    expect(screen.getByText("Previous").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("3 of 3")).toBeDefined();
    expect(screen.getByText("Next").hasAttribute("disabled")).toBe(true);
  });

  it("closes on the close control", () => {
    const onClose = open(0);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when a control inside it is used", () => {
    const onClose = open(0);
    fireEvent.click(screen.getByText("Next"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says a photo is still uploading rather than showing a broken image", () => {
    open(0, [view({ id: "p9" })]);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/has not finished uploading/)).toBeDefined();
  });

  it("does not delete on the first press", () => {
    open(1);
    fireEvent.click(screen.getByText("Delete this photo"));
    expect(mocks.deletePhoto).not.toHaveBeenCalled();
  });

  it("deletes the photo on screen once it is confirmed", () => {
    open(1);
    fireEvent.click(screen.getByText("Delete this photo"));
    // The confirm panel repeats the label, so the second one is its button.
    fireEvent.click(screen.getAllByText("Delete this photo")[1]!);
    expect(mocks.deletePhoto).toHaveBeenCalledTimes(1);
    expect(mocks.deletePhoto.mock.calls[0]?.[1]?.id).toBe("p2");
  });

  it("keeps the photo when the confirmation is declined", () => {
    open(1);
    fireEvent.click(screen.getByText("Delete this photo"));
    fireEvent.click(screen.getByText("Keep it"));
    expect(mocks.deletePhoto).not.toHaveBeenCalled();
    expect(screen.getByText("2 of 3")).toBeDefined();
  });

  it("closes itself once the last photo is gone", () => {
    const onClose = open(0, []);
    expect(onClose).toHaveBeenCalled();
  });
});
