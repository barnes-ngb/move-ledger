import { isFurniture } from "./furniture";
import { isVoided } from "./lifecycle";
import type { Container, ContainerSize, Move, Zone } from "./schemas";

/**
 * Size and weight against the container. ADR-0007 approves totals only: no
 * loading order, no layout, no suggestion of what fits where.
 *
 * Not called "load". That word belongs to the loaded status.
 */

/** The volume each named size stands for, in cubic feet. "other" carries its own figure. */
export const SIZE_VOLUME_CU_FT: Readonly<Record<Exclude<ContainerSize, "other">, number>> = {
  bin_large: 5.4, // 27 gal tote, measured 30 x 20 x 15.5 in
  bin_medium: 3.5,
  box_large: 4.5,
  box_medium: 3.0,
  box_small: 1.5,
};

/** Display order for sizes, largest tote first, which is the order the chips use. */
export const SIZE_ORDER: readonly ContainerSize[] = [
  "bin_large",
  "bin_medium",
  "box_large",
  "box_medium",
  "box_small",
  "other",
];

/** The 16 ft PODS figures, confirmed with PODS on 2026-11-14. Used when the move has none. */
export const DEFAULT_CAPACITY = { cuFt: 710, lb: 4200 } as const;

export interface Capacity {
  cuFt: number;
  lb: number;
}

export function capacityOf(move: Pick<Move, "capacityCuFt" | "capacityLb"> | null | undefined): Capacity {
  return {
    cuFt: move?.capacityCuFt ?? DEFAULT_CAPACITY.cuFt,
    lb: move?.capacityLb ?? DEFAULT_CAPACITY.lb,
  };
}

/** The box's volume, or undefined when it has no size or is "other" with no figure. */
export function volumeOf(container: Pick<Container, "size" | "volumeCuFt">): number | undefined {
  const { size } = container;
  if (!size) return undefined;
  if (size === "other") return container.volumeCuFt;
  return SIZE_VOLUME_CU_FT[size];
}

export interface ZoneTotals {
  zoneId: string | null;
  name: string;
  colorName?: string;
  colorValue?: string;
  /** Boxes in the room. Furniture is counted apart, in `pieces`. */
  count: number;
  /** Furniture and appliances in the room. */
  pieces: number;
  /** Both together. */
  volumeCuFt: number;
  weightLb: number;
  /** Boxes with no weight. A piece is never on the weighing queue. */
  notWeighed: number;
}

export interface SizeTotals {
  size: ContainerSize;
  count: number;
  volumeCuFt: number;
  weightLb: number;
}

export interface PartTotals {
  count: number;
  volumeCuFt: number;
  weightLb: number;
}

export interface SpaceAndWeight {
  /** Containers that are not voided. Every status counts. */
  counted: number;
  volumeCuFt: number;
  /**
   * Boxes with no volume: no size, or "other" with no figure. Boxes only:
   * furniture is counted in `furnitureNoSize`, so the line about boxes is not
   * swollen by pieces. APPLY-23.
   */
  noSize: number;
  /** Pieces with no cu ft. */
  furnitureNoSize: number;
  weightLb: number;
  /** The part of `weightLb` that is a guess rather than a scale reading. ADR-0008. */
  estimatedLb: number;
  /** Boxes with no weight, which is what Weigh boxes steps through. */
  notWeighed: number;
  /** Pieces with no weight. Not on the weighing queue: a dresser does not go on a bathroom scale. */
  furnitureNotWeighed: number;
  /** Furniture and appliances, counted inside every total above. */
  furniture: PartTotals;
  /** Pieces marked not sure, counted inside every total above. Subtract for the second total. */
  undecided: PartTotals;
  /**
   * The weighed total plus, for each unweighed box, the average weight of the
   * weighed boxes of its size. Estimated weights are never part of an average. Undefined when any unweighed box has no size,
   * is "other", or is a size nobody has weighed: a partial estimate would
   * understate the total the capacity decision rests on.
   */
  estimatedWeightLb?: number;
  capacity: Capacity;
  /** Rooms in `sortOrder`, then "No room" last. Only rooms with a box. */
  byZone: ZoneTotals[];
  /** Sizes in `SIZE_ORDER`, only those present. Boxes with no size are not a row. */
  bySize: SizeTotals[];
}

/** Sums of floats drift: 1.5 + 3.0 + ... reads 13.499999. Totals are shown to a tenth. */
function tidy(n: number): number {
  return Math.round(n * 10) / 10;
}

function tidyPart(p: PartTotals): PartTotals {
  return { count: p.count, volumeCuFt: tidy(p.volumeCuFt), weightLb: tidy(p.weightLb) };
}

