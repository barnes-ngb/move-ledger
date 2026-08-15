import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BoxList } from "../BoxList";
import { makeContainer, makeZone } from "../../../domain/__tests__/factories";

const zones = [makeZone(), makeZone({ id: "z2", name: "Garage", colorName: "RED", colorValue: "#b91c1c" })];

function renderList(over: Partial<Parameters<typeof BoxList>[0]> = {}) {
  const props = {
    containers: [],
    zones,
    photoCounts: {},
    query: "",
    onQueryChange: vi.fn(),
    onOpen: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<BoxList {...props} />);
  return props;
}

describe("BoxList", () => {
  const containers = [
    makeContainer({ id: "c1", sequenceNumber: 12, displayCode: "012", notes: "kettle and mugs", destinationZoneId: "z1" }),
    makeContainer({ id: "c2", sequenceNumber: 15, displayCode: "015", destinationZoneId: "z2", aiSummary: "'Travel + Leisure' magazine, Subaru brochure" }),
    makeContainer({ id: "c3", sequenceNumber: 3, displayCode: "003", status: "filling", destinationZoneId: "z1" }),
  ];

  it("shows every box with the newest on top when nothing is typed", () => {
    renderList({ containers });
    const numbers = screen.getAllByText(/^0\d\d$/).map((n) => n.textContent);
    expect(numbers).toEqual(["015", "012", "003"]);
  });

  it("calls a filling box a draft", () => {
    renderList({ containers });
    expect(screen.getByText("draft")).toBeDefined();
    expect(screen.queryByText("filling")).toBeNull();
  });

  it("counts the photos on a box that has them", () => {
    renderList({ containers, photoCounts: { c1: 1, c2: 4 } });
    expect(screen.getByText("1 photo")).toBeDefined();
    expect(screen.getByText("4 photos")).toBeDefined();
  });

  it("filters to the boxes the words reach", () => {
    renderList({ containers, query: "travel leisure" });
    expect(screen.getByText("015")).toBeDefined();
    expect(screen.queryByText("012")).toBeNull();
    expect(screen.getByText("1 of 3 boxes")).toBeDefined();
  });

  it("marks a row that only an unconfirmed summary matched", () => {
    renderList({ containers, query: "subaru" });
    expect(screen.getByText("Matched a suggestion nobody has confirmed")).toBeDefined();
  });

  it("does not mark a row that confirmed text matched", () => {
    renderList({ containers, query: "kettle" });
    expect(screen.queryByText("Matched a suggestion nobody has confirmed")).toBeNull();
  });

  it("opens the box that was tapped", () => {
    const onOpen = vi.fn();
    renderList({ containers, onOpen });
    fireEvent.click(screen.getByText("012"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]?.[0]?.id).toBe("c1");
  });

  it("says there are no boxes rather than showing an empty list", () => {
    renderList({ containers: [] });
    expect(screen.getByText(/No boxes yet/)).toBeDefined();
  });

  it("says nothing matched when the move has boxes and the words reach none", () => {
    renderList({ containers, query: "trombone" });
    expect(screen.getByText(/No box matches that/)).toBeDefined();
  });
});
