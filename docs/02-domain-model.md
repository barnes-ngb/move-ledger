# Domain Model

All types below are the source of truth for the Zod schemas in `src/domain/schemas`. If a type here and a schema there disagree, the schema is wrong.

Naming: code uses `Zone` and `Container`. User-facing strings use Room and Box. See `docs/09-glossary.md`.

## Firestore layout

Everything nests under a move. This makes security rules a single membership check.

```text
moves/{moveId}
moves/{moveId}/members/{memberId}
moves/{moveId}/locations/{locationId}
moves/{moveId}/zones/{zoneId}
moves/{moveId}/containers/{containerId}
moves/{moveId}/photos/{photoId}
moves/{moveId}/activity/{eventId}
```

Photos are a move-level collection rather than a subcollection of container so that the pending-upload query does not require a collection group index.

## Move

```ts
interface Move {
  id: string;
  name: string;
  status: "planning" | "packing" | "moving" | "settling" | "complete";
  originLocationId?: string;
  destinationLocationId?: string;
  memberUids: string[];        // denormalized for security rules
  createdAt: string;           // ISO 8601 UTC
  updatedAt: string;
}
```

`memberUids` exists only so rules can authorize without a second document read per operation. It is written by the same code that writes a member document.

## MoveMember

```ts
interface MoveMember {
  id: string;
  moveId: string;
  uid: string;                 // Firebase Auth uid
  displayName: string;
  role: "owner" | "member";
  numberRangeStart: number;
  numberRangeEnd: number;
}
```

Number ranges are assigned once at setup and are not dynamic. Example: 1 to 499 and 500 to 999.

## Location

```ts
interface Location {
  id: string;
  moveId: string;
  name: string;
  type: "home" | "storage" | "truck" | "vehicle" | "staging" | "other";
}
```

Truck as a location is what makes load and unload meaningful on move day.

## Zone

A room or area inside a location.

```ts
interface Zone {
  id: string;
  moveId: string;
  locationId: string;
  name: string;                // "Kitchen"
  shortCode: string;           // "KIT"
  colorName: string;           // "BLUE", written on the box
  colorValue: string;          // "#1E5FBF", screen only
  sortOrder: number;
}
```

`colorName` is what the user writes with a marker. It must be a single word that reads clearly in handwriting. `colorValue` never appears on a physical box.

## Container

```ts
type ContainerStatus =
  | "filling"
  | "packed"
  | "staged"
  | "loaded"
  | "unloaded"
  | "opened"
  | "emptied";

type UnpackPriority =
  | "immediate"
  | "first_night"
  | "first_week"
  | "normal"
  | "storage";

interface ContainerFlags {
  fragile: boolean;
  heavy: boolean;
  keepUpright: boolean;
  doNotStack: boolean;
  containsLiquids: boolean;
  temperatureSensitive: boolean;
  highValue: boolean;
  importantDocuments: boolean;
}

interface ConditionReport {
  reportedAt: string;
  reportedBy: string;
  note?: string;
  photoIds: string[];
}

interface Container {
  id: string;
  moveId: string;

  sequenceNumber: number;      // unique per move
  displayCode: string;         // "042", derived from sequenceNumber

  type: "box" | "plastic_bin" | "furniture" | "appliance" | "bundle" | "other";

  title?: string;
  notes?: string;
  contentsSummary?: string;    // human-confirmed
  aiSummary?: string;          // never promoted without confirmation

  ownerMemberId: string;

  originZoneId?: string;
  currentLocationId?: string;
  currentZoneId?: string;
  destinationZoneId?: string;

  status: ContainerStatus;
  unpackPriority: UnpackPriority;
  flags: ContainerFlags;

  conditions: {
    missing?: ConditionReport;
    damaged?: ConditionReport;
  };

  labelConfirmedAt?: string;
  voidedAt?: string;           // withdrawn without freeing the number, see below
  voidedBy?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  searchText: string;          // lowercased concatenation, see below
}
```

