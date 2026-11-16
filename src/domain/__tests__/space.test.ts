import { describe, expect, it } from "vitest";
import { DEFAULT_CAPACITY, capacityOf, sizeLabel, spaceAndWeight, volumeOf } from "../space";
import { makeContainer, makeZone } from "./factories";

const kitchen = makeZone({ id: "z1", name: "Kitchen", sortOrder: 1 });
const office = makeZone({ id: "z2", name: "Office", colorName: "GREEN", sortOrder: 0 });
const zones = [kitchen, office];

let n = 0;
function box(over: Parameters<typeof makeContainer>[0] = {}) {
  n += 1;
  return makeContainer({ id: `c${n}`, sequenceNumber: n, displayCode: String(n).padStart(3, "0"), ...over });
}

describe("volumeOf", () => {
  it("reads the table for a named size", () => {
    expect(volumeOf({ size: "bin_large" })).toBe(5.4);
    expect(volumeOf({ size: "bin_medium" })).toBe(3.5);
    expect(volumeOf({ size: "box_large" })).toBe(4.5);
    expect(volumeOf({ size: "box_medium" })).toBe(3.0);
    expect(volumeOf({ size: "box_small" })).toBe(1.5);
  });

  it("reads the typed figure for other, and nothing without one", () => {
    expect(volumeOf({ size: "other", volumeCuFt: 30 })).toBe(30);
    expect(volumeOf({ size: "other" })).toBeUndefined();
  });

  it("ignores a stray figure on a named size", () => {
    expect(volumeOf({ size: "box_small", volumeCuFt: 30 })).toBe(1.5);
  });

  it("has nothing for a box with no size", () => {
    expect(volumeOf({})).toBeUndefined();
  });
});

describe("spaceAndWeight", () => {
  it("totals volume and weight and counts the gaps", () => {
    const t = spaceAndWeight(
      [
        box({ size: "bin_large", weightLb: 30 }),
        box({ size: "box_small", weightLb: 12.5 }),
        box({ size: "box_small" }),
        box({}),
      ],
      zones
    );
    expect(t.counted).toBe(4);
    expect(t.volumeCuFt).toBe(8.4);
    expect(t.noSize).toBe(1);
    expect(t.weightLb).toBe(42.5);
    expect(t.notWeighed).toBe(2);
  });

  it("leaves voided boxes out of everything and counts every status", () => {
    const t = spaceAndWeight(
      [
        box({ size: "bin_large", weightLb: 30, status: "loaded" }),
        box({ size: "bin_large", weightLb: 30, voidedAt: "2026-11-01T00:00:00.000Z", voidedBy: "u1" }),
        box({ size: "box_small", status: "filling" }),
      ],
      zones
    );
    expect(t.counted).toBe(2);
    expect(t.volumeCuFt).toBe(6.9);
    expect(t.weightLb).toBe(30);
    expect(t.notWeighed).toBe(1);
  });

  it("estimates an unweighed box from the average of its size", () => {
    const t = spaceAndWeight(
      [
        box({ size: "bin_large", weightLb: 30 }),
        box({ size: "bin_large", weightLb: 40 }),
        box({ size: "bin_large" }),
      ],
      zones
    );
    expect(t.weightLb).toBe(70);
    expect(t.estimatedWeightLb).toBe(105);
  });

  it("gives no estimate when an unweighed box has no size", () => {
    const t = spaceAndWeight([box({ size: "bin_large", weightLb: 30 }), box({})], zones);
    expect(t.estimatedWeightLb).toBeUndefined();
  });

  it("gives no estimate when an unweighed box is other", () => {
    const t = spaceAndWeight(
      [box({ size: "other", volumeCuFt: 20, weightLb: 80 }), box({ size: "other", volumeCuFt: 20 })],
      zones
    );
    expect(t.estimatedWeightLb).toBeUndefined();
  });

  it("gives no estimate when nobody has weighed a box of that size", () => {
    const t = spaceAndWeight([box({ size: "bin_large", weightLb: 30 }), box({ size: "box_small" })], zones);
    expect(t.estimatedWeightLb).toBeUndefined();
  });

  it("groups by room in room order with no room last", () => {
    const t = spaceAndWeight(
      [
        box({ destinationZoneId: "z1", size: "box_small", weightLb: 10 }),
        box({ size: "box_small" }),
        box({ destinationZoneId: "z2", size: "bin_large", weightLb: 20 }),
        box({ destinationZoneId: "z1", size: "box_small" }),
        box({ destinationZoneId: "gone" }),
      ],
      zones
    );
    expect(t.byZone.map((r) => r.name)).toEqual(["Office", "Kitchen", "No room"]);
    const kit = t.byZone[1]!;
    expect(kit).toMatchObject({ zoneId: "z1", count: 2, volumeCuFt: 3, weightLb: 10, notWeighed: 1 });
    const none = t.byZone[2]!;
    expect(none).toMatchObject({ zoneId: null, count: 2, notWeighed: 2 });
  });

  it("lists sizes present, largest tote first", () => {
    const t = spaceAndWeight(
      [box({ size: "box_small" }), box({ size: "bin_large", weightLb: 30 }), box({})],
      zones
    );
    expect(t.bySize.map((r) => r.size)).toEqual(["bin_large", "box_small"]);
    expect(t.bySize[0]).toMatchObject({ count: 1, volumeCuFt: 5.4, weightLb: 30 });
  });

  it("uses the 16 ft PODS figures when the move has none", () => {
    expect(spaceAndWeight([], zones).capacity).toEqual({ cuFt: 710, lb: 4200 });
    expect(capacityOf({})).toEqual(DEFAULT_CAPACITY);
    expect(capacityOf({ capacityCuFt: 1420, capacityLb: 8400 })).toEqual({ cuFt: 1420, lb: 8400 });
  });

  it("does not drift on sums of tenths", () => {
    const many = Array.from({ length: 9 }, () => box({ size: "box_small", weightLb: 0.1 }));
    const t = spaceAndWeight(many, zones);
    expect(t.volumeCuFt).toBe(13.5);
    expect(t.weightLb).toBe(0.9);
  });
});

