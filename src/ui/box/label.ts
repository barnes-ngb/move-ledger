/**
 * The block a person reads while holding a marker. Doc 09 calls this the
 * label instruction. Number first, because that is what gets written first
 * and it exists before a room has been chosen.
 */
export function labelInstruction(displayCode: string, colorName?: string): string {
  return colorName ? `${displayCode}  ${colorName}` : displayCode;
}
