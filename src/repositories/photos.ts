import { containerPhotoSchema, type ContainerPhoto } from "../domain/schemas";
import { db } from "../lib/firebase";
import { createValidated, moveScoped, newId, nowIso, subscribeValidated, updateValidated } from "./shared";

const photos = (moveId: string) => moveScoped(db, moveId, "photos");

/**
 * Metadata only. Image bytes never touch Firestore; they sit in Dexie until the
 * upload queue (APPLY-03) moves them to Cloud Storage. This record queues
 * offline like any other document, which is the point.
 */
export async function addPhotoRecord(
  moveId: string,
  photo: Omit<ContainerPhoto, "id" | "moveId" | "createdAt" | "uploadState" | "attempts">,
  actorUid: string
): Promise<ContainerPhoto> {
  return createValidated(photos(moveId), containerPhotoSchema, {
    ...photo,
    id: newId(),
    moveId,
    uploadState: "pending",
    attempts: 0,
    createdAt: nowIso(),
    createdBy: actorUid,
  });
}

export async function updatePhotoRecord(moveId: string, next: ContainerPhoto): Promise<ContainerPhoto> {
  return updateValidated(photos(moveId), containerPhotoSchema, next);
}

export function watchPhotos(moveId: string, onData: (p: ContainerPhoto[]) => void): () => void {
  return subscribeValidated(photos(moveId), containerPhotoSchema, onData);
}
