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
  /** Absent means nobody has been asked yet, which is distinct from false. The privacy notice keys on that. */
  aiEnabled: z.boolean().optional(),
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
  /** Set when a box that was already written on is withdrawn. The document stays so its number stays retired. */
  voidedAt: isoString.optional(),
  voidedBy: z.string().min(1).optional(),
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
  /** `none` and absent mean the same thing; absent is what existing documents have. `skipped` is what dismissal writes and is what stops regeneration for that photo. */
  summaryState: z.enum(["none", "queued", "done", "skipped", "failed"]).optional(),
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
    "summary_generated",
    "container_voided",
    "container_unvoided",
    "container_deleted",
    "photo_deleted",
    "title_changed",
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