export function spaceAndWeight(
  containers: readonly Container[],
  zones: readonly Zone[],
  capacity: Capacity = DEFAULT_CAPACITY
): SpaceAndWeight {
  const inUse = containers.filter((c) => !isVoided(c));

  let volume = 0;
  let noSize = 0;
  let furnitureNoSize = 0;
  let furnitureNotWeighed = 0;
  let weight = 0;
  let estimatedLb = 0;
  let notWeighed = 0;
  const furniture: PartTotals = { count: 0, volumeCuFt: 0, weightLb: 0 };
  const undecided: PartTotals = { count: 0, volumeCuFt: 0, weightLb: 0 };

  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const byZone = new Map<string | null, ZoneTotals>();
  const bySize = new Map<ContainerSize, SizeTotals>();
  // Weighed samples per size, for the estimate.
  const sample = new Map<ContainerSize, { sum: number; n: number }>();

  for (const c of inUse) {
    const v = volumeOf(c);
    const piece = isFurniture(c);
    if (v === undefined) {
      if (piece) furnitureNoSize += 1;
      else noSize += 1;
    } else volume += v;
    if (c.weightLb === undefined) {
      if (piece) furnitureNotWeighed += 1;
      else notWeighed += 1;
    } else {
      weight += c.weightLb;
      if (c.weightEstimated) estimatedLb += c.weightLb;
    }
    for (const part of [isFurniture(c) ? furniture : null, c.undecided ? undecided : null]) {
      if (!part) continue;
      part.count += 1;
      part.volumeCuFt += v ?? 0;
      part.weightLb += c.weightLb ?? 0;
    }

    // A room id that no longer names a room reads as no room, the same as the list.
    const zone = c.destinationZoneId ? zoneById.get(c.destinationZoneId) : undefined;
    const key = zone ? zone.id : null;
    const row =
      byZone.get(key) ??
      ({
        zoneId: key,
        name: zone?.name ?? "No room",
        colorName: zone?.colorName,
        colorValue: zone?.colorValue,
        count: 0,
        pieces: 0,
        volumeCuFt: 0,
        weightLb: 0,
        notWeighed: 0,
      } satisfies ZoneTotals);
    if (piece) row.pieces += 1;
    else row.count += 1;
    row.volumeCuFt += v ?? 0;
    row.weightLb += c.weightLb ?? 0;
    if (c.weightLb === undefined && !piece) row.notWeighed += 1;
    byZone.set(key, row);

    // By size is about boxes. A piece is size "other" by construction and has
    // its own section, so it is left out here rather than swelling Other.
    if (c.size && !piece) {
      const s = bySize.get(c.size) ?? { size: c.size, count: 0, volumeCuFt: 0, weightLb: 0 };
      s.count += 1;
      s.volumeCuFt += v ?? 0;
      s.weightLb += c.weightLb ?? 0;
      bySize.set(c.size, s);
      // A guess never stands in as a measurement for other boxes. ADR-0008.
      if (c.weightLb !== undefined && !c.weightEstimated) {
        const w = sample.get(c.size) ?? { sum: 0, n: 0 };
        w.sum += c.weightLb;
        w.n += 1;
        sample.set(c.size, w);
      }
    }
  }

  let estimate: number | undefined = weight;
  for (const c of inUse) {
    if (c.weightLb !== undefined) continue;
    const w = c.size && c.size !== "other" ? sample.get(c.size) : undefined;
    if (!w) {
      estimate = undefined;
      break;
    }
    estimate += w.sum / w.n;
  }
  // With nothing unweighed the estimate is the total itself, and the screen
  // only reads it while something is unweighed.
  const estimatedWeightLb = notWeighed === 0 && furnitureNotWeighed === 0 ? weight : estimate;

  const zoneRows = [...byZone.values()].sort((a, b) => {
    if (a.zoneId === null) return 1;
    if (b.zoneId === null) return -1;
    return (zoneById.get(a.zoneId)?.sortOrder ?? 0) - (zoneById.get(b.zoneId)?.sortOrder ?? 0);
  });
  const sizeRows = SIZE_ORDER.flatMap((s) => {
    const row = bySize.get(s);
    return row ? [row] : [];
  });

  return {
    counted: inUse.length,
    volumeCuFt: tidy(volume),
    noSize,
    furnitureNoSize,
    weightLb: tidy(weight),
    estimatedLb: tidy(estimatedLb),
    notWeighed,
    furnitureNotWeighed,
    furniture: tidyPart(furniture),
    undecided: tidyPart(undecided),
    ...(estimatedWeightLb === undefined ? {} : { estimatedWeightLb: Math.round(estimatedWeightLb) }),
    capacity,
    byZone: zoneRows.map((r) => ({ ...r, volumeCuFt: tidy(r.volumeCuFt), weightLb: tidy(r.weightLb) })),
    bySize: sizeRows.map((r) => ({ ...r, volumeCuFt: tidy(r.volumeCuFt), weightLb: tidy(r.weightLb) })),
  };
}

/** What a size is called on screen. Glossary: code never says tote, the interface never shows the code value. */
export function sizeLabel(size: ContainerSize): string {
  switch (size) {
    case "bin_large":
      return "Large tote";
    case "bin_medium":
      return "Medium tote";
    case "box_large":
      return "Large box";
    case "box_medium":
      return "Medium box";
    case "box_small":
      return "Small box";
    case "other":
      return "Other";
  }
}
