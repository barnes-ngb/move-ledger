import type { Container, Zone } from "../schemas";

const NOW = "2026-07-25T18:00:00.000Z";

export function makeContainer(over: Partial<Container> = {}): Container {
  return {
    id: over.id ?? "c1",
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

export function makeZone(over: Partial<Zone> = {}): Zone {
  return {
    id: "z1",
    moveId: "m1",
    locationId: "l1",
    name: "Kitchen",
    shortCode: "KIT",
    colorName: "BLUE",
    colorValue: "#2563c9",
    sortOrder: 0,
    ...over,
  };
}