### Status transitions

```text
filling -> packed
packed  -> staged | loaded
staged  -> loaded
loaded  -> unloaded
unloaded -> opened
opened  -> emptied
```

Backward transitions are allowed and are recorded as activity events. The transition function lives in `src/domain/status.ts` and is the only place a status changes.

`filling` exists because a box record is written to Firestore the moment its number is reserved, before the photo is taken. Without it, an abandoned box would have to claim a status it never reached.

### Deleting versus voiding

A box goes away in one of two ways, and which one is not a preference.

`nextSequenceNumber` takes the highest number in use and adds one. A gap in the middle of the range is never refilled, but the top of the range is not a gap: remove the highest-numbered box and the next box is handed that number again. If it is already written in marker, two pieces of cardboard carry it, and nothing downstream can tell them apart.

So a number is only free if it was never written down, and `labelConfirmedAt` is exactly that record. `canDelete` in `src/domain/lifecycle.ts` is the one place the rule is stated.

| Box | What happens |
| --- | --- |
| `filling`, no `labelConfirmedAt` | Deleted. The number was never written, so it goes back into circulation. |
| Anything else | Voided. `voidedAt` and `voidedBy` are stamped and the document stays. |

A voided box keeps its place in the collection so `nextSequenceNumber` keeps counting past it. That means it must stay in the subscription: filtering it out in a hook or a repository would hand its number to the next box and reintroduce the collision. Voided boxes are hidden in components only.

Voiding is reversible. Unvoiding removes both stamps, which has to reach Firestore as a field delete rather than an absent key.

### searchText

Firestore has no full-text search. For a few hundred boxes, client-side filtering over the local cache is sufficient and costs nothing.

`searchText` is maintained on every write as the lowercased concatenation of `displayCode`, `title`, `notes`, `contentsSummary`, `aiSummary`, and the destination zone name. Search filters the local collection with `includes()`. Do not add Algolia or a Cloud Function search index.

## ContainerPhoto

```ts
interface ContainerPhoto {
  id: string;
  moveId: string;
  containerId: string;
  type: "contents" | "closed_box" | "label" | "damage" | "other";
  storagePath?: string;        // set once uploaded
  downloadUrl?: string;
  width: number;
  height: number;
  bytes: number;
  uploadState: "pending" | "uploading" | "uploaded" | "failed";
  lastError?: string;
  attempts: number;
  createdAt: string;
  createdBy: string;
}
```

The image bytes themselves are never in Firestore. They live in IndexedDB until upload succeeds, then in Cloud Storage. See `docs/06-photo-upload-queue.md`.

## ActivityEvent

```ts
interface ActivityEvent {
  id: string;
  moveId: string;
  containerId?: string;
  actorId: string;
  type:
    | "container_created"
    | "photo_added"
    | "label_confirmed"
    | "status_changed"
    | "destination_changed"
    | "notes_changed"
    | "condition_reported"
    | "condition_cleared"
    | "summary_generated"
    | "container_voided"
    | "container_unvoided"
    | "photo_deleted"
    | "title_changed";
  occurredAt: string;
  payload: Record<string, unknown>;
}
```

Activity is append-only. Nothing edits or deletes an event.

## Identity rules

- Every entity uses a Firestore auto-ID.
- `sequenceNumber` is unique within a move and is drawn from the creating member's assigned range.
- `displayCode` is `sequenceNumber` zero-padded to three digits.
- A zone name, color, or short code may change without affecting container identity.
- A deleted number is never reused.

## Number reservation

No counter document and no transaction. Each member owns a disjoint range. To get the next number, query the local Firestore cache for the highest `sequenceNumber` within the current member's range and add one. This works offline because the cache holds every container the member has created.

The failure mode this cannot survive is one person signing into the same account on two devices while both are offline. That is a documented limitation, not a bug to fix.
