import {
  buildSearchText,
  containerSchema,
  nextSequenceNumber,
  toDisplayCode,
  transition,
  type Container,
  type ContainerStatus,
  type MoveMember,
  type Zone,
} from "../domain";
import { reportCondition, clearCondition, type ConditionKey } from "../domain/conditions";
import type { ConditionReport } from "../domain/schemas";
import { db } from "../lib/firebase";
import { logActivity } from "./activity";
import {
  allWritten,
  createValidated,
  moveScoped,
  newId,
  nowIso,
  subscribeValidated,
  updateValidated,
  type PendingWrite,
} from "./shared";

const containers = (moveId: string) => moveScoped(db, moveId, "containers");

const NO_FLAGS = {
  fragile: false,
  heavy: false,
  keepUpright: false,
  doNotStack: false,
  containsLiquids: false,
  temperatureSensitive: false,
  highValue: false,
  importantDocuments: false,
} as const;

/**
 * Reserves the next number in the member's range and writes a `filling`
 * container immediately, before any other input exists. The number a person
 * writes on cardboard must never change afterward, so it is claimed first.
 *
 * `knownContainers` is the current subscription state, which the persistent
 * cache keeps complete for this member's own boxes even offline.
 *
 * The number is returned without waiting for the server, because the person
 * holding the marker cannot wait for it and the local cache already has the
 * document. `written` carries the server's answer for whoever wants it.
 */
export function reserveContainer(
  moveId: string,
  member: MoveMember,
  knownContainers: readonly Container[],
  actorUid: string
): PendingWrite<Container> {
  const sequenceNumber = nextSequenceNumber(member, knownContainers.map((c) => c.sequenceNumber));
  const now = nowIso();
  const created = createValidated(containers(moveId), containerSchema, {
    id: newId(),
    moveId,
    sequenceNumber,
    displayCode: toDisplayCode(sequenceNumber),
    type: "box",
    ownerMemberId: member.id,
    status: "filling",
    unpackPriority: "normal",
    flags: { ...NO_FLAGS },
    conditions: {},
    createdAt: now,
    createdBy: actorUid,
    updatedAt: now,
    updatedBy: actorUid,
    searchText: toDisplayCode(sequenceNumber),
  });
  const logged = logActivity(moveId, {
    containerId: created.value.id,
    actorId: actorUid,
    type: "container_created",
    payload: { sequenceNumber },
  });
  return { value: created.value, written: allWritten(created.written, logged.written) };
}

/** General edit path. Recomputes searchText so search never drifts from content. */
export function saveContainer(
  moveId: string,
  next: Container,
  zones: readonly Zone[],
  actorUid: string
): PendingWrite<Container> {
  const zoneName = zones.find((z) => z.id === next.destinationZoneId)?.name;
  const stamped: Container = {
    ...next,
    searchText: buildSearchText(next, zoneName),
    updatedAt: nowIso(),
    updatedBy: actorUid,
  };
  return updateValidated(containers(moveId), containerSchema, stamped);
}

export function setStatus(
  moveId: string,
  container: Container,
  to: ContainerStatus,
  actorUid: string
): PendingWrite<Container> {
  const { container: next, event } = transition(container, to, actorUid);
  const saved = updateValidated(containers(moveId), containerSchema, next);
  const logged = logActivity(moveId, event);
  return { value: saved.value, written: allWritten(saved.written, logged.written) };
}

export function reportContainerCondition(
  moveId: string,
  container: Container,
  key: ConditionKey,
  report: Omit<ConditionReport, "reportedAt" | "reportedBy">,
  actorUid: string
): PendingWrite<Container> {
  const { container: next, event } = reportCondition(container, key, report, actorUid);
  const saved = updateValidated(containers(moveId), containerSchema, next);
  const logged = logActivity(moveId, event);
  return { value: saved.value, written: allWritten(saved.written, logged.written) };
}

export function clearContainerCondition(
  moveId: string,
  container: Container,
  key: ConditionKey,
  actorUid: string
): PendingWrite<Container> {
  const { container: next, event } = clearCondition(container, key, actorUid);
  const saved = updateValidated(containers(moveId), containerSchema, next);
  const logged = logActivity(moveId, event);
  return { value: saved.value, written: allWritten(saved.written, logged.written) };
}

export function watchContainers(
  moveId: string,
  onData: (c: Container[]) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(containers(moveId), containerSchema, onData, { onError });
}
