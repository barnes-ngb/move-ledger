# APPLY-01: Scaffold and domain core

For Claude Code. Read the whole file before running anything.

## What this does

Creates the Move Ledger project and the entire pure domain layer with its tests. Zod schemas, number reservation, status transitions, conditions, search, export.

## What this does not do

No Firebase. No React components beyond the Vite template. No PWA plugin. No repositories. Those are APPLY-02, which needs a Firebase project to exist first and so cannot be scripted ahead of a human step.

Nothing in this file requires Docker, administrator rights, or network access beyond npm.

## Verified against

Built and run before delivery on Node 22.22, npm 10.9, zod 4.4.3, vitest 4.1.10, typescript 7.0.2. Result: `tsc --noEmit` clean, 47 tests passing across 6 files. If your resolved versions differ by a major, expect drift and report it rather than patching around it silently.

## Governing docs

- `docs/02-domain-model.md` is the source of truth for every type here. If a schema and that doc disagree, the schema is wrong.
- `decisions/0003-status-versus-condition.md` is why `missing` and `damaged` are not statuses.
- `docs/09-glossary.md` governs naming. Code says Container and Zone. Never Box or Room.
- `AGENTS.md` governs everything else.

## Preconditions. Stop if any fails.

1. The working directory is the repository root and contains `AGENTS.md`, `docs/`, and `decisions/`. If it does not, stop and say so. Do not create those from memory.
2. `src/` does not already exist. If it does, stop and report what is in it.
3. `node --version` reports 20 or higher.
4. `git status` is clean.

If any precondition fails, stop and report. Do not proceed partially.

## Step 1: branch

```powershell
git checkout -b feat/domain-core
```

## Step 2: scaffold

```powershell
npm create vite@latest . -- --template react-ts
npm install
npm install zod
npm install -D vitest
```

Answer yes when the Vite scaffolder asks about the non-empty directory. It preserves `docs/`, `decisions/`, `AGENTS.md`, `CLAUDE.md`, and `README.md`.

Then remove the split TypeScript configs the template ships, because Step 3 replaces them with one flat config:

```powershell
Remove-Item -ErrorAction SilentlyContinue tsconfig.app.json, tsconfig.node.json
```

## Step 3: package.json scripts

Add these three entries to the `scripts` object. Leave the existing entries alone.

```json
"test": "vitest run",
"test:watch": "vitest",
"typecheck": "tsc --noEmit",
"verify": "npm run typecheck && npm run test"
```

## Step 4: write these files

Create each file exactly as given. Do not reformat, rename, or improve them. If a file already exists, stop and report rather than overwriting.

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src"]
}
```

### `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
```

### `src/domain/schemas/index.ts`

```ts
import { z } from "zod";

/** ISO 8601 UTC timestamp. Kept as a plain string so the schema is portable. */
export const isoString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/, "expected an ISO 8601 timestamp");

export const containerStatusSchema = z.enum([
  "filling",
  "packed",
  "staged",
  "loaded",
  "unloaded",
  "opened",
  "emptied",
]);

export const unpackPrioritySchema = z.enum([
  "immediate",
  "first_night",
  "first_week",
  "normal",
  "storage",
]);

export const moveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["planning", "packing", "moving", "settling", "complete"]),
  originLocationId: z.string().optional(),
  destinationLocationId: z.string().optional(),
  memberUids: z.array(z.string().min(1)).min(1),
  createdAt: isoString,
  updatedAt: isoString,
});

export const moveMemberSchema = z.object({
  id: z.string().min(1),
  moveId: z.string().min(1),
  uid: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(["owner", "member"]),
  numberRangeStart: z.number().int().positive(),
  numberRangeEnd: z.number().int().positive(),
}).refine((m) => m.numberRangeEnd >= m.numberRangeStart, {
  message: "numberRangeEnd must not be below numberRangeStart",
  path: ["numberRangeEnd"],
});

export const locationSchema = z.object({
  id: z.string().min(1),
  moveId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["home", "storage", "truck", "vehicle", "staging", "other"]),
});

