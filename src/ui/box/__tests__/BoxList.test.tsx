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
    onBack: vi.fn(),
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

  /**
   * The marker with no query typed, which is what makes reviewing a suggestion
   * later a thing a person can do rather than a thing they have to remember.
   * Accept and dismiss both clear `aiSummary`, so its presence is the question.
   */
  it("marks a box carrying a suggestion nobody has answered", () => {
    renderList({ containers });
    expect(screen.getByText("A suggestion nobody has confirmed")).toBeDefined();
  });

  it("leaves a box with no suggestion unmarked", () => {
    renderList({ containers: [makeContainer({ id: "c1", notes: "kettle and mugs" })] });
    expect(screen.queryByText(/suggestion nobody has confirmed/)).toBeNull();
  });

  it("leaves a box whose suggestion was accepted unmarked", () => {
    renderList({
      containers: [makeContainer({ id: "c1", contentsSummary: "Books, a lamp, two mugs" })],
    });
    expect(screen.queryByText(/suggestion nobody has confirmed/)).toBeNull();
  });

  /** One line, so a searched row does not carry both wordings at once. */
  it("does not stack the two markers on a searched row", () => {
    renderList({ containers, query: "subaru" });
    expect(screen.getByText("Matched a suggestion nobody has confirmed")).toBeDefined();
    expect(screen.queryByText("A suggestion nobody has confirmed")).toBeNull();
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

  /**
   * A box with no room has no color to write on it and nowhere to be put down
   * at the other end. Grey text reads as an absence; this has to read as a
   * thing to go and fix.
   */
  it("marks a box with no room rather than leaving the row blank", () => {
    renderList({ containers: [makeContainer({ destinationZoneId: undefined })] });
    expect(screen.getByText("No room. Open it and pick one.")).toBeDefined();
  });

  it("says the room by name when there is one", () => {
    renderList({ containers: [makeContainer({ destinationZoneId: "z1" })] });
    expect(screen.getByText("Kitchen")).toBeDefined();
    expect(screen.queryByText(/No room/)).toBeNull();
  });

  it("goes back from both the top control and the bottom one", () => {
    const { onBack } = renderList({ containers });
    for (const control of screen.getAllByText("Back")) fireEvent.click(control);
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("names both conditions on a row carrying both", () => {
    const report = { reportedAt: "2026-08-15T12:00:00.000Z", reportedBy: "mem1", photoIds: [] };
    renderList({
      containers: [makeContainer({ conditions: { missing: report, damaged: report } })],
    });
    expect(screen.getByText("missing, damaged")).toBeDefined();
  });

  describe("voided boxes", () => {
    const withVoided = [
      ...containers,
      makeContainer({
        id: "c4",
        sequenceNumber: 20,
        displayCode: "020",
        notes: "kettle spare",
        voidedAt: "2026-08-15T12:00:00.000Z",
        voidedBy: "mem1",
      }),
    ];

    it("hides them until they are asked for", () => {
      renderList({ containers: withVoided });
      expect(screen.queryByText("020")).toBeNull();
      expect(screen.getByText("3 boxes")).toBeDefined();
    });

    it("reveals them on the control, reading as voided", () => {
      renderList({ containers: withVoided });
      fireEvent.click(screen.getByText("Show 1 voided box"));
      expect(screen.getByText("020")).toBeDefined();
      expect(screen.getByText("voided")).toBeDefined();
    });

    it("hides them again", () => {
      renderList({ containers: withVoided });
      fireEvent.click(screen.getByText("Show 1 voided box"));
      fireEvent.click(screen.getByText("Hide voided boxes"));
      expect(screen.queryByText("020")).toBeNull();
    });

    it("offers no control when nothing is voided", () => {
      renderList({ containers });
      expect(screen.queryByText(/voided/)).toBeNull();
    });

    /**
     * The reason the filter lives in this component. Search reads the list
     * this screen is already showing, so a retired box does not come back for
     * a word it happens to contain, and nothing above the component has to
     * know that voided boxes exist.
     */
    it("keeps them out of search results", () => {
      renderList({ containers: withVoided, query: "kettle" });
      expect(screen.getByText("012")).toBeDefined();
      expect(screen.queryByText("020")).toBeNull();
    });

    it("includes them in search once they are revealed", () => {
      renderList({ containers: withVoided, query: "kettle" });
      fireEvent.click(screen.getByText("Show 1 voided box"));
      expect(screen.getByText("020")).toBeDefined();
    });

    /**
     * A retired number is not a box to go and review. The row already reads
     * "voided" instead of a status for the same reason: it says the box is out
     * of use rather than what to do about it.
     */
    it("does not ask for a suggestion on a box to be reviewed", () => {
      renderList({
        containers: [
          makeContainer({
            id: "c5",
            aiSummary: "Books, a lamp, two mugs",
            voidedAt: "2026-08-15T12:00:00.000Z",
            voidedBy: "mem1",
          }),
        ],
      });
      fireEvent.click(screen.getByText("Show 1 voided box"));
      expect(screen.queryByText("A suggestion nobody has confirmed")).toBeNull();
    });

    /** The search marker survives, because it answers why the row came back. */
    it("still says why a voided row came back for a word only the suggestion holds", () => {
      renderList({
        containers: [
          makeContainer({
            id: "c5",
            aiSummary: "Books, a lamp, two mugs",
            voidedAt: "2026-08-15T12:00:00.000Z",
            voidedBy: "mem1",
          }),
        ],
        query: "lamp",
      });
      fireEvent.click(screen.getByText("Show 1 voided box"));
      expect(screen.getByText("Matched a suggestion nobody has confirmed")).toBeDefined();
    });
  });
});
