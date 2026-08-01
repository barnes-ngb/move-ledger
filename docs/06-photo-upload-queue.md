# Photo Upload Queue

This document exists because of one specific gap. Firestore queues writes offline and replays them across app restarts. Cloud Storage does not. An upload started while offline fails, and an upload in progress dies when the tab closes.

Photos are the only thing in this app that we queue ourselves.

## Rule

A captured photo is never lost. It exists in IndexedDB from the moment of capture until Cloud Storage confirms the upload.

## Capture path

1. User takes a photo through `<input type="file" accept="image/*" capture="environment">`.
2. Resize on the client before anything else. Draw to a canvas at a maximum 1600px long edge, export JPEG at quality 0.8. A phone photo goes from roughly 4 MB to roughly 200 KB. This is the single most important line in this document, for both cost and upload time.
3. Write the resized blob to Dexie with a generated `photoId`.
4. Write a `ContainerPhoto` document to Firestore with `uploadState: "pending"`. This write queues offline like any other.
5. Show the photo in the UI immediately from the Dexie blob via `URL.createObjectURL`.
6. Return control to the user. Never await the upload.

The user is now free to save the box and start the next one. The 20-second target depends on this.

## Dexie schema

```ts
db.version(1).stores({
  blobs: "photoId, containerId, createdAt",
});

interface PhotoBlob {
  photoId: string;
  moveId: string;
  containerId: string;
  blob: Blob;
  createdAt: string;
}
```

## Uploader

A single module owns the queue. It runs on app start, on `online`, and after every capture.

```text
1. Query Dexie for all blobs.
2. For each, in creation order, if not already uploading:
   a. Set uploadState to "uploading".
   b. uploadBytes to moves/{moveId}/{containerId}/{photoId}.jpg
   c. On success: getDownloadURL, update the Firestore doc with
      storagePath, downloadUrl, uploadState "uploaded". Delete the Dexie blob.
   d. On failure: increment attempts, record lastError,
      set uploadState "failed" after 5 attempts.
3. Back off between attempts: 2s, 8s, 30s, 2m, 10m.
```

Concurrency is capped at two uploads at a time. On a phone hotspot, more is worse.

## Failure handling

- `uploadState: "failed"` shows a retry action on the box detail screen and a count in the header.
- Retry resets `attempts` to zero and re-queues.
- The Dexie blob is deleted only after Firestore confirms the metadata update, not merely after the Storage upload returns.
- If Dexie holds a blob whose Firestore document no longer exists, the blob is deleted on next sweep.

## Storage budget guard

Before capture, check total Dexie blob bytes. Above 200 MB of pending blobs, warn the user that photos are not uploading. That threshold indicates connectivity has been absent for a long time, not that anything is broken.

## Testing

- Domain test: the queue orders by `createdAt` and respects the concurrency cap.
- Integration test with the Storage emulator: a failed upload leaves the blob in Dexie.
- Manual test: airplane mode, take five photos, close the tab, reopen, restore connectivity, confirm all five arrive.

That manual test is the acceptance criterion for Phase 1.