export const zoneSchema = z.object({
  id: z.string().min(1),
  moveId: z.string().min(1),
  locationId: z.string().min(1),
  name: z.string().min(1),
  shortCode: z.string().min(1).max(4),
  colorName: z.string().regex(/^[A-Z]+$/, "colorName is written by hand, so it must be one uppercase word"),
  colorValue: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.number().int().nonnegative(),
});

export const containerFlagsSchema = z.object({
  fragile: z.boolean(),
  heavy: z.boolean(),
  keepUpright: z.boolean(),
  doNotStack: z.boolean(),
  containsLiquids: z.boolean(),
  temperatureSensitive: z.boolean(),
  highValue: z.boolean(),
  importantDocuments: z.boolean(),
});

export const conditionReportSchema = z.object({
  reportedAt: isoString,
  reportedBy: z.string().min(1),
  note: z.string().optional(),
  photoIds: z.array(z.string()),
});

export const containerSchema = z.object({
  id: z.string().min(1),
  moveId: z.string().min(1),
  sequenceNumber: z.number().int().positive(),
  displayCode: z.string().regex(/^\d{3,}$/),
  type: z.enum(["box", "plastic_bin", "furniture", "appliance", "bundle", "other"]),
  title: z.string().optional(),
  notes: z.string().optional(),
  contentsSummary: z.string().optional(),
  aiSummary: z.string().optional(),
  ownerMemberId: z.string().min(1),
  originZoneId: z.string().optional(),
  currentLocationId: z.string().optional(),
  currentZoneId: z.string().optional(),
  destinationZoneId: z.string().optional(),
  status: containerStatusSchema,
  unpackPriority: unpackPrioritySchema,
  flags: containerFlagsSchema,
  conditions: z.object({
    missing: conditionReportSchema.optional(),
    damaged: conditionReportSchema.optional(),
  }),
  labelConfirmedAt: isoString.optional(),
  createdAt: isoString,
  createdBy: z.string().min(1),
  updatedAt: isoString,
  updatedBy: z.string().min(1),
  searchText: z.string(),
});

export const containerPhotoSchema = z.object({
  id: z.string().min(1),
  moveId: z.string().min(1),
  containerId: z.string().min(1),
  type: z.enum(["contents", "closed_box", "label", "damage", "other"]),
  storagePath: z.string().optional(),
  downloadUrl: z.string().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  uploadState: z.enum(["pending", "uploading", "uploaded", "failed"]),
  lastError: z.string().optional(),
  attempts: z.number().int().nonnegative(),
  createdAt: isoString,
  createdBy: z.string().min(1),
});

export const activityEventSchema = z.object({
  id: z.string().min(1),
  moveId: z.string().min(1),
  containerId: z.string().optional(),
  actorId: z.string().min(1),
  type: z.enum([
    "container_created",
    "photo_added",
    "label_confirmed",
    "status_changed",
    "destination_changed",
    "notes_changed",
    "condition_reported",
    "condition_cleared",
  ]),
  occurredAt: isoString,
  payload: z.record(z.string(), z.unknown()),
});

export type ContainerStatus = z.infer<typeof containerStatusSchema>;
export type UnpackPriority = z.infer<typeof unpackPrioritySchema>;
export type Move = z.infer<typeof moveSchema>;
export type MoveMember = z.infer<typeof moveMemberSchema>;
export type Location = z.infer<typeof locationSchema>;
export type Zone = z.infer<typeof zoneSchema>;
export type ContainerFlags = z.infer<typeof containerFlagsSchema>;
export type ConditionReport = z.infer<typeof conditionReportSchema>;
export type Container = z.infer<typeof containerSchema>;
export type ContainerPhoto = z.infer<typeof containerPhotoSchema>;
export type ActivityEvent = z.infer<typeof activityEventSchema>;
```

### `src/domain/numbers.ts`

```ts
import type { MoveMember } from "./schemas";

export class RangeExhaustedError extends Error {
  constructor(public readonly member: Pick<MoveMember, "displayName" | "numberRangeStart" | "numberRangeEnd">) {
    super(
      `${member.displayName} has used every number from ${member.numberRangeStart} to ${member.numberRangeEnd}.`
    );
    this.name = "RangeExhaustedError";
  }
}

