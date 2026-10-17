import type { Container } from "./schemas";

/**
 * A contents list is a list of items, one noun phrase each. It is still
 * stored a second time as a string, the items joined with ", ", because the
 * export reads the string and a phone running the build before items existed
 * reads nothing else. See doc 07, APPLY-18.
 */
export const ITEM_SEPARATOR = ", ";

/** One item as it should be stored: trimmed, with no trailing period, comma, or semicolon. */
function cleanItem(text: string): string {
  return text.trim().replace(/[.,;]+$/, "").trim();
}

export function joinItems(items: readonly string[]): string {
  return items.join(ITEM_SEPARATOR);
}

/**
 * The items in a string written before items existed. Split on ", " and
 * nothing cleverer, so "kettle and mugs" stays one item and a list the model
 * wrote as a sentence comes apart where its commas were. A trailing period is
 * dropped from each piece because those sentences ended in one.
 */
export function splitSummary(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(ITEM_SEPARATOR)
    .map(cleanItem)
    .filter((item) => item.length > 0);
}

/** An edit field's text, one item per line. Blank lines are dropped. */
export function parseItemLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(cleanItem)
    .filter((item) => item.length > 0);
}

/**
 * `existing` with each of `incoming` added unless an item with the same text,
 * ignoring case, is already there. Order is kept: the first photo's items
 * first, which is the order the box was packed in.
 */
export function mergeItems(existing: readonly string[], incoming: readonly string[]): string[] {
  const seen = new Set(existing.map((item) => item.toLowerCase()));
  const merged = [...existing];
  for (const raw of incoming) {
    const item = cleanItem(raw);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

/**
 * The items a box holds in one of its two lists, read rather than migrated.
 *
 * The stored list is trusted only while it joins to exactly the string stored
 * beside it. A phone on the earlier build edits or clears the string and has
 * never heard of the list, so a list that no longer matches its string is a
 * stale one, and the string is what a person last saw and changed. A box with
 * a string and no list, which is every box from before items, is split here
 * and left as it is in the database.
 */
export function itemsOf(items: readonly string[] | undefined, summary: string | undefined): string[] {
  if (items && joinItems(items) === (summary ?? "")) return [...items];
  return splitSummary(summary);
}

/** The suggested items. */
export function aiItemsOf(container: Pick<Container, "aiItems" | "aiSummary">): string[] {
  return itemsOf(container.aiItems, container.aiSummary);
}

/** The confirmed items. */
export function contentsItemsOf(container: Pick<Container, "contentsItems" | "contentsSummary">): string[] {
  return itemsOf(container.contentsItems, container.contentsSummary);
}
