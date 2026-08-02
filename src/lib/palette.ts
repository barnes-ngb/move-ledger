/**
 * Fixed palette. colorName is written on cardboard with a marker, so it must
 * be one uppercase word a person can read at arm's length in a dim garage.
 * colorValue never appears on a physical box. See docs/09-glossary.md.
 */
export interface PaletteEntry {
  name: string;
  value: string;
}

export const PALETTE: readonly PaletteEntry[] = [
  { name: "BLUE", value: "#2563c9" },
  { name: "RED", value: "#dc2626" },
  { name: "GREEN", value: "#16a34a" },
  { name: "ORANGE", value: "#ea580c" },
  { name: "PURPLE", value: "#7c3aed" },
  { name: "YELLOW", value: "#ca8a04" },
  { name: "PINK", value: "#db2777" },
  { name: "BLACK", value: "#334155" },
];

/** Three letters, uppercase, for the compact room chip. */
export function shortCodeFor(roomName: string): string {
  const letters = roomName.replace(/[^A-Za-z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "ROO").padEnd(3, "X");
}