export interface NumberRange {
  numberRangeStart: number;
  numberRangeEnd: number;
}

/** True when n falls inside the member's assigned span, inclusive at both ends. */
export function isWithinRange(n: number, range: NumberRange): boolean {
  return n >= range.numberRangeStart && n <= range.numberRangeEnd;
}

/**
 * The next number this member should use.
 *
 * Takes the highest number already used inside the member's own range and adds one.
 * Gaps left by deleted boxes are never refilled, because a reused number would
 * collide with a marker already written on cardboard.
 *
 * `usedNumbers` may contain numbers belonging to other members. They are ignored.
 */
export function nextSequenceNumber(range: NumberRange, usedNumbers: readonly number[]): number {
  const mine = usedNumbers.filter((n) => isWithinRange(n, range));
  const next = mine.length === 0 ? range.numberRangeStart : Math.max(...mine) + 1;
  if (next > range.numberRangeEnd) {
    throw new RangeExhaustedError({ displayName: "This device", ...range });
  }
  return next;
}

/** How many numbers the member has left. Drives the low-range warning. */
export function remainingInRange(range: NumberRange, usedNumbers: readonly number[]): number {
  const mine = usedNumbers.filter((n) => isWithinRange(n, range));
  const highest = mine.length === 0 ? range.numberRangeStart - 1 : Math.max(...mine);
  return range.numberRangeEnd - highest;
}

/** The number as it is written on the box. Zero padded to three, wider if it has to be. */
export function toDisplayCode(sequenceNumber: number): string {
  return String(sequenceNumber).padStart(3, "0");
}

/** Two members must not overlap, or two boxes can end up wearing the same number. */
export function rangesOverlap(a: NumberRange, b: NumberRange): boolean {
  return a.numberRangeStart <= b.numberRangeEnd && b.numberRangeStart <= a.numberRangeEnd;
}
```

### `src/domain/status.ts`

```ts
import type { ActivityEvent, Container, ContainerStatus } from "./schemas";

/** Pipeline order. Index position is what makes a transition forward or backward. */
export const STATUS_ORDER: readonly ContainerStatus[] = [
  "filling",
  "packed",
  "staged",
  "loaded",
  "unloaded",
  "opened",
  "emptied",
] as const;

/**
 * Legal forward moves. `packed` may skip `staged` because a box often goes
 * straight from the floor onto the truck.
 */
const FORWARD: Record<ContainerStatus, readonly ContainerStatus[]> = {
  filling: ["packed"],
  packed: ["staged", "loaded"],
  staged: ["loaded"],
  loaded: ["unloaded"],
  unloaded: ["opened"],
  opened: ["emptied"],
  emptied: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: ContainerStatus, to: ContainerStatus) {
    super(`A box cannot go from ${from} to ${to}.`);
    this.name = "IllegalTransitionError";
  }
}

export function statusIndex(status: ContainerStatus): number {
  return STATUS_ORDER.indexOf(status);
}

/** Any backward move is allowed, because corrections happen. Forward moves are constrained. */
export function canTransition(from: ContainerStatus, to: ContainerStatus): boolean {
  if (from === to) return false;
  if (statusIndex(to) < statusIndex(from)) return true;
  return FORWARD[from].includes(to);
}

/** The transitions to offer as primary buttons on the box detail screen. */
export function nextStatuses(from: ContainerStatus): readonly ContainerStatus[] {
  return FORWARD[from];
}

export interface TransitionResult {
  container: Container;
  event: Omit<ActivityEvent, "id">;
}

/**
 * The only place a container status changes. Returns the updated container and
 * the activity event that records the change. Neither is persisted here.
 */
export function transition(
  container: Container,
  to: ContainerStatus,
  actorId: string,
  now: string = new Date().toISOString()
): TransitionResult {
  if (!canTransition(container.status, to)) {
    throw new IllegalTransitionError(container.status, to);
  }
  const from = container.status;
  return {
    container: { ...container, status: to, updatedAt: now, updatedBy: actorId },
    event: {
      moveId: container.moveId,
      containerId: container.id,
      actorId,
      type: "status_changed",
      occurredAt: now,
      payload: { from, to, backward: statusIndex(to) < statusIndex(from) },
    },
  };
}
```

### `src/domain/conditions.ts`

```ts
import type { ActivityEvent, ConditionReport, Container } from "./schemas";

