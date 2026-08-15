# Security Rules

Two people, one move. The entire authorization model is: are you a member of this move.

Rules changes require a matching test in `tests/rules/`. This is enforced by `AGENTS.md` and is not optional. Security rules are the only place in a client-only architecture where a mistake exposes data.

## Firestore

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function isMember(moveId) {
      return signedIn()
        && request.auth.uid in get(/databases/$(database)/documents/moves/$(moveId)).data.memberUids;
    }

    function unchanged(field) {
      return request.resource.data[field] == resource.data[field];
    }

    match /moves/{moveId} {
      allow get: if isMember(moveId);

      allow list: if signedIn()
        && request.auth.uid in resource.data.memberUids;

      allow create: if signedIn()
        && request.resource.data.memberUids == [request.auth.uid];

      allow update: if isMember(moveId)
        && unchanged('createdAt');

      allow delete: if isMember(moveId);

      match /members/{memberId} {
        allow read: if isMember(moveId);
        allow write: if isMember(moveId);
      }

      match /locations/{locationId} {
        allow read, write: if isMember(moveId);
      }

      match /zones/{zoneId} {
        allow read, write: if isMember(moveId);
      }

      match /containers/{containerId} {
        allow read: if isMember(moveId);

        allow create: if isMember(moveId)
          && request.resource.data.moveId == moveId
          && request.resource.data.createdBy == request.auth.uid
          && request.resource.data.sequenceNumber is int;

        allow update: if isMember(moveId)
          && unchanged('sequenceNumber')
          && unchanged('createdAt')
          && unchanged('createdBy')
          && request.resource.data.updatedBy == request.auth.uid;

        allow delete: if isMember(moveId);
      }

      match /photos/{photoId} {
        allow read: if isMember(moveId);
        allow create: if isMember(moveId)
          && request.resource.data.createdBy == request.auth.uid;
        allow update, delete: if isMember(moveId);
      }

      match /activity/{eventId} {
        allow read: if isMember(moveId);
        allow create: if isMember(moveId)
          && request.resource.data.actorId == request.auth.uid;
        allow update, delete: if false;
      }
    }
  }
}
```

Notes on the choices:

- The move document splits `read` into `get` and `list`. They cannot share one condition. `isMember(moveId)` resolves membership with `get()` against `/moves/$(moveId)`, and on a list query `moveId` is a wildcard with nothing bound to it, so that lookup returns null and the rule fails with a null value error before it ever looks at a document. The list condition reads `resource.data.memberUids` instead, which is the candidate document itself and is already loaded. This is not only a correctness fix: even where the `get()` resolves, it bills one extra document read per result, so a 40 move list would cost 80 reads.
- `list` is a filter on candidates, not a filter on the query. A client still has to send `where('memberUids', 'array-contains', uid)`. An unfiltered list of every move is denied the moment it reaches a document the caller does not belong to. `watchMoves` in `src/repositories/moves.ts` sends that filter and the rule asserts the same thing.
- `sequenceNumber` is immutable after creation. A renumbered box would break every physical marker in the house.
- Activity is append-only at the rules level, not just by convention.
- `memberUids` on the move document costs one document read per rule evaluation, cached within a request. The alternative is a `get` against the members subcollection, which costs the same and reads worse.
- Adding the second member requires updating `memberUids`, which any existing member can do. With two people that is the correct trust model.

## Cloud Storage

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /moves/{moveId}/{containerId}/{fileName} {
      allow read: if request.auth != null
        && firestore.exists(/databases/(default)/documents/moves/$(moveId))
        && request.auth.uid in firestore.get(/databases/(default)/documents/moves/$(moveId)).data.memberUids;

      allow create, update: if request.auth != null
        && request.auth.uid in firestore.get(/databases/(default)/documents/moves/$(moveId)).data.memberUids
        && request.resource.size < 2 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');

      allow delete: if request.auth != null
        && request.auth.uid in firestore.get(/databases/(default)/documents/moves/$(moveId)).data.memberUids;
    }
  }
}
```

The 2 MB ceiling is ten times the expected resized size. If an upload hits it, client-side resize failed and that should surface as an error rather than a slow expensive upload.

### The write rule was split on 2026-08-15, because it denied every delete

This was a live defect, not a tidy-up. Until this change the three operations shared one `allow write`:

```javascript
allow write: if request.auth != null
  && request.auth.uid in firestore.get(...).data.memberUids
  && request.resource.size < 2 * 1024 * 1024
  && request.resource.contentType.matches('image/.*');
```

A delete carries no `request.resource`. There is no incoming object, so there is no size and no content type to check. The last two conditions dereference a null and the rule evaluation errors, which Storage answers as a denial. So every delete of a photo object was rejected, on every attempt, with full signal, from the day `storage.rules` was written in APPLY-02.

Nothing noticed for two weeks because nothing in the app deleted a photo. The rule was only ever exercised by uploads, which is exactly the shape of defect a rules suite is supposed to catch and this one could not: there was no delete to test, so the missing case looked like coverage. The APPLY-09 plan then asserted from the outside that "Storage `write` covers delete", which is true of the operation list and false of the condition, and the delete path was built on top of it. Found in review on pull request 18 and fixed here.

`create` and `update` keep the ceiling and the content type, which are checks on bytes arriving. `delete` keeps membership only, which is the whole authorization model for everything else in this file.

The general lesson, worth more than the fix: a condition that reads `request.resource` belongs only on operations that carry one. Grouping delete with the write operations is the trap, and `write` is the alias that sets it.

## Required tests

`tests/rules/` must cover:

1. A signed-out request is denied everywhere.
2. A signed-in non-member is denied read on a move and all subcollections.
3. A member can read and write containers.
4. A member cannot change `sequenceNumber` on an existing container.
5. A member cannot change `createdBy`.
6. Nobody can update or delete an activity event.
7. Creating a move with a `memberUids` array that omits the creator is denied.
8. A Storage write above 2 MB is denied.
9. A Storage write with a non-image content type is denied.
10. The `array-contains` list query on `moves` succeeds against an empty collection, returns the caller's own move, and returns nothing for a caller who belongs to no move.
11. An unfiltered list of every move is denied.
12. A member can delete a photo object in their move. A signed-in non-member cannot. A signed-out request cannot.

Cases 10 and 11 are list queries. A rules suite built only from `getDoc` never evaluates the `list` path, which is how the null value error on the move rule reached a deployed build.

Case 12 is the delete path, added 2026-08-15 with the rule split above. A suite that only uploads never evaluates a delete, which is how a rule that denied every one of them survived two weeks of passing tests. Cases 8 and 9 stay on `create`, so the split has to keep both halves honest: deletes allowed, oversized and non-image uploads still refused.

Run with the emulator:

```powershell
firebase emulators:exec --only firestore,storage "npm run test:rules"
```
