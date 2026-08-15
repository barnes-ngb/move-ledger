import type { ActivityEvent, Container, ContainerPhoto, Location, Move, MoveMember, Zone } from "./schemas";
import { tokenize } from "./search";

export interface MoveBundle {
  move: Move;
  members: readonly MoveMember[];
  locations: readonly Location[];
  zones: readonly Zone[];
  containers: readonly Container[];
  photos: readonly ContainerPhoto[];
  activity: readonly ActivityEvent[];
}

export const EXPORT_FORMAT_VERSION = 1;

export function toJson(bundle: MoveBundle, exportedAt: string = new Date().toISOString()): string {
  return JSON.stringify({ formatVersion: EXPORT_FORMAT_VERSION, exportedAt, ...bundle }, null, 2);
}

/**
 * What the file is called once it is in a downloads folder among everything
 * else. The move name and the day are the two things that tell one export
 * from another, and a person exporting twice in a week needs to know which is
 * which without opening either.
 *
 * The name is run through the search tokenizer rather than a second
 * punctuation rule of its own: it already folds accents and drops the
 * characters a file name should not carry. A name that tokenizes to nothing
 * falls back to "move" rather than producing a file called ".csv".
 */
export function exportFilename(moveName: string, extension: string, at: Date = new Date()): string {
  const slug = tokenize(moveName).join("-");
  return `${slug || "move"}-${at.toISOString().slice(0, 10)}.${extension}`;
}

const CSV_COLUMNS = [
  "number",
  "room",
  "color",
  "status",
  "priority",
  "title",
  "notes",
  "contents",
  "flags",
  "missing",
  "damaged",
  "photos",
  "created",
] as const;

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * A flat box list for a spreadsheet. Conditions are their own columns because the
 * likely reader is an insurance conversation, not the app.
 */
export function toCsv(bundle: Pick<MoveBundle, "containers" | "zones" | "photos">): string {
  const zoneById = new Map(bundle.zones.map((z) => [z.id, z]));
  const photoCount = new Map<string, number>();
  for (const p of bundle.photos) {
    photoCount.set(p.containerId, (photoCount.get(p.containerId) ?? 0) + 1);
  }

  const rows = [...bundle.containers]
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .map((c) => {
      const zone = c.destinationZoneId ? zoneById.get(c.destinationZoneId) : undefined;
      const flags = Object.entries(c.flags)
        .filter(([, on]) => on)
        .map(([k]) => k)
        .join(" ");
      return [
        c.displayCode,
        zone?.name ?? "",
        zone?.colorName ?? "",
        c.status,
        c.unpackPriority,
        c.title ?? "",
        c.notes ?? "",
        c.contentsSummary ?? "",
        flags,
        c.conditions.missing ? c.conditions.missing.reportedAt : "",
        c.conditions.damaged ? c.conditions.damaged.reportedAt : "",
        String(photoCount.get(c.id) ?? 0),
        c.createdAt,
      ].map(escapeCell);
    });

  return [CSV_COLUMNS.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
}
