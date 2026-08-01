# ADR-0004: Hand-written photo upload queue

Status: accepted
Date: 2026-07-25

## Context

ADR-0001 chose Firebase largely because Firestore's persistent local cache removes the need for a hand-written sync queue. It queues writes on disk and replays them on reconnect, surviving app restarts.

Cloud Storage does not do this. The Storage SDK's upload task is in-memory. An upload attempted while offline fails, and an upload in progress is lost when the tab closes or the phone sleeps the browser.

Packing happens in basements, garages, and storage units. Photos will be captured offline, routinely, and the app promises never to lose one.

## Decision

Write a small upload queue for photo bytes only. Blobs go to IndexedDB via Dexie at capture time. A single uploader module drains the queue with retry and back-off. The blob is deleted only after Firestore confirms the metadata update.

Everything else in the app relies on Firestore's built-in offline behavior. This queue exists for image bytes and nothing else.

## Alternatives considered

**Store image bytes as base64 in Firestore documents.** This would inherit offline queueing for free. Lost on the 1 MiB document limit and on the fact that it would put a hundred megabytes of image data into a database billed and indexed as documents.

**Block box creation until the upload succeeds.** Lost immediately. It breaks the 20-second target and it breaks offline packing, which are the two things the app exists to do.

**Use a service worker background sync API.** Lost on browser support inconsistency, particularly on iOS Safari, which is a target platform.

**Skip photos when offline and prompt the user to add them later.** Lost because the photo is the inventory. A box recorded without one is not much better than a marker on cardboard.

## Consequences

- One module, roughly two hundred lines, is the only hand-written sync code in the project.
- Client-side resize to a 1600px long edge at quality 0.8 becomes mandatory, both for upload time over a hotspot and for IndexedDB pressure.
- The photo record carries `uploadState`, `attempts`, and `lastError` so failure is a visible product state rather than a console message.
- A blob orphaned by a deleted photo document is cleaned on the next sweep.
- The acceptance test for Phase 1 is a manual one: airplane mode, five photos, close the tab, reopen, reconnect, confirm all five arrive.

## Revisit when

The Storage SDK gains durable offline queueing, or the app moves to a native shell where background upload is available from the platform.
