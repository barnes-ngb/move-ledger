import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { makeContainer, makeZone } from "../../../domain/__tests__/factories";

/**
 * Stubbed at the repositories so this never reaches `lib/firebase`. What is
 * worth proving is the queue: Save and next writes and moves on, Skip moves on
 * and writes nothing, and the screen moves past a box at once rather than when
 * the subscription catches up.
 */
const mocks = vi.hoisted(() => ({
  setContainerWeight: vi.fn(),
  setContainerSize: vi.fn(),
}));
const pending = { value: undefined, written: Promise.resolve() };

vi.mock("../../../repositories", () => ({
  setContainerWeight: mocks.setContainerWeight,
  setContainerSize: mocks.setContainerSize,
  writeInBackground: (work: Promise<unknown>, onError?: (e: unknown) => void) =>
    void work.catch((e) => onError?.(e)),
}));
vi.mock("../../../hooks/usePhotos", () => ({ usePhotos: () => [] }));

const { WeighBoxes } = await import("../WeighBoxes");

const zones = [makeZone()];
const box = (n: number, over = {}) =>
  makeContainer({ id: `c${n}`, sequenceNumber: n, displayCode: String(n).padStart(3, "0"), ...over });

function open(containers = [box(7), box(3), box(5, { weightLb: 20 }), box(1, { voidedAt: "2026-11-01T00:00:00.000Z", voidedBy: "u" })]) {
  const onBack = vi.fn();
  render(<WeighBoxes moveId="m1" containers={containers} zones={zones} uid="uid-1" onBack={onBack} />);
  return onBack;
}

const weightField = () => screen.getByLabelText("Weight") as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setContainerWeight.mockReturnValue(pending);
  mocks.setContainerSize.mockReturnValue(pending);
});

describe("Weigh boxes", () => {
  it("starts at the lowest unweighed box that is not voided, and counts what is left", () => {
    open();
    expect(screen.getByText("003")).toBeDefined();
    expect(screen.getByText("2 left")).toBeDefined();
  });

  it("writes the weight on Save and next and moves to the next box", () => {
    open();
    fireEvent.change(weightField(), { target: { value: "31.5" } });
    fireEvent.click(screen.getByText("Save and next"));

    expect(mocks.setContainerWeight).toHaveBeenCalledTimes(1);
    const [, written, weight] = mocks.setContainerWeight.mock.calls[0]!;
    expect(written.id).toBe("c3");
    expect(weight).toBe(31.5);
    expect(screen.getByText("007")).toBeDefined();
    expect(screen.getByText("1 left")).toBeDefined();
    expect(weightField().value).toBe("");
  });

  it("moves on without writing on Skip", () => {
    open();
    fireEvent.click(screen.getByText("Skip"));
    expect(mocks.setContainerWeight).not.toHaveBeenCalled();
    expect(screen.getByText("007")).toBeDefined();
  });

  it("refuses a weight the schema would refuse and stays on the box", () => {
    open();
    fireEvent.change(weightField(), { target: { value: "12.34" } });
    fireEvent.click(screen.getByText("Save and next"));
    expect(mocks.setContainerWeight).not.toHaveBeenCalled();
    expect(screen.getByText("003")).toBeDefined();
    expect(screen.getByText(/to one decimal/)).toBeDefined();
  });

  it("carries a size tapped here into the weight write that follows", () => {
    open();
    fireEvent.click(screen.getByText("Large tote"));
    expect(mocks.setContainerSize.mock.calls[0]![2]).toBe("bin_large");
    fireEvent.change(weightField(), { target: { value: "30" } });
    fireEvent.click(screen.getByText("Save and next"));
    expect(mocks.setContainerWeight.mock.calls[0]![1].size).toBe("bin_large");
  });

  it("drops a typed weight when another phone weighs the box on screen", () => {
    const onBack = vi.fn();
    const props = { moveId: "m1", zones, uid: "uid-1", onBack };
    const { rerender } = render(<WeighBoxes {...props} containers={[box(3), box(7)]} />);
    fireEvent.change(weightField(), { target: { value: "31.5" } });
    rerender(<WeighBoxes {...props} containers={[box(3, { weightLb: 40 }), box(7)]} />);
    expect(screen.getByText("007")).toBeDefined();
    expect(weightField().value).toBe("");
  });

  it("puts a box back and says so when its write is refused, even past the last box", async () => {
    mocks.setContainerWeight.mockReturnValue({ value: undefined, written: Promise.reject(new Error("denied")) });
    open([box(3)]);
    fireEvent.change(weightField(), { target: { value: "31.5" } });
    fireEvent.click(screen.getByText("Save and next"));
    expect(await screen.findByText("The weight for box 003 did not save. It is back in the list.")).toBeDefined();
    expect(screen.getByText("003")).toBeDefined();
  });

  it("says every box has a weight once the queue is empty", () => {
    const onBack = open([box(3)]);
    fireEvent.click(screen.getByText("Skip"));
    expect(screen.getByText("Every box has a weight.")).toBeDefined();
    fireEvent.click(screen.getByText("Back to Space and weight"));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("Weigh boxes and furniture", () => {
  it("never puts a piece of furniture on the queue", () => {
    open([box(2, { type: "furniture", size: "other", volumeCuFt: 20 }), box(4)]);
    expect(screen.getByText("004")).toBeDefined();
    expect(screen.getByText("1 left")).toBeDefined();
  });
});
