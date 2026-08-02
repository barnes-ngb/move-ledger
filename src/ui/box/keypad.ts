/** Four digits is past the top of any range this move will use. */
export const MAX_DIGITS = 4;

export function appendDigit(typed: string, digit: string): string {
  if (!/^[0-9]$/.test(digit)) return typed;
  if (typed.length >= MAX_DIGITS) return typed;
  // A leading zero is how the number is written on the box, not how it is
  // typed. Someone reaching for 042 types 4 then 2.
  if (typed === "" && digit === "0") return typed;
  return typed + digit;
}

export function deleteDigit(typed: string): string {
  return typed.slice(0, -1);
}
