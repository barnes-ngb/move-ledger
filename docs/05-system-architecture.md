# System Architecture

## Shape

Installable PWA talking directly to Firebase. No server of our own. No Docker at any point.

```text
Phone PWA
├── React UI
├── src/domain          number reservation, transitions, export
├── src/repositories    the only code that touches Firestore
├── Firestore SDK       local cache, offline write queue
├── IndexedDB           photo blobs awaiting upload
└── Photo uploader      drains IndexedDB to Cloud Storage
        │
        ▼
Firebase
├── Auth (Google)
├── Firestore
├── Cloud Storage
└── Hosting
```

Cloud Functions are not used in Phase 1 or Phase 2. If AI summaries are built in Phase 3, one callable function is added so the API key never ships to the client.

## Stack

### Frontend

- React 18, TypeScript strict, Vite
- React Router
- Zustand for UI state only
- Zod for every persisted shape
- Firebase JS SDK v12 modular
- `vite-plugin-pwa` for the service worker and install prompt
- Dexie for the photo blob store

No TanStack Query. Firestore's `onSnapshot` already provides caching, invalidation, and reactivity. Adding a second cache layer over it creates two sources of truth.

### Testing

- Vitest and React Testing Library for domain logic and components
- `@firebase/rules-unit-testing` for security rules
- Playwright for the Phase 1 vertical slice, run against the emulator

## Offline strategy

Firestore's persistent local cache does the heavy work.

```ts
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
```

What this gives without any code from us:

- Reads served from cache when offline
- Writes queued on disk and replayed on reconnect, surviving app restart
- `onSnapshot` firing immediately from cache with `metadata.hasPendingWrites`
- Last-write-wins per field on the server

What it does not give:

- A write promise you can wait on. `setDoc` and `updateDoc` apply to the local cache synchronously and fire listeners, but the promise they return settles when the server acknowledges the write. Offline it never settles. Awaiting one for interface progress leaves a screen waiting for a network the app is designed to work without. This was live in every screen until 2026-08-15; `plans/STATUS.md` records what it cost.

  The repository layer answers it. `createValidated` and `updateValidated` are synchronous and return `{ value, written }`: the parsed document, and a promise that settles on the server's acknowledgment. Interface code reads `value` and passes `written` to `writeInBackground`, which reports a failure rather than swallowing it. The only caller that awaits `written` is the photo uploader, which must not delete a local blob until Firestore has confirmed the metadata update.
- Photo bytes. Cloud Storage uploads do not queue offline and do not survive a page reload. That gap is the entire subject of `docs/06-photo-upload-queue.md`.
- Conflict review. Two people editing the same box field while offline resolves to whoever syncs last. For a two-person household move that is acceptable and is a recorded decision, not an oversight.

## Layer boundaries

### UI

Renders, captures intent, shows state. Does not generate numbers, does not call Firestore, does not interpret AI output.

### Domain (`src/domain`)

Pure functions, no Firebase imports, fully unit testable.

- `numbers.ts` next number from a member range
- `status.ts` legal transitions and the resulting activity event
- `search.ts` `searchText` construction and matching
- `export.ts` JSON and CSV shaping
- `schemas/` Zod schemas mirroring `docs/02-domain-model.md`

### Repositories (`src/repositories`)

The only files importing `firebase/firestore`. One module per collection. Every write validates through its Zod schema first and stamps `updatedAt` and `updatedBy`.

### Photo pipeline (`src/photos`)

Capture, client-side resize, Dexie write, upload queue, retry. See doc 06.

## Repository layout

Single app. No monorepo, no workspaces. A personal tool does not need package boundaries.

```text
move-ledger/
├── src/
│   ├── app/              routes, providers, shell
│   ├── domain/
│   │   └── schemas/
│   ├── repositories/
│   ├── photos/
│   ├── features/
│   │   ├── setup/
│   │   ├── zones/
│   │   ├── boxes/
│   │   ├── search/
│   │   └── move-day/
│   ├── components/
│   └── lib/firebase.ts
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── firebase.json
├── tests/
│   ├── domain/
│   ├── rules/
│   └── e2e/
├── docs/
├── decisions/
├── AGENTS.md
├── CLAUDE.md
└── README.md
```

## Local development

PowerShell, no Docker, no admin.

```powershell
npm install
npm i -g firebase-tools
firebase login
npm run dev
```

Emulators need a Java runtime. If `java -version` fails, extract a portable JDK under `$HOME\tools\jdk` and set it for the session:

```powershell
$env:JAVA_HOME = "$HOME\tools\jdk"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
firebase emulators:start
```

If getting a JDK in place proves annoying, develop against a second Firebase project used as a scratch environment. Rules tests still need the emulator, so it is worth doing once.

## Deployment

`firebase deploy --only hosting,firestore:rules,storage`. Hosting free tier covers this at 10 GB storage and 360 MB per day of transfer.
