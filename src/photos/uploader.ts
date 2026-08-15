import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../lib/firebase";
import { getPhotoRecord, updatePhotoRecord } from "../repositories";
import type { ContainerPhoto } from "../domain";
import { deleteBlob, pendingBlobs, type PhotoBlob } from "./db";

/** Doc 06. More than two at once is worse on a phone hotspot. */
export const MAX_CONCURRENT = 2;

/** Doc 06's ladder, in milliseconds. */
export const BACKOFF_MS = [2_000, 8_000, 30_000, 120_000, 600_000] as const;

export const MAX_ATTEMPTS = BACKOFF_MS.length;

export interface UploaderDeps {
  list: () => Promise<PhotoBlob[]>;
  upload: (b: PhotoBlob) => Promise<{ storagePath: string; downloadUrl: string }>;
  confirm: (b: PhotoBlob, result: { storagePath: string; downloadUrl: string }) => Promise<void>;
  fail: (b: PhotoBlob, attempts: number, error: unknown) => Promise<void>;
  remove: (photoId: string) => Promise<void>;
  now?: () => number;
}

const attemptsById = new Map<string, number>();
const nextTryById = new Map<string, number>();
const inFlight = new Set<string>();

/**
 * Drains the queue once. Exported with injected dependencies so the ordering
 * and the concurrency cap can be tested without Storage, which doc 06 asks
 * for by name.
 */
export async function drainOnce(deps: UploaderDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const all = await deps.list();
  const ready = all.filter((b) => !inFlight.has(b.photoId) && (nextTryById.get(b.photoId) ?? 0) <= now());
  const batch = ready.slice(0, Math.max(0, MAX_CONCURRENT - inFlight.size));

  await Promise.all(
    batch.map(async (b) => {
      inFlight.add(b.photoId);
      try {
        const result = await deps.upload(b);
        // The blob is deleted only after the metadata write confirms, per
        // doc 06. A blob outliving its upload is recoverable; the reverse is
        // a photo that exists nowhere.
        await deps.confirm(b, result);
        await deps.remove(b.photoId);
        attemptsById.delete(b.photoId);
        nextTryById.delete(b.photoId);
      } catch (e) {
        const attempts = (attemptsById.get(b.photoId) ?? 0) + 1;
        attemptsById.set(b.photoId, attempts);
        const wait = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]!;
        nextTryById.set(b.photoId, now() + wait);
        await deps.fail(b, attempts, e);
      } finally {
        inFlight.delete(b.photoId);
      }
    })
  );
}

function liveDeps(): UploaderDeps {
  return {
    list: pendingBlobs,
    upload: async (b) => {
      const storagePath = `moves/${b.moveId}/${b.containerId}/${b.photoId}.jpg`;
      const objectRef = ref(storage, storagePath);
      await uploadBytes(objectRef, b.blob, { contentType: "image/jpeg" });
      return { storagePath, downloadUrl: await getDownloadURL(objectRef) };
    },
    confirm: async (b, result) => {
      await patchPhoto(b, {
        storagePath: result.storagePath,
        downloadUrl: result.downloadUrl,
        uploadState: "uploaded",
      });
    },
    fail: async (b, attempts, error) => {
      await patchPhoto(b, {
        uploadState: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts,
        lastError: error instanceof Error ? error.message : String(error),
      });
    },
    remove: deleteBlob,
  };
}

/**
 * The photo document is read back from the local cache before patching, so a
 * partial update never overwrites fields the uploader does not own. Optional
 * fields arrive already spread into the patch; an explicit undefined is
 * rejected by Firestore at the write.
 *
 * This is the one write in the app that waits for the server. Doc 06 deletes
 * the blob only after Firestore confirms the metadata update, not merely
 * after the Storage upload returns, and the uploader is online by definition
 * at the moment it gets here.
 */
async function patchPhoto(b: PhotoBlob, patch: Partial<ContainerPhoto>): Promise<void> {
  const current = await getPhotoRecord(b.moveId, b.photoId);
  if (!current) return;
  await updatePhotoRecord(b.moveId, { ...current, ...patch }).written;
}

let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Runs on app start, on `online`, and after every capture, per doc 06. Never
 * awaited by the UI. Reschedules itself while work remains so a back-off is
 * actually honored rather than waiting for the next external trigger.
 */
export function kickUploader(deps: UploaderDeps = liveDeps()): void {
  if (running) return;
  running = true;
  void drainOnce(deps)
    .catch((e) => console.error("Uploader pass failed", e))
    .finally(async () => {
      running = false;
      const remaining = await deps.list().catch(() => []);
      if (remaining.length > 0) {
        clearTimeout(timer);
        timer = setTimeout(() => kickUploader(deps), 5_000);
      }
    });
}

export function startUploader(): () => void {
  kickUploader();
  const onOnline = () => kickUploader();
  window.addEventListener("online", onOnline);
  return () => {
    window.removeEventListener("online", onOnline);
    clearTimeout(timer);
  };
}

/** Test seam. Never call this from app code. */
export function __resetUploaderState(): void {
  attemptsById.clear();
  nextTryById.clear();
  inFlight.clear();
  running = false;
  clearTimeout(timer);
}