export type ConditionKey = "missing" | "damaged";

export interface ConditionResult {
  container: Container;
  event: Omit<ActivityEvent, "id">;
}

/**
 * Conditions sit alongside status rather than replacing it. A crushed box that is
 * still on the truck stays `loaded` and gains a damaged report. See ADR-0003.
 */
export function reportCondition(
  container: Container,
  key: ConditionKey,
  report: Omit<ConditionReport, "reportedAt" | "reportedBy">,
  actorId: string,
  now: string = new Date().toISOString()
): ConditionResult {
  const full: ConditionReport = { ...report, reportedAt: now, reportedBy: actorId };
  return {
    container: {
      ...container,
      conditions: { ...container.conditions, [key]: full },
      updatedAt: now,
      updatedBy: actorId,
    },
    event: {
      moveId: container.moveId,
      containerId: container.id,
      actorId,
      type: "condition_reported",
      occurredAt: now,
      payload: { condition: key, note: report.note ?? null, photoCount: report.photoIds.length },
    },
  };
}

/** A box reported missing and then found. The status it had is untouched throughout. */
export function clearCondition(
  container: Container,
  key: ConditionKey,
  actorId: string,
  now: string = new Date().toISOString()
): ConditionResult {
  const conditions = { ...container.conditions };
  delete conditions[key];
  return {
    container: { ...container, conditions, updatedAt: now, updatedBy: actorId },
    event: {
      moveId: container.moveId,
      containerId: container.id,
      actorId,
      type: "condition_cleared",
      occurredAt: now,
      payload: { condition: key },
    },
  };
}

export function hasCondition(container: Container, key: ConditionKey): boolean {
  return container.conditions[key] !== undefined;
}
```

### `src/domain/search.ts`

```ts
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
```

### `src/domain/export.ts`

```ts
import type { ActivityEvent, Container, ContainerPhoto, Location, Move, MoveMember, Zone } from "./schemas";

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
```

### `src/domain/index.ts`

```ts
export * from "./schemas";
export * from "./numbers";
export * from "./status";
export * from "./conditions";
export * from "./search";
export * from "./export";
```

### `src/domain/__tests__/factories.ts`

```ts
import type { Container, Zone } from "../schemas";

const NOW = "2026-07-25T18:00:00.000Z";

export function makeContainer(over: Partial<Container> = {}): Container {
  return {
    id: over.id ?? "c1",
    moveId: "m1",
    sequenceNumber: 42,
    displayCode: "042",
    type: "box",
    ownerMemberId: "mem1",
    status: "packed",
    unpackPriority: "normal",
    flags: {
      fragile: false,
      heavy: false,
      keepUpright: false,
      doNotStack: false,
      containsLiquids: false,
      temperatureSensitive: false,
      highValue: false,
      importantDocuments: false,
    },
    conditions: {},
    createdAt: NOW,
    createdBy: "mem1",
    updatedAt: NOW,
    updatedBy: "mem1",
    searchText: "",
    ...over,
  };
}

export function makeZone(over: Partial<Zone> = {}): Zone {
  return {
    id: "z1",
    moveId: "m1",
    locationId: "l1",
    name: "Kitchen",
    shortCode: "KIT",
    colorName: "BLUE",
    colorValue: "#2563c9",
    sortOrder: 0,
    ...over,
  };
}
```

### `src/domain/__tests__/schemas.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { containerSchema, moveMemberSchema, zoneSchema } from "../schemas";
import { makeContainer } from "./factories";

describe("containerSchema", () => {
  it("accepts a valid container", () => {
    expect(containerSchema.safeParse(makeContainer()).success).toBe(true);
  });

  it("rejects a sequence number of zero", () => {
    expect(containerSchema.safeParse(makeContainer({ sequenceNumber: 0 })).success).toBe(false);
  });

  it("rejects a status that is really a condition", () => {
    expect(containerSchema.safeParse(makeContainer({ status: "damaged" as never })).success).toBe(false);
  });

  it("rejects a timestamp that is not ISO 8601", () => {
    expect(containerSchema.safeParse(makeContainer({ createdAt: "26 July 2026" })).success).toBe(false);
  });
});

