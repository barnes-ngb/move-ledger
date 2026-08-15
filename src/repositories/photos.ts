import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { containerPhotoSchema, type ContainerPhoto } from "../domain/schemas";
import { db, storage } from "../lib/firebase";
import { deleteBlob } from "../photos/db";
import { clearBackoff, kickUploader } from "../photos/uploader";
import { logActivity } from "./activity";
import {
  allWritten,
  createValidated,
  moveScoped,
  nowIso,
  subscribeValidated,
  updateValidated,
  type PendingWrite,
} from "./shared";

const photos = (moveId: string) => moveScoped(db, moveId, "photos");

/**
 * Metadata only. Image bytes never touch Firestore; they sit in Dexie until the
 * upload queue moves them to Cloud Storage. This record queues offline like any
 * other document, which is the point.
 *
 * The id is supplied by the caller rather than generated here, so the Dexie
 * key, the Firestore document id, and the storage path are one value.
 */
export function addPhotoRecord(
  moveId: string,
  photo: Omit<ContainerPhoto, "moveId" | "createdAt" | "createdBy" | "uploadState" | "attempts">,
  actorUid: string
): PendingWrite<ContainerPhoto> {
  return createValidated(photos(moveId), containerPhotoSchema, {
    ...photo,
    moveId,
    uploadState: "pending",
    attempts: 0,
    createdAt: nowIso(),
    createdBy: actorUid,
  });
}

export function updatePhotoRecord(moveId: string, next: ContainerPhoto): PendingWrite<ContainerPhoto> {
  return updateValidated(photos(moveId), containerPhotoSchema, next);
}

/**
 * One photo document, served from the local cache. The uploader reads a record
 * back before patching it so a partial update never overwrites a field it does
 * not own, and it must not pay a server read to do that on every upload.
 *
 * The server is asked only when the cache has never seen this document, which
 * is the case where the alternative is patching a record blind.
 */
export async function getPhotoRecord(
  moveId: string,
  photoId: string
): Promise<ContainerPhoto | undefined> {
  const ref = doc(photos(moveId), photoId);
  let snap;
  try {
    snap = await getDocFromCache(ref);
  } catch {
    snap = await getDoc(ref);
  }
  if (!snap.exists()) return undefined;
  const parsed = containerPhotoSchema.safeParse({ ...snap.data(), id: snap.id });
  if (!parsed.success) {
    console.error(`Invalid document ${snap.id}`, parsed.error);
    return undefined;
  }
  return parsed.data;
}

/**
 * Every photo document for one box, served from the local cache so it works
 * with no signal. Used when the box itself is deleted.
 */
export async function photosForContainer(
  moveId: string,
  containerId: string
): Promise<ContainerPhoto[]> {
  const q = query(photos(moveId), where("containerId", "==", containerId));
  let snap;
  try {
    snap = await getDocsFromCache(q);
  } catch {
    snap = await getDocs(q);
  }
  const found: ContainerPhoto[] = [];
  for (const d of snap.docs) {
    const parsed = containerPhotoSchema.safeParse({ ...d.data(), id: d.id });
    if (parsed.success) found.push(parsed.data);
    else console.error(`Invalid document ${d.id}`, parsed.error);
  }
  return found;
}

/**
 * Removes a photo from the three places it can exist, in that order.
 *
 * The Storage object goes first, while `storagePath` is still in hand, and is
 * deliberately not awaited. Awaiting it would hold the Firestore delete behind
 * however long the Storage SDK spends retrying, which offline is around two
 * minutes of a deleted photo still sitting on screen. Nothing in this app
 * waits on the network, and a delete is not the place to start.
 *
 * A Storage failure is logged and nothing more: an object nobody points at
 * costs a fraction of a cent, and a photo that will not go away costs trust.
 * Offline, the delete never reaches Storage at all and the object is orphaned.
 * That is accepted, and recorded in plans/STATUS.md.
 *
 * `removePhotoBytes` is the same work without the activity event, because
 * `deleteContainer` calls this for a box that is about to stop existing and an
 * event pointing at a deleted container is a dangling reference.
 */
function removePhotoBytes(moveId: string, photo: ContainerPhoto): Promise<void> {
  const { storagePath } = photo;
  if (storagePath) {
    void deleteObject(storageRef(storage, storagePath)).catch((e) =>
      console.error(`Could not delete ${storagePath}`, e)
    );
  }

  // Queues offline like every other write, so this is not awaited either.
  const written = deleteDoc(doc(photos(moveId), photo.id));

  // The uploader would otherwise find bytes with no document and keep trying.
  clearBackoff(photo.id);
  void deleteBlob(photo.id).catch((e) => console.error(`Could not delete local photo ${photo.id}`, e));

  return written;
}

export function deletePhoto(
  moveId: string,
  photo: ContainerPhoto,
  actorUid: string
): PendingWrite<void> {
  const written = removePhotoBytes(moveId, photo);
  const logged = logActivity(moveId, {
    containerId: photo.containerId,
    actorId: actorUid,
    type: "photo_deleted",
    payload: { photoId: photo.id, type: photo.type },
  });
  return { value: undefined, written: allWritten(written, logged.written) };
}

/**
 * For `deleteContainer` and nothing else. Same removal, no activity event,
 * because the container the event would point at is going away in the same
 * breath. Anything a person does to a single photo goes through `deletePhoto`.
 */
export function removePhotoWithContainer(moveId: string, photo: ContainerPhoto): Promise<void> {
  return removePhotoBytes(moveId, photo);
}

/**
 * Doc 06's retry action. Puts the record back to pending with a clean slate so
 * the next uploader pass treats it as a photo it has never seen.
 *
 * `lastError` is deleted rather than written as undefined. Firestore rejects an
 * explicit undefined, and a key left out of an update leaves the stored value,
 * so a stale failure message would sit under a photo that is uploading again.
 *
 * The attempt count and the back-off delay also live in the uploader's module
 * memory, and clearing only the document would leave the retry waiting out a
 * ladder the person just asked to skip.
 */
export function retryUpload(moveId: string, photo: ContainerPhoto): PendingWrite<ContainerPhoto> {
  const { lastError: _cleared, ...rest } = photo;
  const next = containerPhotoSchema.parse({ ...rest, uploadState: "pending", attempts: 0 });
  const { id, ...fields } = next;
  const written = updateDoc(doc(photos(moveId), id), { ...fields, lastError: deleteField() });

  clearBackoff(photo.id);
  kickUploader();

  return { value: next, written };
}

export function watchPhotos(
  moveId: string,
  onData: (p: ContainerPhoto[]) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(photos(moveId), containerPhotoSchema, onData, { onError });
}
