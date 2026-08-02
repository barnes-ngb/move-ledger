import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FindBox } from "../FindBox";
import type { Container, Zone } from "../../../domain";

const NOW = "2026-08-02T12:00:00.000Z";

function box(over: Partial<Container>): Container {
  return {
    id: "c1",
    moveId: "m1",
    sequenceNumber: 42,
    displayCode: "042",
    type: "box",
    ownerMemberId: "mem1",
    status: "packed",
    unpackPriority: "normal",
    flags: {
      fragile: false,
      heavy: false,
      keepUpright: false,
      doNotStack: false,
      containsLiquids: false,
      temperatureSensitive: false,
      highValue: false,
      importantDocuments: false,
    },
    conditions: {},
    createdAt: NOW,
    createdBy: "mem1",
    updatedAt: NOW,
    updatedBy: "mem1",
    searchText: "",
    ...over,
  };
}

const zones: Zone[] = [];

describe("FindBox", () => {
  it("narrows as digits are typed", () => {
    const boxes = [
      box({ id: "a", sequenceNumber: 4, displayCode: "004" }),
      box({ id: "b", sequenceNumber: 42, displayCode: "042" }),
      box({ id: "c", sequenceNumber: 43, displayCode: "043" }),
    ];
    render(<FindBox containers={boxes} zones={zones} onOpen={() => undefined} />);
    fireEvent.click(screen.getByText("4"));
    expect(screen.getByText("3 boxes")).toBeDefined();
  });

  it("opens the box outright once one match remains", () => {
    const onOpen = vi.fn();
    const boxes = [
      box({ id: "a", sequenceNumber: 4, displayCode: "004" }),
      box({ id: "b", sequenceNumber: 42, displayCode: "042" }),
    ];
    render(<FindBox containers={boxes} zones={zones} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("4"));
    fireEvent.click(screen.getByText("2"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]?.[0]?.id).toBe("b");
  });
});
