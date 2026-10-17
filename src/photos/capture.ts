import type { ContainerPhoto } from "../domain";
import { addPhotoRecord } from "../repositories";
import { writeInBackground } from "../repositories/background";
import { putBlob } from "./db";
import { resizeForUpload } from "./resize";
import { kickUploader } from "./uploader";

export type PhotoKind = ContainerPhoto["type"];

/**
 * Doc 06's capture path, in order. Resize, persist the bytes locally, write
 * the metadata document without waiting for the server, hand control back.
 *
 * The Firestore write is deliberately not awaited. Its promise settles on
 * server acknowledgment, so awaiting it would block capture offline, which is
 * the one situation this whole queue exists for.
 */
export async function capturePhoto(args: {
  file: File | Blob;
  moveId: string;
  containerId: string;
  actorUid: string;
  kind: PhotoKind;
  /**
   * When several photos are chosen at once, the caller hands each one its own
   * stamp a millisecond apart, so they sort in the order chosen in both
   * places a photo is listed: the Firestore record and the local blob.
   */
  createdAt?: string;
}): Promise<string> {
  const { blob, width, height } = await resizeForUpload(args.file);
  const photoId = crypto.randomUUID();
  const createdAt = args.createdAt ?? new Date().toISOString();

  // Bytes first. If anything after this fails, the photo still exists.
  await putBlob({
    photoId,
    moveId: args.moveId,
    containerId: args.containerId,
    blob,
    createdAt,
  });

  const record = addPhotoRecord(
    args.moveId,
    {
      id: photoId,
      containerId: args.containerId,
      type: args.kind,
      width,
      height,
      bytes: blob.size,
    },
    args.actorUid,
    createdAt
  );
  writeInBackground(record.written);

  kickUploader();
  return photoId;
}
