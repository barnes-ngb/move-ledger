# APPLY-02: Firebase init, auth, repositories, rules

For Claude Code. Read the whole file before running anything. APPLY-01 must already be merged; this builds directly on `src/domain`.

## What this does

Wires the domain core to Firebase. App init with the persistent local cache, Google sign-in, one repository module per collection with schema-validated writes, security rules from doc 10 verbatim, and rules tests.

## What this does not do

No UI beyond what APPLY-01 left. No photo pipeline (APPLY-03). No Cloud Function (APPLY-04). Do not start those even if they seem obviously next.

## Verified against

Built before delivery on Node 22.22 with firebase 12.17.0, zod 4.4.3, typescript 7.0.2, vitest 4.1.10, @firebase/rules-unit-testing 5.x. `tsc --noEmit` strict clean including the rules tests, and the 47 domain tests still pass with the SDK in the dependency graph.

NOT verified before delivery: the rules tests were never executed, because the emulator jars are unreachable from the build sandbox. They typecheck, and they encode the nine required cases from `docs/10-security-rules.md`, but their first real run is on this machine in Step 6. If one fails, the finding is real: either the rules or the test is wrong, and doc 10 arbitrates.

Note doc 05 says Firebase SDK v10. Resolved reality is v12 and the modular API is unchanged for everything used here. Update doc 05's version line in this PR.

## Governing docs and decisions

- `docs/05-system-architecture.md` for layer boundaries. Repositories are the only files importing `firebase/firestore`.
- `docs/10-security-rules.md` is the source for both rules files. They are copied verbatim; a deliberate change goes to the doc first.
- `decisions/0005-google-sign-in-two-accounts.md` is created by this apply-file and governs the auth shape.
- `AGENTS.md` for everything else.

## Preconditions. Stop if any fails.

1. Repository root contains `src/domain` with passing tests: `npm run verify` is green before anything here starts.
2. None of the files in Step 3 already exist. If any does, stop and report.
3. `git status` clean, on a fresh branch:

```powershell
git checkout -b feat/firebase-repositories
```

## Step 1: dependencies

```powershell
npm install firebase
npm install -D @firebase/rules-unit-testing
```

firebase-tools should already be global from the environment setup. If `firebase --version` fails: `npm i -g firebase-tools`.

## Step 2: package.json scripts

Add to `scripts`, leaving existing entries alone:

```json
"test:rules": "firebase emulators:exec --only firestore \"npx vitest run tests/rules --config vitest.rules.config.ts\""
```

And create `vitest.rules.config.ts` at the root:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000,
  },
});
```

## Step 3: write these files

Exactly as given. No reformatting, no improvements. `vitest.config.ts` REPLACES the one from APPLY-01 (the change is scoping the default run to `src` so rules tests only run under the emulator); every other file is new.

### `src/lib/firebase-config.ts`

```ts
/**
 * Firebase web app config. Filled by hand after the console setup walkthrough,
 * step 6. These values identify the project; they do not authorize anything.
 * Authorization lives in firestore.rules and storage.rules. This file is
 * committed on purpose.
 */
export const firebaseConfig = {
  apiKey: "FILL_ME",
  authDomain: "FILL_ME.firebaseapp.com",
  projectId: "FILL_ME",
  storageBucket: "FILL_ME.firebasestorage.app",
  messagingSenderId: "FILL_ME",
  appId: "FILL_ME",
} as const;

export function configIsFilled(): boolean {
  return !Object.values(firebaseConfig).some((v) => v.startsWith("FILL_ME"));
}
```

### `src/lib/firebase.ts`

```ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { firebaseConfig, configIsFilled } from "./firebase-config";

if (!configIsFilled()) {
  throw new Error(
    "firebase-config.ts still has FILL_ME values. Complete the console walkthrough and paste the web app config."
  );
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

/**
 * Persistent local cache is the offline story for everything except photo
 * bytes. Reads serve from disk, writes queue on disk and replay on reconnect,
 * surviving app restarts. See docs/05-system-architecture.md.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const storage = getStorage(app);
```

### `src/auth/index.ts`

```ts
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";

const provider = new GoogleAuthProvider();

/**
 * Popup rather than redirect. Redirect sign-in depends on third-party storage
 * behavior that modern mobile browsers keep tightening, and popup is the
 * currently recommended path for web. Two users will ever do this, once each,
 * per device.
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

/** Returns the unsubscribe function. Call it on unmount. */
export function watchAuth(onChange: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, onChange);
}

