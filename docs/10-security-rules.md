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
      allow read: if isMember(moveId);

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

      allow write: if request.auth != null
        && request.auth.uid in firestore.get(/databases/(default)/documents/moves/$(moveId)).data.memberUids
        && request.resource.size < 2 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

The 2 MB ceiling is ten times the expected resized size. If an upload hits it, client-side resize failed and that should surface as an error rather than a slow expensive upload.

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

Run with the emulator:

```powershell
firebase emulators:exec --only firestore,storage "npm run test:rules"
```
