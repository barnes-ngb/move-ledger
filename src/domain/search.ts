import type { Container, Zone } from "./schemas";
import { toDisplayCode } from "./numbers";

/**
 * Firestore has no full text search. At a few hundred boxes, filtering the local
 * cache costs nothing and works offline, so `searchText` is maintained on write.
 */
export function buildSearchText(
  container: Pick<Container, "displayCode" | "title" | "notes" | "contentsSummary" | "aiSummary">,
  destinationZoneName?: string
): string {
  return [
    container.displayCode,
    container.title,
    container.notes,
    container.contentsSummary,
    container.aiSummary,
    destinationZoneName,
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .toLowerCase();
}

export function zoneNameFor(container: Container, zones: readonly Zone[]): string | undefined {
  return zones.find((z) => z.id === container.destinationZoneId)?.name;
}

export type MatchField = "number" | "title" | "notes" | "contentsSummary" | "aiSummary" | "zone";

export interface SearchHit {
  container: Container;
  field: MatchField;
  /** True when the only thing that matched was an unconfirmed AI summary. */
  suggestionOnly: boolean;
  /** How many words of the query this box answered. Ranks the results. */
  matchedCount: number;
}

/**
 * Splits text into comparable words. Punctuation is dropped, because the
 * generated contents lists carry quotes, plus signs, and commas that nobody
 * types into a search box.
 *
 * Accents are folded rather than kept, so "cafe" finds "café" and the reverse.
 * Nobody reaches for the accented key on a phone keyboard while standing in a
 * garage, and the model writes the word properly, so without this the two
 * spellings never meet.
 *
 * Deviates from the APPLY-08 plan, which split on `[^a-z0-9]+`. Raised in
 * review on pull request 17 and decided there. That class deleted every
 * character of any non-Latin script, so text in one tokenized to an empty list
 * and the box holding it could not be found at all, which the substring search
 * this replaced had handled. Splitting on the Unicode classes alone was the
 * suggestion and it is not enough: it leaves "jalapeño" one intact token, and
 * "jalapeno" shares only three letters with it before the tilde, so a search
 * that works today would have stopped working. Folding first fixes both.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

/** Below this length a token must match exactly, so "car" misses "cardboard". */
const MIN_PREFIX = 4;

/**
 * Loose enough to handle plurals both ways without a stemmer, as long as the
 * shorter of the two words reaches MIN_PREFIX. "magazine" finds "magazines"
 * and "magazines" finds "magazine". "toys" does not find "toy", because three
 * letters is short enough that a prefix rule starts returning strangers.
 */
export function tokenMatches(query: string, text: string): boolean {
  if (query === text) return true;
  if (query.length >= MIN_PREFIX && text.startsWith(query)) return true;
  if (text.length >= MIN_PREFIX && query.startsWith(text)) return true;
  return false;
}

/** Highest priority first. The reported field is the first one that matched. */
const FIELD_ORDER: readonly MatchField[] = [
  "number",
  "title",
  "notes",
  "contentsSummary",
  "zone",
  "aiSummary",
] as const;

function matchesAnyToken(query: string, text: string | undefined): boolean {
  if (!text) return false;
  return tokenize(text).some((word) => tokenMatches(query, word));
}

/**
 * The box number keeps the old substring rule rather than the token rule.
 * Typing 4 has to narrow to every box whose number starts with 4 while the
 * digits are still being entered, which is a prefix question, not a word one.
 */
function matchesNumber(container: Container, query: string): boolean {
  if (!/^\d+$/.test(query)) return false;
  return container.displayCode.includes(query) || String(container.sequenceNumber).startsWith(query);
}

/** Every field one query word reached, so the caller can rank and label the hit. */
function fieldsFor(container: Container, query: string, zoneName?: string): MatchField[] {
  const fields: MatchField[] = [];
  if (matchesNumber(container, query)) fields.push("number");
  if (matchesAnyToken(query, container.title)) fields.push("title");
  if (matchesAnyToken(query, container.notes)) fields.push("notes");
  if (matchesAnyToken(query, container.contentsSummary)) fields.push("contentsSummary");
  if (matchesAnyToken(query, zoneName)) fields.push("zone");
  if (matchesAnyToken(query, container.aiSummary)) fields.push("aiSummary");
  return fields;
}

/**
 * Word matching rather than one substring test per field. The generated
 * contents lists are prose full of quotes, plus signs, and commas, so a person
 * searching "travel leisure" is typing two words that sit either side of a
 * plus sign in the text. A substring test cannot reach that; comparing word to
 * word can.
 *
 * A box matches on any one query word, because a search that requires all of
 * them returns nothing on a typo and this is a tool for finding a box in a
 * garage. Matching more words instead moves a box up the list.
 */
export function search(
  containers: readonly Container[],
  query: string,
  zones: readonly Zone[] = []
): SearchHit[] {
  const words = tokenize(query);
  if (words.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const container of containers) {
    const zoneName = zoneNameFor(container, zones);
    const matched = new Set<MatchField>();
    let matchedCount = 0;

    for (const word of words) {
      const fields = fieldsFor(container, word, zoneName);
      if (fields.length === 0) continue;
      matchedCount += 1;
      for (const f of fields) matched.add(f);
    }

    if (matchedCount === 0) continue;
    const field = FIELD_ORDER.find((f) => matched.has(f))!;
    hits.push({
      container,
      field,
      suggestionOnly: matched.size === 1 && matched.has("aiSummary"),
      matchedCount,
    });
  }

  return hits.sort(
    (a, b) =>
      b.matchedCount - a.matchedCount || a.container.sequenceNumber - b.container.sequenceNumber
  );
}

/**
 * Numeric lookup. Typing 42 finds 042. The Find screen opens the box outright
 * when exactly one container matches the digits entered so far.
 */
export function findByNumber(containers: readonly Container[], typed: string): Container[] {
  const digits = typed.replace(/\D/g, "");
  if (!digits) return [];
  return containers.filter((c) => String(c.sequenceNumber).startsWith(digits));
}

export function exactByNumber(containers: readonly Container[], typed: string): Container | null {
  const digits = typed.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return containers.find((c) => c.sequenceNumber === n) ?? null;
}

export { toDisplayCode };