describe("zoneSchema", () => {
  it("requires a colorName that can be written by hand", () => {
    const base = { id: "z1", moveId: "m1", locationId: "l1", name: "Kitchen", shortCode: "KIT", colorValue: "#2563c9", sortOrder: 0 };
    expect(zoneSchema.safeParse({ ...base, colorName: "BLUE" }).success).toBe(true);
    expect(zoneSchema.safeParse({ ...base, colorName: "Light Blue" }).success).toBe(false);
  });
});

describe("moveMemberSchema", () => {
  it("rejects a range that ends before it starts", () => {
    const base = { id: "mem1", moveId: "m1", uid: "u1", displayName: "Nathan", role: "owner" as const };
    expect(moveMemberSchema.safeParse({ ...base, numberRangeStart: 1, numberRangeEnd: 499 }).success).toBe(true);
    expect(moveMemberSchema.safeParse({ ...base, numberRangeStart: 500, numberRangeEnd: 1 }).success).toBe(false);
  });
});
```

### `src/domain/__tests__/numbers.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  RangeExhaustedError,
  isWithinRange,
  nextSequenceNumber,
  rangesOverlap,
  remainingInRange,
  toDisplayCode,
} from "../numbers";

const nathan = { numberRangeStart: 1, numberRangeEnd: 499 };
const shelly = { numberRangeStart: 500, numberRangeEnd: 999 };

describe("nextSequenceNumber", () => {
  it("starts at the bottom of the range when nothing is used", () => {
    expect(nextSequenceNumber(nathan, [])).toBe(1);
    expect(nextSequenceNumber(shelly, [])).toBe(500);
  });

  it("continues from the highest used number", () => {
    expect(nextSequenceNumber(nathan, [1, 2, 3])).toBe(4);
  });

  it("ignores numbers belonging to the other member", () => {
    expect(nextSequenceNumber(nathan, [1, 2, 500, 501, 502])).toBe(3);
  });

  it("never refills a gap left by a deleted box", () => {
    expect(nextSequenceNumber(nathan, [1, 2, 3, 7])).toBe(8);
  });

  it("throws once the range is spent", () => {
    const tiny = { numberRangeStart: 1, numberRangeEnd: 2 };
    expect(() => nextSequenceNumber(tiny, [1, 2])).toThrow(RangeExhaustedError);
  });
});

describe("remainingInRange", () => {
  it("reports the full range before anything is used", () => {
    expect(remainingInRange(nathan, [])).toBe(499);
  });

  it("shrinks as numbers are consumed", () => {
    expect(remainingInRange(nathan, [1, 2, 3])).toBe(496);
  });
});

describe("isWithinRange", () => {
  it("includes both ends", () => {
    expect(isWithinRange(1, nathan)).toBe(true);
    expect(isWithinRange(499, nathan)).toBe(true);
    expect(isWithinRange(500, nathan)).toBe(false);
  });
});

describe("toDisplayCode", () => {
  it("pads to three digits", () => {
    expect(toDisplayCode(1)).toBe("001");
    expect(toDisplayCode(42)).toBe("042");
    expect(toDisplayCode(999)).toBe("999");
  });

  it("widens rather than truncating past a thousand", () => {
    expect(toDisplayCode(1042)).toBe("1042");
  });
});

describe("rangesOverlap", () => {
  it("catches an overlap that would let two boxes share a number", () => {
    expect(rangesOverlap(nathan, shelly)).toBe(false);
    expect(rangesOverlap(nathan, { numberRangeStart: 400, numberRangeEnd: 700 })).toBe(true);
  });
});
```

### `src/domain/__tests__/status.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { IllegalTransitionError, canTransition, nextStatuses, transition } from "../status";
import { makeContainer } from "./factories";

