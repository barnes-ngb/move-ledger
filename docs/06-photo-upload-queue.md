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

### What shipped

Built 2026-08-15 during the APPLY-09 run, having been specified here since the queue was written and never implemented.

The retry action is the marker itself. `PhotoStrip` already drew "Not sent yet" over a photo the queue had given up on, which is the only place a person finds out, so that is what they press. It reads "Send again" now and is a control of its own inside the tile rather than a label inside the tile's button.

`retryUpload` in `src/repositories/photos.ts` does the document half: `uploadState` back to `pending`, `attempts` to zero, `lastError` removed. Removed, not set to undefined and not left out. Firestore rejects an explicit undefined, and a key merely absent from an update leaves the stored value in place, so without a `deleteField` sentinel a stale failure message would sit under a photo that is uploading again.

`clearBackoff` in `src/photos/uploader.ts` does the other half, and it is the part this document did not anticipate. The attempt count and the next-try time live in module memory rather than in the record, which is deliberate and is explained above. It means resetting the document alone is not a retry: the uploader would still be holding a ten-minute wait recorded before the person asked, and the next pass would skip the photo. `clearBackoff` drops both maps for one photo id. `deletePhoto` calls it too, so the uploader stops chasing bytes whose document has gone.

The count in the header is still not built. Doc 04 section 9 carries the strings.

### Deleting a photo

Added 2026-08-15. `deletePhoto` removes a photo from the three places it exists, in this order: the Cloud Storage object, the Firestore document, the Dexie blob. `deleteContainer` does the same for every photo on a box, since capture writes a photo document before the box is saved and a box that is still a draft can be holding several.

The Storage delete is fired and not awaited, and that is the whole design of this function. Storage has no offline queue: Firestore takes a delete into its local cache and replays it on reconnect, and Storage either reaches the network now or does not happen. Awaiting it puts the Firestore delete behind however long the SDK spends retrying, which offline is around two minutes of a deleted photo still on screen, and nothing in this app waits on the network.

The cost is an orphaned object every time a photo is deleted offline, and it is permanent, because the document that held its path goes away. That is accepted. An object nobody points at costs a fraction of a cent against doc 11's budget; a photo that will not go away costs trust. Recorded under Live drift in `plans/STATUS.md` with what would close it.

For two weeks that orphan happened online too, and not by choice. `storage.rules` covered create, update, and delete with a single `allow write` whose last two conditions read `request.resource`, which a delete does not carry, so every delete was denied from the day the file was written. Found in review on pull request 18 and fixed on 2026-08-15 by splitting the rule: `create, update` keep the 2 MB ceiling and the image content type, `delete` keeps the membership check alone. Doc 10 carries the rule and the reasoning, and `tests/rules/storage.rules.test.ts` carries case 12.

The fix is in the repository and not in production until somebody runs `firebase deploy --only storage` by hand, because CI has no permission to ship rules. Photo deletes stay rejected in the live app until then, which is the offline behaviour above happening all the time.

The sweep in the last bullet above was never written and is no longer owed for this case. Deleting removes the blob at the source instead, and `deleteBlobsFor` catches any blob on a deleted box whose document never arrived.

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
| The strip, the camera button, retry | `src/ui/box/PhotoStrip.tsx` |
| Delete and retry on the record | `src/repositories/photos.ts` |

## Testing

- Domain test: the queue orders by `createdAt` and respects the concurrency cap. `drainOnce` takes its Storage and Firestore calls as injected dependencies so this runs with neither. `src/photos/__tests__/uploader.test.ts`.
- Integration test with the Storage emulator: a failed upload leaves the blob in Dexie. Not written. The unit test asserts the same rule against the injected dependencies, which is a weaker claim: it proves the uploader does not remove a blob it failed to confirm, not that Dexie kept it.
- Manual test: airplane mode, take five photos, close the tab, reopen, restore connectivity, confirm all five arrive.

That manual test is the acceptance criterion for Phase 1. It is manual on purpose. Nothing automated proves that bytes survive a browser closing.