describe("sizeLabel", () => {
  it("says tote and box, never the code value", () => {
    expect(sizeLabel("bin_large")).toBe("Large tote");
    expect(sizeLabel("box_small")).toBe("Small box");
    expect(sizeLabel("other")).toBe("Other");
  });
});

describe("spaceAndWeight furniture", () => {
  it("counts furniture inside the totals and says how much weight is estimated", () => {
    const t = spaceAndWeight(
      [
        box({ size: "bin_large", weightLb: 30 }),
        box({ type: "furniture", size: "other", volumeCuFt: 25, weightLb: 150, weightEstimated: true }),
        box({ type: "appliance", size: "other", volumeCuFt: 20, weightLb: 180, weightEstimated: true }),
      ],
      zones
    );
    expect(t.volumeCuFt).toBe(50.4);
    expect(t.weightLb).toBe(360);
    expect(t.estimatedLb).toBe(330);
    expect(t.furniture).toEqual({ count: 2, volumeCuFt: 45, weightLb: 330 });
  });

  it("totals the pieces not sure they are going, without taking them out", () => {
    const t = spaceAndWeight(
      [
        box({ size: "bin_large", weightLb: 30 }),
        box({ type: "furniture", size: "other", volumeCuFt: 40, weightLb: 200, weightEstimated: true, undecided: true }),
      ],
      zones
    );
    expect(t.weightLb).toBe(230);
    expect(t.undecided).toEqual({ count: 1, volumeCuFt: 40, weightLb: 200 });
  });

  it("never lets an estimated weight stand in for weighed boxes of its size", () => {
    const t = spaceAndWeight(
      [box({ size: "bin_large", weightLb: 60, weightEstimated: true }), box({ size: "bin_large" })],
      zones
    );
    expect(t.estimatedWeightLb).toBeUndefined();
  });
});

describe("furniture presets", () => {
  it("has unique ids and figures the schema accepts", async () => {
    const { FURNITURE_PRESETS } = await import("../furniture");
    const ids = FURNITURE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of FURNITURE_PRESETS) {
      expect(p.cuFt).toBeGreaterThan(0);
      expect(p.cuFt).toBeLessThanOrEqual(200);
      expect(p.lb).toBeGreaterThan(0);
      expect(p.lb).toBeLessThanOrEqual(500);
    }
  });
});