describe("canTransition", () => {
  it("allows the normal pipeline", () => {
    expect(canTransition("filling", "packed")).toBe(true);
    expect(canTransition("packed", "staged")).toBe(true);
    expect(canTransition("staged", "loaded")).toBe(true);
    expect(canTransition("loaded", "unloaded")).toBe(true);
    expect(canTransition("unloaded", "opened")).toBe(true);
    expect(canTransition("opened", "emptied")).toBe(true);
  });

  it("lets a packed box skip staging and go onto the truck", () => {
    expect(canTransition("packed", "loaded")).toBe(true);
  });

  it("refuses a forward jump that skips the truck", () => {
    expect(canTransition("packed", "unloaded")).toBe(false);
    expect(canTransition("filling", "opened")).toBe(false);
  });

  it("allows any backward move, because corrections happen", () => {
    expect(canTransition("loaded", "packed")).toBe(true);
    expect(canTransition("emptied", "filling")).toBe(true);
  });

  it("treats a no-op as not a transition", () => {
    expect(canTransition("packed", "packed")).toBe(false);
  });
});

describe("nextStatuses", () => {
  it("gives the buttons the detail screen should show", () => {
    expect(nextStatuses("packed")).toEqual(["staged", "loaded"]);
    expect(nextStatuses("emptied")).toEqual([]);
  });
});

describe("transition", () => {
  const now = "2026-07-26T12:00:00.000Z";

  it("returns the updated container and an activity event", () => {
    const { container, event } = transition(makeContainer(), "loaded", "mem2", now);
    expect(container.status).toBe("loaded");
    expect(container.updatedBy).toBe("mem2");
    expect(container.updatedAt).toBe(now);
    expect(event.type).toBe("status_changed");
    expect(event.payload).toEqual({ from: "packed", to: "loaded", backward: false });
  });

  it("marks a backward move so the history reads honestly", () => {
    const loaded = makeContainer({ status: "loaded" });
    const { event } = transition(loaded, "packed", "mem1", now);
    expect(event.payload).toMatchObject({ backward: true });
  });

  it("does not mutate the container it was given", () => {
    const original = makeContainer();
    transition(original, "loaded", "mem1", now);
    expect(original.status).toBe("packed");
  });

  it("throws on an illegal forward jump", () => {
    expect(() => transition(makeContainer(), "opened", "mem1", now)).toThrow(IllegalTransitionError);
  });
});
```

### `src/domain/__tests__/conditions.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { clearCondition, hasCondition, reportCondition } from "../conditions";
import { transition } from "../status";
import { makeContainer } from "./factories";

const now = "2026-07-26T12:00:00.000Z";

describe("conditions", () => {
  it("records damage without touching status", () => {
    const loaded = makeContainer({ status: "loaded" });
    const { container, event } = reportCondition(
      loaded,
      "damaged",
      { note: "corner crushed", photoIds: ["p1", "p2"] },
      "mem1",
      now
    );
    expect(container.status).toBe("loaded");
    expect(container.conditions.damaged?.reportedBy).toBe("mem1");
    expect(container.conditions.damaged?.photoIds).toHaveLength(2);
    expect(event.type).toBe("condition_reported");
  });

  it("lets a damaged box keep moving through the pipeline", () => {
    const loaded = makeContainer({ status: "loaded" });
    const damaged = reportCondition(loaded, "damaged", { photoIds: [] }, "mem1", now).container;
    const unloaded = transition(damaged, "unloaded", "mem1", now).container;
    expect(unloaded.status).toBe("unloaded");
    expect(hasCondition(unloaded, "damaged")).toBe(true);
  });

  it("holds missing and damaged at the same time", () => {
    const a = reportCondition(makeContainer(), "missing", { photoIds: [] }, "mem1", now).container;
    const b = reportCondition(a, "damaged", { photoIds: [] }, "mem1", now).container;
    expect(hasCondition(b, "missing")).toBe(true);
    expect(hasCondition(b, "damaged")).toBe(true);
  });

  it("clears a condition when the box turns up", () => {
    const missing = reportCondition(makeContainer(), "missing", { photoIds: [] }, "mem1", now).container;
    const found = clearCondition(missing, "missing", "mem1", now).container;
    expect(hasCondition(found, "missing")).toBe(false);
    expect(found.status).toBe("packed");
  });

  it("does not mutate the container it was given", () => {
    const original = makeContainer();
    reportCondition(original, "damaged", { photoIds: [] }, "mem1", now);
    expect(original.conditions.damaged).toBeUndefined();
  });
});
```

### `src/domain/__tests__/search.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buildSearchText, exactByNumber, findByNumber, search } from "../search";
import { makeContainer, makeZone } from "./factories";

