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
}

/** Which field matched, so the result card can say where the hit came from. */
function fieldFor(container: Container, q: string, zoneName?: string): MatchField | null {
  if (container.displayCode.includes(q) || String(container.sequenceNumber).startsWith(q)) return "number";
  if (container.title?.toLowerCase().includes(q)) return "title";
  if (container.notes?.toLowerCase().includes(q)) return "notes";
  if (container.contentsSummary?.toLowerCase().includes(q)) return "contentsSummary";
  if (zoneName?.toLowerCase().includes(q)) return "zone";
  if (container.aiSummary?.toLowerCase().includes(q)) return "aiSummary";
  return null;
}

export function search(
  containers: readonly Container[],
  query: string,
  zones: readonly Zone[] = []
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const container of containers) {
    const zoneName = zoneNameFor(container, zones);
    const field = fieldFor(container, q, zoneName);
    if (field) hits.push({ container, field, suggestionOnly: field === "aiSummary" });
  }
  return hits;
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
