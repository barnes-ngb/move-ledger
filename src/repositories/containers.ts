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
import { deleteField, doc, updateDoc } from "firebase/firestore";
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

/**
 * Clears `aiSummary` and rebuilds `searchText` around its absence.
 *
 * `aiSummary` has to be deleted rather than written as undefined. Firestore
 * rejects an explicit undefined outright, and a key merely left out of an
 * update leaves the stored value in place, so the suggestion would survive its
 * own acceptance and keep matching searches after the person dismissed it.
 *
 * `contentsSummary` is passed only by Accept. Dismiss leaves whatever the
 * person typed themselves alone, per doc 07: AI output never overwrites
 * confirmed text.
 */
function withoutAiSummary(
  moveId: string,
  container: Container,
  zones: readonly Zone[],
  actorUid: string,
  contentsSummary?: string
): PendingWrite<Container> {
  const { aiSummary: _cleared, ...rest } = container;
  const next: Container = {
    ...rest,
    ...(contentsSummary ? { contentsSummary } : {}),
    updatedAt: nowIso(),
    updatedBy: actorUid,
  };
  const stamped: Container = {
    ...next,
    searchText: buildSearchText(next, zones.find((z) => z.id === next.destinationZoneId)?.name),
  };
  const parsed = containerSchema.parse(stamped);
  const { id, ...fields } = parsed;
  return {
    value: parsed,
    written: updateDoc(doc(containers(moveId), id), { ...fields, aiSummary: deleteField() }),
  };
}

/** The suggestion becomes confirmed text. Doc 07's one tap. */
export function acceptAiSummary(
  moveId: string,
  container: Container,
  zones: readonly Zone[],
  text: string,
  actorUid: string
): PendingWrite<Container> {
  return withoutAiSummary(moveId, container, zones, actorUid, text.trim());
}

/** The suggestion is thrown away. Stopping regeneration is the caller's job, on the photos. */
export function dismissAiSummary(
  moveId: string,
  container: Container,
  zones: readonly Zone[],
  actorUid: string
): PendingWrite<Container> {
  return withoutAiSummary(moveId, container, zones, actorUid);
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
