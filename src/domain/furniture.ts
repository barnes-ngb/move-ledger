import type { Container } from "./schemas";

/**
 * Typical size and weight for a piece of furniture, written by a person as a
 * rule of thumb. Picking one on Add furniture fills both fields, which stay
 * editable. Not a measurement: a weight that comes from here is stored with
 * `weightEstimated`. ADR-0008.
 *
 * Cu ft is the space the piece takes in the container as it travels, so a bed
 * frame is counted taken apart and a mattress on its side. Pounds lean high
 * rather than low, because the decision these feed has a hard limit.
 */
export interface FurniturePreset {
  id: string;
  /** What the chip says and what the title is filled with. */
  label: string;
  /** Group heading on the picker. */
  group: "Beds" | "Bedroom" | "Living" | "Kitchen and dining" | "Office" | "Appliances" | "Outdoor and other";
  type: "furniture" | "appliance";
  cuFt: number;
  lb: number;
}

export const FURNITURE_PRESETS: readonly FurniturePreset[] = [
  { id: "mattress_king", label: "King mattress", group: "Beds", type: "furniture", cuFt: 45, lb: 100 },
  { id: "mattress_queen", label: "Queen mattress", group: "Beds", type: "furniture", cuFt: 35, lb: 80 },
  { id: "mattress_full", label: "Full mattress", group: "Beds", type: "furniture", cuFt: 28, lb: 65 },
  { id: "mattress_twin", label: "Twin mattress", group: "Beds", type: "furniture", cuFt: 18, lb: 45 },
  { id: "frame_king", label: "King bed frame, apart", group: "Beds", type: "furniture", cuFt: 12, lb: 100 },
  { id: "frame_queen", label: "Queen bed frame, apart", group: "Beds", type: "furniture", cuFt: 10, lb: 85 },
  { id: "frame_full", label: "Full bed frame, apart", group: "Beds", type: "furniture", cuFt: 8, lb: 70 },
  { id: "headboard", label: "Headboard", group: "Beds", type: "furniture", cuFt: 8, lb: 40 },
  { id: "crib", label: "Crib, apart", group: "Beds", type: "furniture", cuFt: 10, lb: 50 },

  { id: "dresser_wide", label: "Dresser, wide", group: "Bedroom", type: "furniture", cuFt: 25, lb: 150 },
  { id: "dresser_tall", label: "Chest of drawers", group: "Bedroom", type: "furniture", cuFt: 18, lb: 110 },
  { id: "nightstand", label: "Nightstand", group: "Bedroom", type: "furniture", cuFt: 5, lb: 35 },
  { id: "mirror", label: "Large mirror or frame", group: "Bedroom", type: "furniture", cuFt: 4, lb: 30 },

  { id: "sofa", label: "Sofa", group: "Living", type: "furniture", cuFt: 60, lb: 160 },
  { id: "loveseat", label: "Loveseat", group: "Living", type: "furniture", cuFt: 40, lb: 110 },
  { id: "armchair", label: "Armchair", group: "Living", type: "furniture", cuFt: 25, lb: 70 },
  { id: "tv", label: "TV, 50 to 65 in", group: "Living", type: "furniture", cuFt: 8, lb: 50 },
  { id: "tv_stand", label: "TV stand or console", group: "Living", type: "furniture", cuFt: 15, lb: 80 },
  { id: "bookcase", label: "Bookcase, tall", group: "Living", type: "furniture", cuFt: 15, lb: 75 },
  { id: "cube_shelf", label: "Cube shelf", group: "Living", type: "furniture", cuFt: 15, lb: 75 },
  { id: "cabinet", label: "Storage cabinet", group: "Living", type: "furniture", cuFt: 20, lb: 90 },
  { id: "rug", label: "Rug, rolled", group: "Living", type: "furniture", cuFt: 5, lb: 40 },

  { id: "table", label: "Dining table, apart", group: "Kitchen and dining", type: "furniture", cuFt: 15, lb: 90 },
  { id: "chair", label: "Dining chair", group: "Kitchen and dining", type: "furniture", cuFt: 6, lb: 15 },
  { id: "hutch", label: "Hutch", group: "Kitchen and dining", type: "furniture", cuFt: 40, lb: 200 },
  { id: "microwave", label: "Microwave", group: "Kitchen and dining", type: "appliance", cuFt: 3, lb: 35 },

  { id: "desk", label: "Desk", group: "Office", type: "furniture", cuFt: 25, lb: 100 },
  { id: "office_chair", label: "Office chair", group: "Office", type: "furniture", cuFt: 12, lb: 35 },
  { id: "file_cabinet", label: "File cabinet, 2 drawer", group: "Office", type: "furniture", cuFt: 6, lb: 60 },

  { id: "washer", label: "Washer", group: "Appliances", type: "appliance", cuFt: 20, lb: 180 },
  { id: "dryer", label: "Dryer", group: "Appliances", type: "appliance", cuFt: 20, lb: 130 },
  { id: "fridge", label: "Refrigerator", group: "Appliances", type: "appliance", cuFt: 45, lb: 250 },
  { id: "freezer", label: "Chest freezer", group: "Appliances", type: "appliance", cuFt: 20, lb: 120 },

  { id: "bike_adult", label: "Bike, adult", group: "Outdoor and other", type: "furniture", cuFt: 10, lb: 30 },
  { id: "bike_kid", label: "Bike, kid", group: "Outdoor and other", type: "furniture", cuFt: 5, lb: 15 },
  { id: "grill", label: "Grill", group: "Outdoor and other", type: "furniture", cuFt: 15, lb: 70 },
  { id: "patio_chair", label: "Patio chair", group: "Outdoor and other", type: "furniture", cuFt: 6, lb: 15 },
  { id: "tool_chest", label: "Tool chest", group: "Outdoor and other", type: "furniture", cuFt: 12, lb: 120 },
];

export const FURNITURE_GROUPS = [...new Set(FURNITURE_PRESETS.map((p) => p.group))];

/**
 * A piece rather than a box: furniture or an appliance. Counted in the
 * furniture line of the summary and offered the estimate mark on box detail.
 */
export function isFurniture(c: Pick<Container, "type">): boolean {
  return c.type === "furniture" || c.type === "appliance";
}

export interface Dimensions {
  width: number;
  depth: number;
  height: number;
}

/** Cubic feet from inches, to a tenth. A box around the piece, which is what it takes up in the container. */
export function cuFtOf(d: Dimensions): number {
  return Math.round(((d.width * d.depth * d.height) / 1728) * 10) / 10;
}

/**
 * The preset's weight scaled by how much bigger or smaller the measured piece
 * is than the preset's typical size. Bounded to half and double, because a
 * size far outside the preset usually means the wrong preset was picked, and
 * scaling a guess that far makes it worse rather than better. Whole pounds.
 * Still a guess: the caller stores it with `weightEstimated`. ADR-0009.
 */
export function scaledWeight(preset: Pick<FurniturePreset, "cuFt" | "lb">, cuFt: number): number {
  const ratio = Math.min(2, Math.max(0.5, cuFt / preset.cuFt));
  return Math.round(preset.lb * ratio);
}
