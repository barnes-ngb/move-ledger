import { doc, getDoc, getDocFromCache } from "firebase/firestore";
import { containerPhotoSchema, type ContainerPhoto } from "../domain/schemas";
import { db } from "../lib/firebase";
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

export function watchPhotos(
  moveId: string,
  onData: (p: ContainerPhoto[]) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(photos(moveId), containerPhotoSchema, onData, { onError });
}
