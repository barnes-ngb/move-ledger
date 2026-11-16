import { MAX_VOLUME_CU_FT, cuFtOf, type Dimensions } from "../../domain";

/**
 * What a typed number means. Empty is a real answer: it clears the field.
 * Anything that is not a plain number, or that the schema would refuse, is
 * reported as invalid here so the screen can say why in a sentence rather than
 * showing a validation dump from the write.
 */
export type ParsedNumber = { kind: "empty" } | { kind: "value"; value: number } | { kind: "invalid" };

export function parseNumber(text: string, max: number, decimals: number): ParsedNumber {
  const t = text.trim();
  if (t === "") return { kind: "empty" };
  const pattern = decimals === 0 ? /^\d+$/ : new RegExp(`^(\\d+(\\.\\d{0,${decimals}})?|\\.\\d{1,${decimals}})$`);
  if (!pattern.test(t)) return { kind: "invalid" };
  const value = Number(t);
  if (!(value > 0) || value > max) return { kind: "invalid" };
  return { kind: "value", value };
}

export const WEIGHT_HELP = "A weight is a number over 0 and up to 500, to one decimal, such as 31.5.";
export const VOLUME_HELP = `A size in cu ft is a number over 0 and up to ${MAX_VOLUME_CU_FT}, to one decimal.`;

export const parseWeight = (text: string) => parseNumber(text, 500, 1);
export const parseVolume = (text: string) => parseNumber(text, MAX_VOLUME_CU_FT, 1);

/** How a stored number reads back in its field. */
export function numberText(n: number | undefined): string {
  return n === undefined ? "" : String(n);
}

export const DIMENSIONS_HELP = `Fill all three measurements in inches, up to 240 each and ${MAX_VOLUME_CU_FT} cu ft together, or leave all three empty.`;

/** Three inch fields: all empty is no answer, all valid is an answer, anything else is invalid. */
export function parseDimensions(text: { width: string; depth: string; height: string }):
  | { kind: "empty" }
  | { kind: "value"; value: Dimensions }
  | { kind: "invalid" } {
  const parts = [text.width, text.depth, text.height].map((t) => parseNumber(t, 240, 1));
  if (parts.every((p) => p.kind === "empty")) return { kind: "empty" };
  if (parts.some((p) => p.kind !== "value")) return { kind: "invalid" };
  const [width, depth, height] = parts.map((p) => (p as { kind: "value"; value: number }).value) as [number, number, number];
  // Each side can be valid while the three together are more than one record
  // holds, and saving would throw. Refused here, in a sentence, instead.
  if (cuFtOf({ width, depth, height }) > MAX_VOLUME_CU_FT) return { kind: "invalid" };
  return { kind: "value", value: { width, depth, height } };
}