const zones = [makeZone(), makeZone({ id: "z2", name: "Garage", colorName: "RED" })];

describe("buildSearchText", () => {
  it("folds every searchable field to lowercase", () => {
    const text = buildSearchText(
      {
        displayCode: "042",
        title: "Coffee Gear",
        notes: "Kettle and MUGS",
        contentsSummary: undefined,
        aiSummary: "measuring cups",
      },
      "Kitchen"
    );
    expect(text).toBe("042 coffee gear kettle and mugs measuring cups kitchen");
  });

  it("drops fields that are absent rather than leaving gaps", () => {
    const text = buildSearchText({ displayCode: "007", title: undefined, notes: undefined, contentsSummary: undefined, aiSummary: undefined });
    expect(text).toBe("007");
  });
});

describe("search", () => {
  const containers = [
    makeContainer({ id: "c1", sequenceNumber: 42, displayCode: "042", notes: "kettle and mugs", destinationZoneId: "z1" }),
    makeContainer({ id: "c2", sequenceNumber: 43, displayCode: "043", aiSummary: "power drill, sockets", destinationZoneId: "z2" }),
    makeContainer({ id: "c3", sequenceNumber: 44, displayCode: "044", title: "Medicine", destinationZoneId: "z1" }),
  ];

  it("finds a box by a word in its note", () => {
    const hits = search(containers, "kettle", zones);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.container.id).toBe("c1");
    expect(hits[0]!.field).toBe("notes");
    expect(hits[0]!.suggestionOnly).toBe(false);
  });

  it("marks a match that came only from an unconfirmed summary", () => {
    const hits = search(containers, "drill", zones);
    expect(hits[0]!.suggestionOnly).toBe(true);
    expect(hits[0]!.field).toBe("aiSummary");
  });

  it("prefers confirmed text over a suggestion when both could match", () => {
    const both = makeContainer({ id: "c9", notes: "lamp", aiSummary: "lamp" });
    expect(search([both], "lamp").at(0)?.field).toBe("notes");
  });

  it("searches the destination room name", () => {
    const hits = search(containers, "garage", zones);
    expect(hits.map((h) => h.container.id)).toEqual(["c2"]);
  });

  it("returns nothing for an empty query rather than everything", () => {
    expect(search(containers, "   ", zones)).toEqual([]);
  });
});

describe("findByNumber", () => {
  const containers = [
    makeContainer({ id: "c1", sequenceNumber: 4, displayCode: "004" }),
    makeContainer({ id: "c2", sequenceNumber: 42, displayCode: "042" }),
    makeContainer({ id: "c3", sequenceNumber: 43, displayCode: "043" }),
  ];

  it("narrows as digits are typed", () => {
    expect(findByNumber(containers, "4")).toHaveLength(3);
    expect(findByNumber(containers, "42")).toHaveLength(1);
  });

  it("resolves 42 to box 042", () => {
    expect(exactByNumber(containers, "42")?.displayCode).toBe("042");
  });

  it("ignores anything that is not a digit", () => {
    expect(exactByNumber(containers, "#42")?.displayCode).toBe("042");
    expect(findByNumber(containers, "abc")).toEqual([]);
  });
});
```

### `src/domain/__tests__/export.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { EXPORT_FORMAT_VERSION, toCsv, toJson } from "../export";
import { makeContainer, makeZone } from "./factories";

const zones = [makeZone()];