export function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No signed-in user. The UI must gate on watchAuth before calling repositories.");
  return uid;
}
```

### `src/repositories/shared.ts`

```ts
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  type CollectionReference,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
} from "firebase/firestore";
import type { ZodType } from "zod";

/**
 * Every write in the app funnels through these two functions. A document that
 * fails its schema never reaches Firestore, which keeps the database and
 * docs/02-domain-model.md in agreement by force rather than by discipline.
 */
export async function createValidated<T extends { id: string }>(
  ref: CollectionReference<DocumentData>,
  schema: ZodType<T>,
  value: T
): Promise<T> {
  const parsed = schema.parse(value);
  await setDoc(doc(ref, parsed.id), parsed);
  return parsed;
}

export async function updateValidated<T extends { id: string }>(
  ref: CollectionReference<DocumentData>,
  schema: ZodType<T>,
  next: T
): Promise<T> {
  const parsed = schema.parse(next);
  const { id, ...fields } = parsed;
  await updateDoc(doc(ref, id), fields as DocumentData);
  return parsed;
}

/**
 * Subscription helper. Documents that fail the schema on the way OUT are
 * dropped and reported rather than crashing the listener, because one bad
 * document must not brick the app on both phones at once.
 */
export function subscribeValidated<T>(
  ref: CollectionReference<DocumentData>,
  schema: ZodType<T>,
  onData: (items: T[]) => void,
  onBadDoc?: (id: string, error: unknown) => void,
  ...constraints: QueryConstraint[]
): () => void {
  const report = onBadDoc ?? ((id: string, e: unknown) => console.error(`Invalid document ${id}`, e));
  return onSnapshot(query(ref, ...constraints), (snap) => {
    const items: T[] = [];
    for (const d of snap.docs) {
      const parsed = schema.safeParse({ ...d.data(), id: d.id });
      if (parsed.success) items.push(parsed.data);
      else report(d.id, parsed.error);
    }
    onData(items);
  });
}

export function moveScoped(db: Firestore, moveId: string, sub: string): CollectionReference<DocumentData> {
  return collection(db, "moves", moveId, sub);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}
