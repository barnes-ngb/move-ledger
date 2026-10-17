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
  highestIssued?: number;      // number watermark, absent means 0. See Number reservation.
  removedAt?: string;          // ISO timestamp, set when the member is taken off the move
}
```

Number ranges are assigned once, when the member is added, and are not dynamic. The first member gets 1 to 499. Every member after that gets the next whole block of 500 above the highest `numberRangeEnd` any member has ever held: 500 to 999, then 1000 to 1499, and so on. `nextMemberRange` in `src/domain/numbers.ts` computes it and the Members screen shows it before anyone is added. `addMember` still refuses an overlapping range, so the assignment and the guard are two separate checks on the same rule.

`removedAt` marks a member who has been taken off the move. Added 2026-10-17 by APPLY-15, for a helper who packs for a few weeks and should not keep access afterward. Removing a member is two writes: their uid leaves `Move.memberUids`, which is what actually ends their access, and `removedAt` is stamped on this record as a single-field update. **The record is never deleted.** It carries the range and the watermark, and the range assignment reads every member record, removed ones included, so a removed member's range is retired for the life of the move rather than freed. Deleting the record would let the next member be given numbers that are already written in marker on boxes still in the move, which is the collision APPLY-13 closed. Their containers keep `ownerMemberId` and stay where they are. The owner cannot be removed and nobody can remove themselves; `removalRefusal` in `src/domain/members.ts` holds both refusals.

`highestIssued` is the highest `sequenceNumber` this member has ever been handed. It is written in the same batch as the container that took the number, so it cannot lag behind the containers collection on the server, and the rules refuse any write that lowers or removes it.

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
  displayCode: string;         // "042", or "1042" past 999, derived from sequenceNumber

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
    | "container_deleted"
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
- `displayCode` is `sequenceNumber` zero-padded to three digits, and wider when the number is. A third member numbers from 1000, so four-digit codes exist as of APPLY-15: `toDisplayCode(1000)` is `"1000"`, the schema accepts three digits or more, and the Find keypad's `MAX_DIGITS` is four.
- A zone name, color, or short code may change without affecting container identity.
- A deleted number is never reused.

## Number reservation

No counter document and no transaction. Each member owns a disjoint range. To get the next number, take the highest `sequenceNumber` within the current member's range across every container the local cache holds, voided ones included, and the member's own `highestIssued`, and add one. This works offline because the cache holds every container the member has created.

The watermark exists because the containers list is not always complete when a number is needed. Amended 2026-09-07 after production issued box number 1 twice in one move: the app had reloaded on the Add box screen, the screen reserved before the containers listener had delivered anything, and an empty list yields the bottom of the range. `highestIssued` is one more number in the list `nextSequenceNumber` reads, so a member document alone is enough to keep counting from the right place. The container and the watermark go to Firestore in one `writeBatch`. A batch queues offline exactly like a single write, and it is never two writes, because a crash between them would be the hole the watermark closes.

The screen also waits for the first containers snapshot before it reserves. The watermark is the guard that holds when that wait is not enough, and the wait is what keeps the watermark from being the only guard.

### What reservation cannot survive

Offline reservation is safe for one member on **one active device**. Two devices signed in as the same member can each be handed the same number while both are offline: neither can see the other's containers or the other's watermark until they reconnect. The watermark narrows that to the offline window rather than eliminating it; once either device syncs, the other's next reservation counts past it. There is no server-side check that could close this without a transaction, and a transaction needs a signal, which is the thing the app is designed not to require.

So each person packs from one phone. That is a rule of use, recorded in `plans/STATUS.md` and `decisions/0005-google-sign-in-two-accounts.md`, not a bug to fix.

### Four-digit numbers

A third member numbers from 1000, so four-digit box numbers exist as of APPLY-15. Checked 2026-10-17 for anything that assumed three:

- `toDisplayCode` pads to three and widens past it, and has a test for 1042. The container schema accepts `^\d{3,}$`.
- The Find keypad's `MAX_DIGITS` was already four.
- The box list and the CSV export sort on `sequenceNumber`, a number, never on `displayCode`, so 1000 sorts after 999 rather than between 100 and 101. Search ranks ties the same way.
- The label instruction prints `displayCode` as it is, so a four-digit box reads `1000  BLUE`.
- Text search matches a number as a prefix of `sequenceNumber` or a substring of `displayCode`, which needs no width.

One behavior changes, and it is on Find rather than in the data. Find opens a box the moment one match remains, and lists at most twelve rows. With only three-digit numbers, typing a full number left at most that number and ten others; once 1000 to 1499 are in use, a short number is also the prefix of four-digit ones. Typing 12 matches 12, 120 to 129, and 1200 to 1299, and the rows are in no particular order, so box 12 can be off the end of the twelve. Typing 100 can never auto-open box 100 while box 1000 exists. Nothing is lost and every box is still reachable by its full number from the box list, but Find is the ten-second lookup. Recorded in `plans/STATUS.md` and not fixed in APPLY-15; ordering the matches with an exact match first would close it.
