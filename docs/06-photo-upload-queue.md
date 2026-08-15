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

The user is now free to save the box and start the next one. The first success criterion depends on this.

Step 4 is not awaited either, and for the same reason as step 6. A Firestore write promise settles on server acknowledgment, so awaiting the metadata write would block capture in exactly the basement this queue exists for. See the offline write note in `docs/05-system-architecture.md`.

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
   a. Hold the photo id in memory as in flight.
   b. uploadBytes to moves/{moveId}/{containerId}/{photoId}.jpg
   c. On success: getDownloadURL, update the Firestore doc with
      storagePath, downloadUrl, uploadState "uploaded". Delete the Dexie blob.
   d. On failure: increment attempts, record lastError,
      set uploadState "failed" after 5 attempts.
3. Back off between attempts: 2s, 8s, 30s, 2m, 10m.
```

Concurrency is capped at two uploads at a time. On a phone hotspot, more is worse.

Step 2a was "Set uploadState to uploading" until 2026-08-15. It is now an in-memory set, and `uploading` is never written to Firestore. Writing it costs a document write per attempt and buys nothing: the state is true for a few seconds inside one uploader pass, only that pass can act on it, and a phone that dies mid-upload would leave the record claiming an upload that no longer exists. The enum keeps the value because the record's shape is the durable part and a future uploader may want it. `attempts` and `lastError` are still written, because those outlive the pass and a person can see them.

The back-off ladder and the in-flight set are held in module memory rather than in Dexie, so closing the tab forgets them. That is intentional. A reopened app should try every pending photo once, immediately, rather than honoring a ten-minute wait recorded before the phone found signal again.

## Failure handling

- `uploadState: "failed"` shows a retry action on the box detail screen and a count in the header.
- Retry resets `attempts` to zero and re-queues.
- The Dexie blob is deleted only after Firestore confirms the metadata update, not merely after the Storage upload returns.
- If Dexie holds a blob whose Firestore document no longer exists, the blob is deleted on next sweep.

## Storage budget guard

Before capture, check total Dexie blob bytes. Above 200 MB of pending blobs, warn the user that photos are not uploading. That threshold indicates connectivity has been absent for a long time, not that anything is broken.

## Where this lives

| Piece | File |
| --- | --- |
| Dexie schema and queries | `src/photos/db.ts` |
| Resize | `src/photos/resize.ts` |
| Capture path | `src/photos/capture.ts` |
| Uploader, back-off, concurrency cap | `src/photos/uploader.ts` |
| Metadata merged with local bytes | `src/hooks/usePhotos.ts` |
| The strip and the camera button | `src/ui/box/PhotoStrip.tsx` |

## Testing

- Domain test: the queue orders by `createdAt` and respects the concurrency cap. `drainOnce` takes its Storage and Firestore calls as injected dependencies so this runs with neither. `src/photos/__tests__/uploader.test.ts`.
- Integration test with the Storage emulator: a failed upload leaves the blob in Dexie. Not written. The unit test asserts the same rule against the injected dependencies, which is a weaker claim: it proves the uploader does not remove a blob it failed to confirm, not that Dexie kept it.
- Manual test: airplane mode, take five photos, close the tab, reopen, restore connectivity, confirm all five arrive.

That manual test is the acceptance criterion for Phase 1. It is manual on purpose. Nothing automated proves that bytes survive a browser closing.