```

### `src/repositories/moves.ts`

```ts
import { collection, deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { moveSchema, type Move } from "../domain/schemas";
import { createValidated, newId, nowIso, subscribeValidated, updateValidated } from "./shared";

const moves = () => collection(db, "moves");

export async function createMove(name: string, creatorUid: string): Promise<Move> {
  const now = nowIso();
  return createValidated(moves(), moveSchema, {
    id: newId(),
    name,
    status: "planning",
    memberUids: [creatorUid],
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateMove(next: Move): Promise<Move> {
  return updateValidated(moves(), moveSchema, { ...next, updatedAt: nowIso() });
}

/** Rules restrict reads to member moves, so an unfiltered subscription returns only ours. */
export function watchMoves(onData: (m: Move[]) => void): () => void {
  return subscribeValidated(moves(), moveSchema, onData);
}

export async function deleteMove(moveId: string): Promise<void> {
  await deleteDoc(doc(moves(), moveId));
}
```

### `src/repositories/members.ts`

```ts
import { moveMemberSchema, rangesOverlap, type MoveMember } from "../domain";
import { db } from "../lib/firebase";
import { createValidated, moveScoped, newId, subscribeValidated } from "./shared";

const members = (moveId: string) => moveScoped(db, moveId, "members");

/**
 * Refuses an overlapping range at the door. Overlap is how two boxes end up
 * wearing the same number, and no later code can repair that.
 */
export async function addMember(
  moveId: string,
  member: Omit<MoveMember, "id" | "moveId">,
  existing: readonly MoveMember[]
): Promise<MoveMember> {
  for (const other of existing) {
    if (rangesOverlap(member, other)) {
      throw new Error(
        `Range ${member.numberRangeStart} to ${member.numberRangeEnd} overlaps ${other.displayName}'s range.`
      );
    }
  }
  return createValidated(members(moveId), moveMemberSchema, { ...member, id: newId(), moveId });
}

export function watchMembers(moveId: string, onData: (m: MoveMember[]) => void): () => void {
  return subscribeValidated(members(moveId), moveMemberSchema, onData);
}
```

### `src/repositories/zones.ts`

```ts
import { deleteDoc, doc } from "firebase/firestore";
import { locationSchema, zoneSchema, type Location, type Zone } from "../domain/schemas";
import { db } from "../lib/firebase";
import { createValidated, moveScoped, newId, subscribeValidated, updateValidated } from "./shared";

const zones = (moveId: string) => moveScoped(db, moveId, "zones");
const locations = (moveId: string) => moveScoped(db, moveId, "locations");

export async function addLocation(moveId: string, loc: Omit<Location, "id" | "moveId">): Promise<Location> {
  return createValidated(locations(moveId), locationSchema, { ...loc, id: newId(), moveId });
}

export function watchLocations(moveId: string, onData: (l: Location[]) => void): () => void {
  return subscribeValidated(locations(moveId), locationSchema, onData);
}

export async function addZone(moveId: string, zone: Omit<Zone, "id" | "moveId">): Promise<Zone> {
  return createValidated(zones(moveId), zoneSchema, { ...zone, id: newId(), moveId });
}

export async function updateZone(moveId: string, next: Zone): Promise<Zone> {
  return updateValidated(zones(moveId), zoneSchema, next);
}

export function watchZones(moveId: string, onData: (z: Zone[]) => void): () => void {
  return subscribeValidated(zones(moveId), zoneSchema, onData);
}

export async function removeZone(moveId: string, zoneId: string): Promise<void> {
  await deleteDoc(doc(zones(moveId), zoneId));
}
```

### `src/repositories/containers.ts`

```ts
import {
  buildSearchText,
  containerSchema,
  nextSequenceNumber,
  toDisplayCode,
  transition,
  type Container,
  type ContainerStatus,
  type MoveMember,
  type Zone,
} from "../domain";
import { reportCondition, clearCondition, type ConditionKey } from "../domain/conditions";
import type { ConditionReport } from "../domain/schemas";
import { db } from "../lib/firebase";
import { logActivity } from "./activity";
import { createValidated, moveScoped, newId, nowIso, subscribeValidated, updateValidated } from "./shared";

const containers = (moveId: string) => moveScoped(db, moveId, "containers");

const NO_FLAGS = {
  fragile: false,
  heavy: false,
  keepUpright: false,
  doNotStack: false,
  containsLiquids: false,
  temperatureSensitive: false,
  highValue: false,
  importantDocuments: false,
} as const;

/**
 * Reserves the next number in the member's range and writes a `filling`
 * container immediately, before any other input exists. The number a person
 * writes on cardboard must never change afterward, so it is claimed first.
 *
 * `knownContainers` is the current subscription state, which the persistent
 * cache keeps complete for this member's own boxes even offline.
 */
export async function reserveContainer(
  moveId: string,
  member: MoveMember,
  knownContainers: readonly Container[],
  actorUid: string
): Promise<Container> {
  const sequenceNumber = nextSequenceNumber(member, knownContainers.map((c) => c.sequenceNumber));
  const now = nowIso();
  const created = await createValidated(containers(moveId), containerSchema, {
    id: newId(),
    moveId,
    sequenceNumber,
    displayCode: toDisplayCode(sequenceNumber),
    type: "box",
    ownerMemberId: member.id,
    status: "filling",
    unpackPriority: "normal",
    flags: { ...NO_FLAGS },
    conditions: {},
    createdAt: now,
    createdBy: actorUid,
    updatedAt: now,
    updatedBy: actorUid,
    searchText: toDisplayCode(sequenceNumber),
  });
  await logActivity(moveId, {
    containerId: created.id,
    actorId: actorUid,
    type: "container_created",
    payload: { sequenceNumber },
  });
  return created;
}

/** General edit path. Recomputes searchText so search never drifts from content. */
export async function saveContainer(
  moveId: string,
  next: Container,
  zones: readonly Zone[],
  actorUid: string
): Promise<Container> {
  const zoneName = zones.find((z) => z.id === next.destinationZoneId)?.name;
  const stamped: Container = {
    ...next,
    searchText: buildSearchText(next, zoneName),
    updatedAt: nowIso(),
    updatedBy: actorUid,
  };
  return updateValidated(containers(moveId), containerSchema, stamped);
}

export async function setStatus(
  moveId: string,
  container: Container,
  to: ContainerStatus,
  actorUid: string
): Promise<Container> {
  const { container: next, event } = transition(container, to, actorUid);
  const saved = await updateValidated(containers(moveId), containerSchema, next);
  await logActivity(moveId, event);
  return saved;
}

export async function reportContainerCondition(
  moveId: string,
  container: Container,
  key: ConditionKey,
  report: Omit<ConditionReport, "reportedAt" | "reportedBy">,
  actorUid: string
): Promise<Container> {
  const { container: next, event } = reportCondition(container, key, report, actorUid);
  const saved = await updateValidated(containers(moveId), containerSchema, next);
  await logActivity(moveId, event);
  return saved;
}

export async function clearContainerCondition(
  moveId: string,
  container: Container,
  key: ConditionKey,
  actorUid: string
): Promise<Container> {
  const { container: next, event } = clearCondition(container, key, actorUid);
  const saved = await updateValidated(containers(moveId), containerSchema, next);
  await logActivity(moveId, event);
  return saved;
}

export function watchContainers(moveId: string, onData: (c: Container[]) => void): () => void {
  return subscribeValidated(containers(moveId), containerSchema, onData);
}
```

### `src/repositories/photos.ts`

```ts
import { containerPhotoSchema, type ContainerPhoto } from "../domain/schemas";
import { db } from "../lib/firebase";
import { createValidated, moveScoped, newId, nowIso, subscribeValidated, updateValidated } from "./shared";

const photos = (moveId: string) => moveScoped(db, moveId, "photos");

/**
 * Metadata only. Image bytes never touch Firestore; they sit in Dexie until the
 * upload queue (APPLY-03) moves them to Cloud Storage. This record queues
 * offline like any other document, which is the point.
 */
export async function addPhotoRecord(
  moveId: string,
  photo: Omit<ContainerPhoto, "id" | "moveId" | "createdAt" | "uploadState" | "attempts">,
  actorUid: string
): Promise<ContainerPhoto> {
  return createValidated(photos(moveId), containerPhotoSchema, {
    ...photo,
    id: newId(),
    moveId,
    uploadState: "pending",
    attempts: 0,
    createdAt: nowIso(),
    createdBy: actorUid,
  });
}

export async function updatePhotoRecord(moveId: string, next: ContainerPhoto): Promise<ContainerPhoto> {
  return updateValidated(photos(moveId), containerPhotoSchema, next);
}

export function watchPhotos(moveId: string, onData: (p: ContainerPhoto[]) => void): () => void {
  return subscribeValidated(photos(moveId), containerPhotoSchema, onData);
}
```

### `src/repositories/activity.ts`

```ts
import { orderBy } from "firebase/firestore";
import { activityEventSchema, type ActivityEvent } from "../domain/schemas";
import { db } from "../lib/firebase";
import { createValidated, moveScoped, newId, nowIso, subscribeValidated } from "./shared";

const activity = (moveId: string) => moveScoped(db, moveId, "activity");

/** Append-only, enforced again at the rules level. Nothing edits an event. */
export async function logActivity(
  moveId: string,
  event: Omit<ActivityEvent, "id" | "moveId" | "occurredAt"> & { occurredAt?: string }
): Promise<ActivityEvent> {
  return createValidated(activity(moveId), activityEventSchema, {
    ...event,
    id: newId(),
    moveId,
    occurredAt: event.occurredAt ?? nowIso(),
  });
}

export function watchActivity(moveId: string, onData: (e: ActivityEvent[]) => void): () => void {
  return subscribeValidated(
    activity(moveId),
    activityEventSchema,
    onData,
    undefined,
    orderBy("occurredAt", "desc")
  );
}
```

### `src/repositories/index.ts`

```ts
export * from "./moves";
export * from "./members";
export * from "./zones";
export * from "./containers";
export * from "./photos";
export * from "./activity";
```

### `firestore.rules`

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

### `storage.rules`

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

### `firebase.json`

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "ui": { "enabled": true }
  }
}
```

### `firestore.indexes.json`

```json
{ "indexes": [], "fieldOverrides": [] }
```

### `.firebaserc`

```json
{
  "projects": {
    "default": "FILL_ME_PROJECT_ID"
  }
}
```

### `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Rules tests live under tests/rules and need the emulator, so the default
    // run is scoped to src. Run rules tests via `npm run test:rules` only.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
```

### `tests/rules/firestore.rules.test.ts`

```ts
/**
 * Runs only under the emulator:
 *   firebase emulators:exec --only firestore "npx vitest run tests/rules"
 * Covers the required cases from docs/10-security-rules.md.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

const MOVE = "moveA";
const NATHAN = "uid-nathan";
const SHELLY = "uid-shelly";
const STRANGER = "uid-stranger";

const NOW = "2026-08-01T18:00:00.000Z";

function containerDoc(over: Record<string, unknown> = {}) {
  return {
    moveId: MOVE,
    sequenceNumber: 42,
    displayCode: "042",
    type: "box",
    ownerMemberId: "mem-nathan",
    status: "packed",
    unpackPriority: "normal",
    flags: {},
    conditions: {},
    createdAt: NOW,
    createdBy: NATHAN,
    updatedAt: NOW,
    updatedBy: NATHAN,
    searchText: "042",
    ...over,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "move-ledger-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "moves", MOVE), {
      name: "KC to DFW",
      status: "packing",
      memberUids: [NATHAN, SHELLY],
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
});

describe("signed-out requests", () => {
  it("cannot read a move or its containers", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "moves", MOVE)));
    await assertFails(getDoc(doc(db, "moves", MOVE, "containers", "c1")));
  });
});

describe("non-members", () => {
  it("cannot read or write inside a move they do not belong to", async () => {
    const db = env.authenticatedContext(STRANGER).firestore();
    await assertFails(getDoc(doc(db, "moves", MOVE)));
    await assertFails(setDoc(doc(db, "moves", MOVE, "containers", "c1"), containerDoc({ createdBy: STRANGER })));
  });
});

describe("members and containers", () => {
  it("a member can create and read a container", async () => {
    const db = env.authenticatedContext(NATHAN).firestore();
    await assertSucceeds(setDoc(doc(db, "moves", MOVE, "containers", "c1"), containerDoc()));
    await assertSucceeds(getDoc(doc(db, "moves", MOVE, "containers", "c1")));
  });

  it("creation must carry the creator's own uid", async () => {
    const db = env.authenticatedContext(SHELLY).firestore();
    await assertFails(setDoc(doc(db, "moves", MOVE, "containers", "c1"), containerDoc({ createdBy: NATHAN })));
  });

  it("sequenceNumber is immutable after creation", async () => {
    const nathan = env.authenticatedContext(NATHAN).firestore();
    await assertSucceeds(setDoc(doc(nathan, "moves", MOVE, "containers", "c1"), containerDoc()));
    await assertFails(
      updateDoc(doc(nathan, "moves", MOVE, "containers", "c1"), { sequenceNumber: 43, updatedBy: NATHAN })
    );
  });

  it("createdBy is immutable after creation", async () => {
    const nathan = env.authenticatedContext(NATHAN).firestore();
    await assertSucceeds(setDoc(doc(nathan, "moves", MOVE, "containers", "c1"), containerDoc()));
    await assertFails(
      updateDoc(doc(nathan, "moves", MOVE, "containers", "c1"), { createdBy: SHELLY, updatedBy: NATHAN })
    );
  });

  it("updates must stamp the actor as updatedBy", async () => {
    const nathan = env.authenticatedContext(NATHAN).firestore();
    await assertSucceeds(setDoc(doc(nathan, "moves", MOVE, "containers", "c1"), containerDoc()));
    const shelly = env.authenticatedContext(SHELLY).firestore();
    await assertFails(updateDoc(doc(shelly, "moves", MOVE, "containers", "c1"), { status: "loaded", updatedBy: NATHAN }));
    await assertSucceeds(updateDoc(doc(shelly, "moves", MOVE, "containers", "c1"), { status: "loaded", updatedBy: SHELLY }));
  });
});

describe("activity is append-only", () => {
  it("allows create, refuses update and delete for everyone", async () => {
    const db = env.authenticatedContext(NATHAN).firestore();
    const event = doc(db, "moves", MOVE, "activity", "e1");
    await assertSucceeds(
      setDoc(event, { moveId: MOVE, actorId: NATHAN, type: "container_created", occurredAt: NOW, payload: {} })
    );
    await assertFails(updateDoc(event, { type: "notes_changed" }));
    await assertFails(deleteDoc(event));
  });
});

describe("move creation", () => {
  it("refuses a memberUids array that omits the creator", async () => {
    const db = env.authenticatedContext(NATHAN).firestore();
    await assertFails(
      setDoc(doc(db, "moves", "moveB"), {
        name: "Bad",
        status: "planning",
        memberUids: [SHELLY],
        createdAt: NOW,
        updatedAt: NOW,
      })
    );
    await assertSucceeds(
      setDoc(doc(db, "moves", "moveC"), {
        name: "Good",
        status: "planning",
        memberUids: [NATHAN],
        createdAt: NOW,
        updatedAt: NOW,
      })
    );
  });
});
```

### `decisions/0005-google-sign-in-two-accounts.md`

```markdown
# ADR-0005: Google sign-in and two accounts

Status: accepted
Date: 2026-08-01

## Context

The move timeline tightened. Shelly must be able to run the app alone by early October while Nathan is remote and traveling one week a month. Two questions had been left open: one account or two, and which sign-in method.

## Decision

Two Google accounts, one per household member. Google sign-in only. No email/password, no phone auth.

## Alternatives considered

**Shared single account.** Faster to ship on paper. Lost because it is not actually available: offline number reservation queries the local cache for the highest number in the signed-in member's range, so two phones on one account are one member, and both offline is the documented duplicate-number failure mode from `docs/02-domain-model.md`. Shared breaks the one hard concurrency requirement the app has.

**Email and password.** Lost on build surface. It requires a registration screen, a password reset flow, and password management for a user whose success criterion is logging boxes at 9pm without help. Google sign-in is one tap and both members already have accounts.

**Phone auth.** Lost immediately. It bills per SMS and adds nothing.

## Consequences

- The auth module is roughly forty lines. Popup flow, no redirect handling.
- The Firestore rules authorize on `memberUids` containing the caller's uid, exactly as written in `docs/10-security-rules.md`.
- Onboarding Shelly is: install the PWA, tap sign in, Nathan adds her uid to the move. That last step is a one-time action that can happen while both phones are on the same couch.
- Each member gets a disjoint number range at setup: 1 to 499 and 500 to 999.

## Revisit when

A third household member appears, which for this move means never.
```


## Step 4: fill the config

Two placeholders, both from the console walkthrough outputs:

1. `src/lib/firebase-config.ts`: paste the six values from the registered web app.
2. `.firebaserc`: replace `FILL_ME_PROJECT_ID` with the real project ID.

The app throws at startup with a clear message while any FILL_ME remains. That is intended.

## Step 5: verify what can run without the emulator

```powershell
npm run verify
```

Expected: tsc clean, 47 domain tests pass, zero rules tests picked up.

## Step 6: rules tests, first execution anywhere

Requires a JRE. `java -version` first; if absent, the portable JDK route from CLAUDE.md.

```powershell
npm run test:rules
```

Expected: 9 tests pass. If a test fails, stop and report the failure verbatim with the rule line it exercises. Do not weaken a rule to pass a test or a test to pass a rule. Doc 10 arbitrates which one is wrong.

## Step 7: deploy rules only

Nothing else deploys yet; the vertical slice UI does not exist. Shipping the rules now means the production database is locked correctly from its first minute.

```powershell
firebase deploy --only firestore:rules,storage
```

## Step 8: commit

```powershell
git add -A
git commit -m "feat(firebase): app init, Google auth, validated repositories, security rules"
```

One PR. Update doc 05's SDK version line in the same PR, per AGENTS.md.

## Design notes an agent should not re-decide

**Writes validate on the way in, reads validate on the way out.** `createValidated` and `updateValidated` refuse a document that fails its schema, which keeps Firestore and doc 02 in agreement by force. `subscribeValidated` drops and reports a bad document instead of throwing, because one corrupt record must not brick the app on both phones at once.

**`reserveContainer` writes a `filling` document before any user input exists.** The number written on cardboard must never change, so it is claimed first. This is why `filling` is a status.

**`addMember` refuses overlapping ranges at the door.** Overlap is how two boxes end up wearing the same number, and nothing downstream can repair that.

**Repositories stamp `updatedAt` and `updatedBy`; the rules then verify `updatedBy` matches the caller.** Belt in the client, suspenders in the rules.

**The Firestore web config is committed on purpose.** It identifies the project; it authorizes nothing. The secret that matters is the Anthropic key, which never appears in this repository at all.
