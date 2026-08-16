import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Move, Zone } from "../../../domain";
import { makeZone } from "../../../domain/__tests__/factories";
import { PALETTE } from "../../../lib/palette";

/**
 * Changing the colour a room is written in.
 *
 * The colour is assigned at creation and was fixed forever after, which is the
 * wrong way round: the physical system is sticker sheets somebody bought, so
 * the app matches those rather than ruling on them. What is asserted here is
 * that the choice is the named palette and nothing else, that it goes through
 * `updateZone`, and that two rooms wearing one colour is a note rather than a
 * refusal.
 */
const mocks = vi.hoisted(() => ({ updateZone: vi.fn(), addZone: vi.fn(), updateMove: vi.fn() }));

const pending = { value: undefined, written: Promise.resolve() };

vi.mock("../../../repositories", () => ({
  updateZone: mocks.updateZone,
  addZone: mocks.addZone,
  updateMove: mocks.updateMove,
  writeInBackground: (work: Promise<unknown>) => void work.catch(() => undefined),
}));

const { Rooms } = await import("../Rooms");

const move: Move = {
  id: "m1",
  name: "KC to DFW",
  status: "packing",
  destinationLocationId: "l1",
  memberUids: ["uid-1"],
  createdAt: "2026-08-16T12:00:00.000Z",
  updatedAt: "2026-08-16T12:00:00.000Z",
};

const kitchen = makeZone({ id: "z1", name: "Kitchen", colorName: "BLUE", colorValue: "#2563c9" });
const garage = makeZone({ id: "z2", name: "Garage", colorName: "RED", colorValue: "#dc2626" });

function open(zones: Zone[]) {
  render(<Rooms move={move} zones={zones} onDone={() => undefined} onBack={null} />);
}

function openPicker(room: string) {
  fireEvent.click(screen.getByLabelText(`Change the color for ${room}`));
}

/** The palette chip, by the sentence it reads out rather than by the word,
 *  which also appears on the room rows and on the next-color line. */
function chip(color: string, room: string): HTMLElement {
  return screen.getByLabelText(`Write ${color} on ${room} boxes`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateZone.mockReturnValue(pending);
  mocks.addZone.mockReturnValue(pending);
  mocks.updateMove.mockReturnValue(pending);
});

describe("a room's color", () => {
  it("offers the fixed palette and nothing a person could type", () => {
    open([kitchen, garage]);
    openPicker("Kitchen");
    for (const p of PALETTE) expect(chip(p.name, "Kitchen")).toBeDefined();
    // colorName is written on cardboard with a marker, per doc 09. A color
    // input would produce something nobody can write.
    expect(document.querySelector('input[type="color"]')).toBeNull();
  });

  it("writes the name and the value together, through updateZone", () => {
    open([kitchen, garage]);
    openPicker("Kitchen");
    fireEvent.click(chip("GREEN", "Kitchen"));
    expect(mocks.updateZone).toHaveBeenCalledWith("m1", {
      ...kitchen,
      colorName: "GREEN",
      colorValue: "#16a34a",
    });
  });

  it("changes only the room that was asked about", () => {
    open([kitchen, garage]);
    openPicker("Garage");
    fireEvent.click(chip("PURPLE", "Garage"));
    expect(mocks.updateZone).toHaveBeenCalledTimes(1);
    expect(mocks.updateZone.mock.calls[0]![1]).toMatchObject({ id: "z2", colorName: "PURPLE" });
  });

  it("says which room already has a color without refusing it", () => {
    open([kitchen, garage]);
    openPicker("Kitchen");
    expect(screen.getByText("also Garage")).toBeDefined();

    fireEvent.click(chip("RED", "Kitchen"));
    expect(mocks.updateZone).toHaveBeenCalledTimes(1);
  });

  it("says so gently once two rooms share one", () => {
    open([kitchen, makeZone({ id: "z2", name: "Garage", colorName: "BLUE", colorValue: "#2563c9" })]);
    expect(screen.getByText(/Kitchen and Garage are both BLUE/)).toBeDefined();
    expect(screen.getByText(/matches your stickers/)).toBeDefined();
  });

  it("says nothing when every room has its own", () => {
    open([kitchen, garage]);
    expect(screen.queryByText(/are both/)).toBeNull();
  });

  it("closes without changing anything when the color is kept", () => {
    open([kitchen]);
    openPicker("Kitchen");
    fireEvent.click(screen.getByText("Keep BLUE"));
    expect(mocks.updateZone).not.toHaveBeenCalled();
    expect(screen.queryByText("Keep BLUE")).toBeNull();
  });
});
