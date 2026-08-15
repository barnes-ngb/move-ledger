import { deleteDoc, deleteField, doc, getDoc, getDocFromCache, updateDoc } from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { containerPhotoSchema, type ContainerPhoto } from "../domain/schemas";
import { db, storage } from "../lib/firebase";
import { deleteBlob } from "../photos/db";
import { clearBackoff, kickUploader } from "../photos/uploader";
import {
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
 * Removes a photo from all three places it can exist, in that order.
 *
 * The Storage object goes first, while `storagePath` is still in hand. A
 * failure there is logged and nothing more: an object nobody points at costs a
 * fraction of a cent, and a photo that will not go away costs trust.
 *
 * Offline, the Storage call rejects after its own retry window and the
 * document and the local bytes still go. The photo leaves the screen when the
 * Firestore delete lands in the local cache, and the object is left behind.
 */
export async function deletePhoto(moveId: string, photo: ContainerPhoto): Promise<PendingWrite<void>> {
  if (photo.storagePath) {
    try {
      await deleteObject(storageRef(storage, photo.storagePath));
    } catch (e) {
      console.error(`Could not delete ${photo.storagePath}`, e);
    }
  }

  // Queues offline like every other write, so this is not awaited.
  const written = deleteDoc(doc(photos(moveId), photo.id));

  // The uploader would otherwise find bytes with no document and keep trying.
  clearBackoff(photo.id);
  await deleteBlob(photo.id);

  return { value: undefined, written };
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
