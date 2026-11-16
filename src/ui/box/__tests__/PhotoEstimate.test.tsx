import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ estimateFurniture: vi.fn(), online: { value: true } }));
vi.mock("../../../lib/functions", () => ({ estimateFurniture: mocks.estimateFurniture }));
vi.mock("../../../hooks/useOnline", () => ({ useOnline: () => mocks.online.value }));

const { PhotoEstimate } = await import("../PhotoEstimate");

const estimate = {
  name: "6-drawer dresser",
  widthIn: 60,
  depthIn: 18,
  heightIn: 32,
  weightLb: 150,
  weightLowLb: 120,
  weightHighLb: 180,
  scale: "tape" as const,
  note: "Read 60 in off the tape.",
  photos: 2,
};

function open(uploadedPhotos = 1) {
  const onUse = vi.fn();
  render(<PhotoEstimate moveId="m1" containerId="c1" uploadedPhotos={uploadedPhotos} onUse={onUse} />);
  return onUse;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.online.value = true;
  mocks.estimateFurniture.mockResolvedValue({ data: { estimate } });
});

describe("Estimate from photo", () => {
  it("shows the estimate as a guess and fills nothing until Use these", async () => {
    const onUse = open();
    fireEvent.click(screen.getByText("Estimate from photo"));
    expect(await screen.findByText("6-drawer dresser")).toBeDefined();
    expect(screen.getByText("About 60 × 18 × 32 in, 20 cu ft")).toBeDefined();
    expect(screen.getByText("120 to 180 lb, likely 150")).toBeDefined();
    expect(screen.getByText(/Sized from the tape measure/)).toBeDefined();
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Use these"));
    expect(onUse).toHaveBeenCalledWith(estimate);
  });

  it("drops the estimate on Not this", async () => {
    const onUse = open();
    fireEvent.click(screen.getByText("Estimate from photo"));
    fireEvent.click(await screen.findByText("Not this"));
    expect(onUse).not.toHaveBeenCalled();
    expect(screen.getByText("Estimate from photo")).toBeDefined();
  });

  it("asks for an uploaded photo first", () => {
    open(0);
    expect(screen.getByText(/tape measure along it/)).toBeDefined();
    fireEvent.click(screen.getByText("Estimate from photo"));
    expect(mocks.estimateFurniture).not.toHaveBeenCalled();
  });

  it("says it needs a connection offline", () => {
    mocks.online.value = false;
    open();
    expect(screen.getByText("Estimating from a photo needs a connection.")).toBeDefined();
  });

  it("says so when the photos show no furniture", async () => {
    mocks.estimateFurniture.mockResolvedValue({ data: { skipped: "no furniture in the photos" } });
    open();
    fireEvent.click(screen.getByText("Estimate from photo"));
    expect(await screen.findByText(/do not show a piece of furniture/)).toBeDefined();
  });
});
