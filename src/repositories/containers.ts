import {
  buildSearchText,
  canDelete,
  containerSchema,
  nextSequenceNumber,
  toDisplayCode,
  transition,
  type Container,
  type ContainerStatus,
  type MoveMember,
  type Zone,
} from "../domain";
import { ContainerNotDeletableError } from "../domain/lifecycle";
import { deleteDoc, deleteField, doc, getDoc, getDocFromCache, updateDoc } from "firebase/firestore";
import { reportCondition, clearCondition, type ConditionKey } from "../domain/conditions";
import type { ConditionReport } from "../domain/schemas";
import { db } from "../lib/firebase";
import { deleteBlobsFor } from "../photos/db";
import { logActivity } from "./activity";
import { photosForContainer, removePhotoWithContainer } from "./photos";
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
 * The title, which searchText carries and the list row shows. Separate from
 * `saveContainer` only because it logs: a box getting a name is the kind of
 * change a person later wants to see they made.
 *
 * An emptied title is removed rather than stored as a blank string, so nothing
 * downstream has to tell "" and absent apart.
 */
export function setTitle(
  moveId: string,
  container: Container,
  title: string,
  zones: readonly Zone[],
  actorUid: string
): PendingWrite<Container> {
  const trimmed = title.trim();
  const { title: _previous, ...rest } = container;
  const next: Container = { ...rest, ...(trimmed ? { title: trimmed } : {}) };
  const parsed = containerSchema.parse({
    ...next,
    searchText: buildSearchText(next, zones.find((z) => z.id === next.destinationZoneId)?.name),
    updatedAt: nowIso(),
    updatedBy: actorUid,
  });
  const { id, ...fields } = parsed;
  // Emptying it has to reach Firestore as a delete. A key left out of an update
  // leaves the stored value, so the old title would survive being cleared and
  // keep matching searches.
  const written = updateDoc(doc(containers(moveId), id), {
    ...fields,
    ...(trimmed ? {} : { title: deleteField() }),
  });
  const logged = logActivity(moveId, {
    containerId: container.id,
    actorId: actorUid,
    type: "title_changed",
    payload: { title: trimmed || null },
  });
  return { value: parsed, written: allWritten(written, logged.written) };
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

/**
 * Withdraws a box without freeing its number. The document stays in the
 * collection on purpose: `reserveContainer` reads every container to find the
 * highest number in use, so a voided box is what keeps the count moving past a
 * number somebody has already written in marker.
 */
export function voidContainer(
  moveId: string,
  container: Container,
  actorUid: string
): PendingWrite<Container> {
  const now = nowIso();
  const next: Container = {
    ...container,
    voidedAt: now,
    voidedBy: actorUid,
    updatedAt: now,
    updatedBy: actorUid,
  };
  const saved = updateValidated(containers(moveId), containerSchema, next);
  const logged = logActivity(moveId, {
    containerId: container.id,
    actorId: actorUid,
    type: "container_voided",
    occurredAt: now,
    payload: { sequenceNumber: container.sequenceNumber },
  });
  return { value: saved.value, written: allWritten(saved.written, logged.written) };
}

/**
 * Puts a voided box back in use. Both stamps have to be removed rather than
 * written as undefined: Firestore rejects an explicit undefined, and a key left
 * out of an update leaves the stored value alone, so the box would come back
 * still voided. Same reason `withoutAiSummary` above reaches for `deleteField`.
 */
export function unvoidContainer(
  moveId: string,
  container: Container,
  actorUid: string
): PendingWrite<Container> {
  const { voidedAt: _clearedAt, voidedBy: _clearedBy, ...rest } = container;
  const now = nowIso();
  const parsed = containerSchema.parse({ ...rest, updatedAt: now, updatedBy: actorUid });
  const { id, ...fields } = parsed;
  const written = updateDoc(doc(containers(moveId), id), {
    ...fields,
    voidedAt: deleteField(),
    voidedBy: deleteField(),
  });
  const logged = logActivity(moveId, {
    containerId: container.id,
    actorId: actorUid,
    type: "container_unvoided",
    occurredAt: now,
    payload: { sequenceNumber: container.sequenceNumber },
  });
  return { value: parsed, written: allWritten(written, logged.written) };
}

/**
 * Removes a box outright, which is only ever correct when its number was never
 * written down. The guard reads the stored document rather than trusting an
 * object the caller handed over, so there is no way to reach the delete with a
 * container that says something the database does not.
 *
 * The photos go with it. Capture writes a photo document as soon as the shutter
 * closes, which is before the box is saved, so a box that is still a draft can
 * be holding several. Deleting only the container would strand them in three
 * places at once.
 *
 * The guard reads the server first and falls back to the cache, so it works in
 * a basement and does not decide from a stale copy when it does not have to.
 * The other phone can confirm a label at any moment, and this phone's cached
 * draft would then say a number is free that somebody has just written down.
 * Reading the server closes most of that window. It does not close all of it:
 * nothing here is atomic, and a confirmation landing between the read and the
 * delete still gets through. Closing it properly means the rule itself, which
 * cannot be expressed today because `canDelete` reads two fields the rule
 * would have to duplicate.
 *
 * The returned `written` settles on server acknowledgment like every other
 * write, and every delete is already applied locally before it does.
 *
 * No activity event is logged, for the container or for its photos, because
 * the plan asked for a plain delete and a box nobody wrote on has no history
 * worth keeping. Note that this does not leave the activity collection clean:
 * the `container_created` event from the reservation stays, since activity is
 * append-only and the rules refuse to delete it. So a deleted box already has
 * one event pointing at nothing, and adding a second would not change that.
 */
export async function deleteContainer(
  moveId: string,
  containerId: string
): Promise<PendingWrite<void>> {
  const ref = doc(containers(moveId), containerId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch {
    snap = await getDocFromCache(ref);
  }
  if (!snap.exists()) return { value: undefined, written: Promise.resolve() };

  const container = containerSchema.parse({ ...snap.data(), id: snap.id });
  if (!canDelete(container)) throw new ContainerNotDeletableError(container);

  // Photos first. If this phone dies between the two, a box with no photos is
  // recoverable and a photo with no box is not reachable from anywhere.
  const photos = await photosForContainer(moveId, containerId);
  const photoWrites = photos.map((p) => removePhotoWithContainer(moveId, p));

  // Catches bytes whose document never arrived or has already gone. Local, so
  // it is awaited: there is nothing to wait for but IndexedDB.
  await deleteBlobsFor(containerId);

  return { value: undefined, written: allWritten(deleteDoc(ref), ...photoWrites) };
}

export function watchContainers(
  moveId: string,
  onData: (c: Container[]) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(containers(moveId), containerSchema, onData, { onError });
}
