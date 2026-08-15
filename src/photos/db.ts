import Dexie, { type Table } from "dexie";

/**
 * Image bytes live here from capture until Cloud Storage confirms the upload.
 * This is the only hand-written offline storage in the app; everything else
 * relies on Firestore's persistent cache. See ADR-0004.
 */
export interface PhotoBlob {
  photoId: string;
  moveId: string;
  containerId: string;
  blob: Blob;
  createdAt: string;
}

class PhotoDb extends Dexie {
  blobs!: Table<PhotoBlob, string>;

  constructor() {
    super("move-ledger-photos");
    this.version(1).stores({ blobs: "photoId, containerId, createdAt" });
  }
}

export const photoDb = new PhotoDb();

export async function putBlob(record: PhotoBlob): Promise<void> {
  await photoDb.blobs.put(record);
}

export async function getBlob(photoId: string): Promise<PhotoBlob | undefined> {
  return photoDb.blobs.get(photoId);
}

export async function deleteBlob(photoId: string): Promise<void> {
  await photoDb.blobs.delete(photoId);
}

/** Creation order, because a person expects their photos back in the order taken. */
export async function pendingBlobs(): Promise<PhotoBlob[]> {
  return photoDb.blobs.orderBy("createdAt").toArray();
}

export async function blobsFor(containerId: string): Promise<PhotoBlob[]> {
  return photoDb.blobs.where("containerId").equals(containerId).sortBy("createdAt");
}

/** Drives the doc 06 storage budget guard. */
export async function pendingBytes(): Promise<number> {
  const all = await photoDb.blobs.toArray();
  return all.reduce((sum, b) => sum + b.blob.size, 0);
}
