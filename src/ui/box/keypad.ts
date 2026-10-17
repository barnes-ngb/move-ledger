import { MAX_BOX_NUMBER } from "../../domain/numbers";

/**
 * As many digits as the highest box number the app will issue, which is four.
 * A third member numbers from 1000, so four is in use rather than headroom,
 * and nextMemberRange refuses any range past it. See MAX_BOX_NUMBER.
 */
export const MAX_DIGITS = String(MAX_BOX_NUMBER).length;

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
