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
