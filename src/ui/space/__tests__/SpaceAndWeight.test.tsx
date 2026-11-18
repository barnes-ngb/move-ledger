import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Container } from "../../../domain";
import { makeContainer, makeZone } from "../../../domain/__tests__/factories";

const mocks = vi.hoisted(() => ({ setMoveCapacity: vi.fn() }));
vi.mock("../../../repositories", () => ({
  setMoveCapacity: mocks.setMoveCapacity,
  writeInBackground: (work: Promise<unknown>) => void work.catch(() => undefined),
}));

const { SpaceAndWeight } = await import("../SpaceAndWeight");

const zones = [makeZone({ id: "z1", name: "Kitchen" })];
const box = (n: number, over: Partial<Container> = {}) =>
  makeContainer({ id: `c${n}`, sequenceNumber: n, displayCode: String(n).padStart(3, "0"), ...over });

function open(containers: Container[], move = {}, loaded = true) {
  const onWeigh = vi.fn();
  render(
    <SpaceAndWeight
      moveId="m1"
      move={move}
      containers={containers}
      loaded={loaded}
      zones={zones}
      onWeigh={onWeigh}
      onAddFurniture={vi.fn()}
      onOpenBox={vi.fn()}
      onBack={vi.fn()}
    />
  );
  return onWeigh;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setMoveCapacity.mockReturnValue({ value: undefined, written: Promise.resolve() });
});

describe("Space and weight", () => {
  it("says Loading before the first delivery rather than a total of nothing", () => {
    open([], {}, false);
    expect(screen.getByText("Loading")).toBeDefined();
  });

  it("says there are no boxes yet on an empty move", () => {
    open([]);
    expect(screen.getByText(/No boxes yet/)).toBeDefined();
  });

  it("says by how much a total is over capacity", () => {
    open([box(1, { size: "other", volumeCuFt: 20, weightLb: 300 })], { capacityCuFt: 10, capacityLb: 4200 });
    expect(screen.getByText("10 cu ft over")).toBeDefined();
    expect(screen.queryByText(/lb over/)).toBeNull();
  });

  it("states the unweighed boxes and the estimate with them", () => {
    open([
      box(1, { size: "bin_large", weightLb: 30 }),
      box(2, { size: "bin_large", weightLb: 40 }),
      box(3, { size: "bin_large" }),
    ]);
    expect(screen.getByText("1 box not weighed yet. Estimate with them: 105 lb.")).toBeDefined();
  });

  it("leaves the estimate off when it cannot be made, and counts the boxes with no size", () => {
    open([box(1, { size: "bin_large", weightLb: 30 }), box(2), box(3)]);
    expect(screen.getByText("2 boxes not weighed yet.")).toBeDefined();
    expect(screen.getByText("2 boxes have no size.")).toBeDefined();
  });

  it("offers Weigh boxes only while a box is unweighed", () => {
    const onWeigh = open([box(1)]);
    fireEvent.click(screen.getByText("Weigh boxes"));
    expect(onWeigh).toHaveBeenCalled();
  });

  it("hides Weigh boxes when every box has a weight", () => {
    open([box(1, { weightLb: 10 })]);
    expect(screen.queryByText("Weigh boxes")).toBeNull();
  });

  it("shows the rooms, with no room last", () => {
    open([box(1, { destinationZoneId: "z1" }), box(2)]);
    expect(screen.getByText("Kitchen")).toBeDefined();
    expect(screen.getByText("No room")).toBeDefined();
  });

  it("fills the capacity from the defaults and saves an edit on blur", () => {
    open([box(1)]);
    const cuFt = screen.getByLabelText("Usable space") as HTMLInputElement;
    expect(cuFt.value).toBe("710");
    fireEvent.change(cuFt, { target: { value: "1420" } });
    fireEvent.blur(cuFt);
    expect(mocks.setMoveCapacity).toHaveBeenCalledWith("m1", { capacityCuFt: 1420 });
  });

  it("follows another phone's change while the field is untouched, and does not write it back", () => {
    const props = {
      moveId: "m1",
      containers: [box(1)],
      loaded: true,
      zones,
      onWeigh: vi.fn(),
      onAddFurniture: vi.fn(),
      onOpenBox: vi.fn(),
      onBack: vi.fn(),
    };
    const { rerender } = render(<SpaceAndWeight {...props} move={{}} />);
    rerender(<SpaceAndWeight {...props} move={{ capacityCuFt: 1420, capacityLb: 8400 }} />);
    const lb = screen.getByLabelText("Weight limit") as HTMLInputElement;
    expect(lb.value).toBe("8400");
    fireEvent.blur(lb);
    expect(mocks.setMoveCapacity).not.toHaveBeenCalled();
  });

  it("writes nothing when the capacity did not change", () => {
    open([box(1)]);
    fireEvent.blur(screen.getByLabelText("Usable space"));
    expect(mocks.setMoveCapacity).not.toHaveBeenCalled();
  });
});

describe("Space and weight furniture", () => {
  const piece = (n: number, over: Partial<Container> = {}) =>
    box(n, { type: "furniture", size: "other", volumeCuFt: 25, weightLb: 150, weightEstimated: true, title: "Dresser", ...over });

  it("lists each piece and says how much of the weight is a guess", () => {
    open([box(1, { size: "bin_large", weightLb: 30 }), piece(2)]);
    expect(screen.getByText("Dresser")).toBeDefined();
    expect(screen.getByText("150 lb of that is a guess, not a scale reading.")).toBeDefined();
    expect(screen.getByText(/25 cu ft, 150 lb guessed/)).toBeDefined();
  });

  it("gives the total without the pieces not sure they are going", () => {
    open([box(1, { size: "bin_large", weightLb: 30 }), piece(2, { undecided: true })]);
    expect(screen.getByText(/Without the piece you're not sure about: 5.4 cu ft, 30 lb./)).toBeDefined();
  });

  it("opens a piece and offers Add furniture", () => {
    const onOpenBox = vi.fn();
    const onAddFurniture = vi.fn();
    render(
      <SpaceAndWeight
        moveId="m1"
        move={{}}
        containers={[piece(2)]}
        loaded
        zones={zones}
        onWeigh={vi.fn()}
        onAddFurniture={onAddFurniture}
        onOpenBox={onOpenBox}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Dresser"));
    expect(onOpenBox.mock.calls[0]![0].id).toBe("c2");
    fireEvent.click(screen.getByText("Add furniture"));
    expect(onAddFurniture).toHaveBeenCalled();
  });
});

describe("Space and weight on an empty move", () => {
  it("still offers Add furniture", () => {
    open([]);
    expect(screen.getByText("Add furniture")).toBeDefined();
  });
});

describe("Space and weight counts boxes and furniture apart", () => {
  it("does not count a piece in the boxes lines, and says what a piece is missing", () => {
    open([
      box(1),
      box(2, { type: "furniture", size: "other", volumeCuFt: 20, destinationZoneId: "z1" }),
    ]);
    expect(screen.getByText("1 box has no size.")).toBeDefined();
    expect(screen.getByText("1 box not weighed yet.")).toBeDefined();
    expect(screen.getByText(/1 piece of furniture has no weight/)).toBeDefined();
    expect(screen.getByText("1 box, 0 cu ft, 0 lb. 1 not weighed")).toBeDefined();
    expect(screen.getAllByText(/^1 piece, 20 cu ft/).length).toBeGreaterThan(0);
  });
});