describe("toJson", () => {
  it("stamps a format version so a future reader knows the shape", () => {
    const json = JSON.parse(
      toJson(
        {
          move: {
            id: "m1",
            name: "KC to DFW",
            status: "packing",
            memberUids: ["u1"],
            createdAt: "2026-07-25T18:00:00.000Z",
            updatedAt: "2026-07-25T18:00:00.000Z",
          },
          members: [],
          locations: [],
          zones,
          containers: [makeContainer()],
          photos: [],
          activity: [],
        },
        "2026-07-26T12:00:00.000Z"
      )
    );
    expect(json.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(json.exportedAt).toBe("2026-07-26T12:00:00.000Z");
    expect(json.containers).toHaveLength(1);
  });
});

describe("toCsv", () => {
  it("writes a header and one row per box, sorted by number", () => {
    const csv = toCsv({
      containers: [
        makeContainer({ id: "c2", sequenceNumber: 43, displayCode: "043" }),
        makeContainer({ id: "c1", sequenceNumber: 42, displayCode: "042", destinationZoneId: "z1" }),
      ],
      zones,
      photos: [],
    });
    const lines = csv.split("\r\n");
    expect(lines[0]).toMatch(/^number,room,color,status/);
    expect(lines[1]).toMatch(/^042,Kitchen,BLUE,packed/);
    expect(lines[2]).toMatch(/^043,,,packed/);
  });

  it("escapes a note containing a comma or a quote", () => {
    const csv = toCsv({
      containers: [makeContainer({ notes: 'mugs, "the good ones"' })],
      zones,
      photos: [],
    });
    expect(csv).toContain('"mugs, ""the good ones"""');
  });

  it("gives conditions their own columns for an insurance conversation", () => {
    const csv = toCsv({
      containers: [
        makeContainer({
          conditions: { damaged: { reportedAt: "2026-07-26T12:00:00.000Z", reportedBy: "mem1", photoIds: ["p1"] } },
        }),
      ],
      zones,
      photos: [],
    });
    expect(csv.split("\r\n")[1]).toContain("2026-07-26T12:00:00.000Z");
  });

  it("counts photos per box", () => {
    const photo = (id: string) => ({
      id,
      moveId: "m1",
      containerId: "c1",
      type: "contents" as const,
      width: 1600,
      height: 1200,
      bytes: 204800,
      uploadState: "uploaded" as const,
      attempts: 0,
      createdAt: "2026-07-25T18:00:00.000Z",
      createdBy: "mem1",
    });
    const csv = toCsv({
      containers: [makeContainer({ id: "c1" })],
      zones,
      photos: [photo("p1"), photo("p2")],
    });
    expect(csv.split("\r\n")[1]).toMatch(/,2,/);
  });
});
```


## Step 5: verify

```powershell
npm run verify
```

Expected: `tsc --noEmit` produces no output, then 6 test files and 47 tests pass.

If anything fails, stop and report the failure verbatim. Do not adjust a test to make it pass. The tests encode decisions from `docs/02-domain-model.md` and ADR-0003, and a failing test means either the port drifted or a decision needs revisiting. Both are conversations, not patches.

## Step 6: wire the gate

Add a Claude Code Stop hook that runs `npm run verify`, so a session cannot end with a red suite. Same pattern as the pytest gate in `passthrough`.

## Step 7: commit

```powershell
git add -A
git commit -m "feat(domain): schemas, number reservation, status, conditions, search, export"
```

Open the pull request. One logical change, per `AGENTS.md`.

## Out of scope for this file

Do not add, even if it seems obviously next:

- Firebase, firestore.rules, storage.rules
- Repository modules
- React components, routing, styling
- The photo pipeline or Dexie
- ESLint or Prettier config
- Any dependency not named in Step 2

If one of these seems required to make the above pass, that is a finding worth reporting, not a thing to install.

## Notes on three decisions embedded here

`nextSequenceNumber` takes the highest number used inside the member's own range and adds one. It never refills a gap left by a deleted box, because a reused number would collide with a marker already written on cardboard.

`canTransition` permits any backward move and constrains forward ones. Corrections happen on move day, and a system that refuses them gets worked around.

`search` checks `aiSummary` last, so a box whose confirmed note and unconfirmed summary both match reports the confirmed field. The result card can then avoid marking it as a suggestion.
