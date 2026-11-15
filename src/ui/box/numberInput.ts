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
export const VOLUME_HELP = "A size in cu ft is a number over 0 and up to 200, to one decimal.";

export const parseWeight = (text: string) => parseNumber(text, 500, 1);
export const parseVolume = (text: string) => parseNumber(text, 200, 1);

/** How a stored number reads back in its field. */
export function numberText(n: number | undefined): string {
  return n === undefined ? "" : String(n);
}
