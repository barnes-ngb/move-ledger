# APPLY-04: Move subscriptions and first-run setup

For Claude Code. Read the whole file before running anything. APPLY-03 is merged and deployed.

## What this does

Puts a configured move behind the auth gate. Subscriptions for move, members, places, and rooms. A first-run flow that creates all of it. The path that adds the second member by uid, which is the onboarding step `decisions/0005-google-sign-in-two-accounts.md` describes and nothing has implemented.

Also pins Hosting cache headers so an update actually reaches an installed phone.

## What this does not do

No Add box, no Find, no box detail. Those are APPLY-05 and they are the point of the whole app, so do not start them here. No photos. No Move Day.

## Verified against

**NOT built or run before delivery.** Same standing as APPLY-03. Fix compile errors in place and report exactly what changed. A behavior change is still a conversation.

## The undefined hazard

Read this before writing any code.

`updateValidated` in `src/repositories/shared.ts` spreads the parsed object into `updateDoc`. Firestore throws on a field whose value is explicitly `undefined`. `moveSchema` has two optional fields and `containerSchema` has eight, so `{ ...move, destinationZoneId: maybeUndefined }` compiles cleanly and fails at runtime.

Rule for this file and every file after it: never write an optional field as explicit `undefined`. Build the object with a conditional spread instead.

```ts
const next: Move = {
  ...move,
  ...(originId ? { originLocationId: originId } : {}),
};
```

## Governing docs

- `docs/09-glossary.md` is the arbiter for every user-facing string. Code says Zone and Location. The interface says Room and Place.
- `docs/04-screen-specifications.md` for layout and touch target rules.
- `decisions/0005-google-sign-in-two-accounts.md` for ranges and onboarding.

## Preconditions. Stop if any fails.

1. On `main`, clean, pulled, `npm run verify` green.
2. `src/ui/Account.tsx` exists from APPLY-03.

```powershell
git checkout -b feat/first-run-setup
```

## Step 1: Hosting cache headers

In `firebase.json`, inside the `hosting` object, add alongside `rewrites`:

```json
"headers": [
  {
    "source": "/assets/**",
    "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
  },
  {
    "source": "/@(index.html|sw.js|registerSW.js|manifest.webmanifest)",
    "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
  }
]
```

Asset filenames carry a content hash, so they are safe to cache forever. The entry files are how the app discovers there is a new version, so they must revalidate. Without this an installed phone can sit on an old build indefinitely.

## Step 2: write these files

### `src/lib/palette.ts`

```ts
/**
 * Fixed palette. colorName is written on cardboard with a marker, so it must
 * be one uppercase word a person can read at arm's length in a dim garage.
 * colorValue never appears on a physical box. See docs/09-glossary.md.
 */
export interface PaletteEntry {
  name: string;
  value: string;
}

export const PALETTE: readonly PaletteEntry[] = [
  { name: "BLUE", value: "#2563c9" },
  { name: "RED", value: "#dc2626" },
  { name: "GREEN", value: "#16a34a" },
  { name: "ORANGE", value: "#ea580c" },
  { name: "PURPLE", value: "#7c3aed" },
  { name: "YELLOW", value: "#ca8a04" },
  { name: "PINK", value: "#db2777" },
  { name: "BLACK", value: "#334155" },
];

/** Three letters, uppercase, for the compact room chip. */
export function shortCodeFor(roomName: string): string {
  const letters = roomName.replace(/[^A-Za-z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "ROO").padEnd(3, "X");
}
```

### `src/hooks/useMove.ts`

```ts
import { useEffect, useState } from "react";
import type { Location, Move, MoveMember, Zone } from "../domain";
import { watchLocations, watchMembers, watchMoves, watchZones } from "../repositories";

export interface MoveContext {
  loading: boolean;
  move: Move | null;
  members: MoveMember[];
  zones: Zone[];
  locations: Location[];
  /** The signed-in user's own member record. Null until setup creates it. */
  me: MoveMember | null;
}

/**
 * One subscription set for the whole app. The persistent cache serves these
 * from disk on a cold start, so a phone in a garage with no signal shows real
 * data rather than a spinner.
 */
export function useMove(uid: string): MoveContext {
  const [move, setMove] = useState<Move | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MoveMember[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    return watchMoves(uid, (moves) => {
      setMove(moves[0] ?? null);
      setLoading(false);
    });
  }, [uid]);

  useEffect(() => {
    if (!move) {
      setMembers([]);
      setZones([]);
      setLocations([]);
      return;
    }
    const stop = [
      watchMembers(move.id, setMembers),
      watchZones(move.id, setZones),
      watchLocations(move.id, setLocations),
    ];
    return () => stop.forEach((fn) => fn());
  }, [move?.id]);

  return {
    loading,
    move,
    members,
    zones,
    locations,
    me: members.find((m) => m.uid === uid) ?? null,
  };
}
```

### `src/ui/kit.tsx`

```tsx
import type { ReactNode } from "react";

/**
 * Shared primitives. Every touch target is at least 56px tall, per
 * docs/04-screen-specifications.md, because these are used one-handed while
 * holding something else.
 */
export function Button({
  children,
  onClick,
  disabled,
  tone = "primary",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "quiet";
}) {
  const base = "min-h-14 w-full rounded-2xl px-5 text-lg font-semibold disabled:opacity-50";
  const skin = tone === "primary" ? "bg-sky-500 text-slate-950" : "bg-slate-700 text-slate-100";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${skin}`}>
      {children}
    </button>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="mt-1 min-h-14 w-full rounded-xl bg-slate-800 px-4 text-lg text-slate-100 placeholder:text-slate-500"
      />
    </label>
  );
}

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 p-6">
      <h2 className="text-2xl font-semibold text-slate-100">{title}</h2>
      {children}
    </div>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  return message ? <p className="text-sm text-amber-300">{message}</p> : null;
}
```

### `src/ui/setup/CreateMove.tsx`

```tsx
import { useState } from "react";
import type { User } from "firebase/auth";
import { addLocation, addMember, createMove, updateMove } from "../../repositories";
import { Button, ErrorLine, Field, Screen } from "../kit";

/**
 * Creates everything a move needs to exist: the move, both places, and the
 * creator's own member record holding numbers 1 to 499. The second member is
 * added later, on the Members screen, because her uid does not exist yet.
 */
export function CreateMove({ user }: { user: User }) {
  const [name, setName] = useState("KC to DFW");
  const [origin, setOrigin] = useState("Kansas City");
  const [destination, setDestination] = useState("DFW");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const move = await createMove(name.trim(), user.uid);
      const from = await addLocation(move.id, { name: origin.trim(), type: "home" });
      const to = await addLocation(move.id, { name: destination.trim(), type: "home" });
      // Conditional spread rather than explicit undefined. See the hazard note.
      await updateMove({ ...move, originLocationId: from.id, destinationLocationId: to.id });
      await addMember(
        move.id,
        {
          uid: user.uid,
          displayName: user.displayName ?? "Me",
          role: "owner",
          numberRangeStart: 1,
          numberRangeEnd: 499,
        },
        []
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the move.");
      setBusy(false);
    }
  }

  const ready = name.trim() && origin.trim() && destination.trim();

  return (
    <Screen title="Set up the move">
      <Field label="Name" value={name} onChange={setName} autoFocus />
      <Field label="Moving from" value={origin} onChange={setOrigin} />
      <Field label="Moving to" value={destination} onChange={setDestination} />
      <ErrorLine message={error} />
      <Button onClick={() => void create()} disabled={busy || !ready}>
        {busy ? "Creating" : "Create the move"}
      </Button>
      <p className="text-sm text-slate-400">
        Your boxes will be numbered 1 to 499. The second person gets 500 to 999, so two phones can
        number boxes at the same time without a collision.
      </p>
    </Screen>
  );
}
```

### `src/ui/setup/Rooms.tsx`

```tsx
import { useState } from "react";
import type { Move, Zone } from "../../domain";
import { addZone } from "../../repositories";
import { PALETTE, shortCodeFor } from "../../lib/palette";
import { Button, ErrorLine, Field, Screen } from "../kit";

/**
 * Rooms at the destination. Colour is chosen here because it is written on
 * the box by hand, so it is a naming decision rather than a styling one.
 */
export function Rooms({ move, zones, onDone }: { move: Move; zones: Zone[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const locationId = move.destinationLocationId;
  const taken = new Set(zones.map((z) => z.colorName));
  const nextColor = PALETTE.find((p) => !taken.has(p.name)) ?? PALETTE[0]!;

  async function add() {
    if (!locationId) {
      setError("The destination place is missing. This is a setup bug, not something you did.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addZone(move.id, {
        locationId,
        name: name.trim(),
        shortCode: shortCodeFor(name),
        colorName: nextColor.name,
        colorValue: nextColor.value,
        sortOrder: zones.length,
      });
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the room.");
    }
    setBusy(false);
  }

  return (
    <Screen title="Rooms at the new place">
      <ul className="flex flex-col gap-2">
        {zones.map((z) => (
          <li key={z.id} className="flex items-center gap-3 rounded-xl bg-slate-800 p-3">
            <span className="size-6 rounded-full" style={{ backgroundColor: z.colorValue }} />
            <span className="flex-1 text-slate-100">{z.name}</span>
            <span className="font-mono text-sm text-slate-400">{z.colorName}</span>
          </li>
        ))}
      </ul>

      <Field label="Add a room" value={name} onChange={setName} placeholder="Kitchen" />
      <p className="text-sm text-slate-400">
        Next colour: <span style={{ color: nextColor.value }}>{nextColor.name}</span>
      </p>
      <ErrorLine message={error} />
      <Button onClick={() => void add()} disabled={busy || !name.trim()} tone="quiet">
        Add room
      </Button>
      <Button onClick={onDone} disabled={zones.length === 0}>
        Done, {zones.length} room{zones.length === 1 ? "" : "s"}
      </Button>
    </Screen>
  );
}
```

### `src/ui/setup/Members.tsx`

```tsx
import { useState } from "react";
import type { Move, MoveMember } from "../../domain";
import { addMember, updateMove } from "../../repositories";
import { Button, ErrorLine, Field, Screen } from "../kit";

/**
 * The couch step from ADR-0005. The second person installs the app, signs in,
 * and reads her account id off her own screen. It is added here once and never
 * again.
 */
export function Members({
  move,
  members,
  onDone,
}: {
  move: Move;
  members: MoveMember[];
  onDone: () => void;
}) {
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const trimmed = uid.trim();
      if (members.some((m) => m.uid === trimmed)) throw new Error("That person is already on the move.");
      // memberUids first, so her device can read the move the moment it syncs.
      await updateMove({ ...move, memberUids: [...move.memberUids, trimmed] });
      await addMember(
        move.id,
        {
          uid: trimmed,
          displayName: name.trim(),
          role: "member",
          numberRangeStart: 500,
          numberRangeEnd: 999,
        },
        members
      );
      setUid("");
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that person.");
    }
    setBusy(false);
  }

  return (
    <Screen title="Who else is packing">
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.id} className="rounded-xl bg-slate-800 p-3">
            <p className="text-slate-100">{m.displayName}</p>
            <p className="text-sm text-slate-400">
              Boxes {m.numberRangeStart} to {m.numberRangeEnd}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-sm text-slate-400">
        On her phone: install the app, sign in, then read the account id off her own screen.
      </p>
      <Field label="Her name" value={name} onChange={setName} placeholder="Shelly" />
      <Field label="Her account id" value={uid} onChange={setUid} />
      <ErrorLine message={error} />
      <Button onClick={() => void add()} disabled={busy || !uid.trim() || !name.trim()} tone="quiet">
        Add her
      </Button>
      <Button onClick={onDone}>Done</Button>
    </Screen>
  );
}
```

### `src/ui/setup/Setup.tsx`

```tsx
import { useState } from "react";
import type { User } from "firebase/auth";
import type { MoveContext } from "../../hooks/useMove";
import { CreateMove } from "./CreateMove";
import { Members } from "./Members";
import { Rooms } from "./Rooms";

/**
 * Stage is derived from data rather than held in state wherever possible, so
 * a refresh mid-setup resumes where it left off instead of starting over.
 */
export function Setup({ user, ctx, onFinished }: { user: User; ctx: MoveContext; onFinished: () => void }) {
  const [stage, setStage] = useState<"rooms" | "members">("rooms");

  if (!ctx.move || !ctx.me) return <CreateMove user={user} />;
  if (stage === "rooms") {
    return <Rooms move={ctx.move} zones={ctx.zones} onDone={() => setStage("members")} />;
  }
  return <Members move={ctx.move} members={ctx.members} onDone={onFinished} />;
}
```

### `src/ui/WaitingForInvite.tsx`

```tsx
import { useState } from "react";
import type { User } from "firebase/auth";
import { signOut } from "../auth";
import { Screen } from "./kit";

/**
 * Shown to a signed-in person who belongs to no move. Creating a second move
 * is deliberately not offered here: for this household there is exactly one,
 * and an accidental second one is a confusing mess to unpick.
 */
export function WaitingForInvite({ user }: { user: User }) {
  const [copied, setCopied] = useState(false);

  return (
    <Screen title="Almost there">
      <p className="text-slate-300">Read this id to the person who set up the move.</p>
      <p className="break-all rounded-lg bg-slate-800 p-3 font-mono text-sm text-slate-200">{user.uid}</p>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(user.uid);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="min-h-14 rounded-xl bg-slate-700 px-5 font-medium text-slate-100"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <p className="text-sm text-slate-400">Once you are added, this screen becomes the move.</p>
      <button onClick={() => void signOut()} className="min-h-12 self-start text-slate-400 underline">
        Sign out
      </button>
    </Screen>
  );
}
```

### `src/ui/Home.tsx`

```tsx
import type { MoveContext } from "../hooks/useMove";
import { Screen } from "./kit";

/** Placeholder. APPLY-05 replaces this with Add box and Find. */
export function Home({ ctx, onSetup }: { ctx: MoveContext; onSetup: () => void }) {
  return (
    <Screen title={ctx.move?.name ?? "Move"}>
      <ul className="flex flex-col gap-2">
        {ctx.zones.map((z) => (
          <li key={z.id} className="flex items-center gap-3 rounded-xl bg-slate-800 p-3">
            <span className="size-6 rounded-full" style={{ backgroundColor: z.colorValue }} />
            <span className="flex-1 text-slate-100">{z.name}</span>
            <span className="font-mono text-sm text-slate-400">{z.colorName}</span>
          </li>
        ))}
      </ul>
      <p className="text-slate-300">
        {ctx.members.length} member{ctx.members.length === 1 ? "" : "s"}
        {ctx.me ? `, your boxes are ${ctx.me.numberRangeStart} to ${ctx.me.numberRangeEnd}` : ""}.
      </p>
      <p className="text-sm text-slate-400">Adding and finding boxes arrives in the next build.</p>
      <button onClick={onSetup} className="min-h-12 self-start text-slate-400 underline">
        Rooms and members
      </button>
    </Screen>
  );
}
```

### `src/App.tsx`

Replace it.

```tsx
import { useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { useMove } from "./hooks/useMove";
import type { User } from "firebase/auth";
import { Home } from "./ui/Home";
import { SignIn } from "./ui/SignIn";
import { SyncIndicator } from "./ui/SyncIndicator";
import { Setup } from "./ui/setup/Setup";
import { WaitingForInvite } from "./ui/WaitingForInvite";

function SignedIn({ user }: { user: User }) {
  const ctx = useMove(user.uid);
  const [setupOpen, setSetupOpen] = useState(false);

  if (ctx.loading) return <div className="flex min-h-full items-center justify-center text-slate-500">Loading</div>;

  // No move at all: either this is the first person, or the second person is
  // waiting to be added. The two are indistinguishable from the client, so the
  // first-run screen is offered and the waiting screen is reachable from it.
  if (!ctx.move) return <FirstRun user={user} ctx={ctx} />;
  if (!ctx.me) return <WaitingForInvite user={user} />;
  if (setupOpen || ctx.zones.length === 0) {
    return <Setup user={user} ctx={ctx} onFinished={() => setSetupOpen(false)} />;
  }
  return <Home ctx={ctx} onSetup={() => setSetupOpen(true)} />;
}

function FirstRun({ user, ctx }: { user: User; ctx: ReturnType<typeof useMove> }) {
  const [waiting, setWaiting] = useState(false);
  if (waiting) return <WaitingForInvite user={user} />;
  return (
    <div>
      <Setup user={user} ctx={ctx} onFinished={() => undefined} />
      <div className="px-6 pb-8">
        <button onClick={() => setWaiting(true)} className="text-slate-400 underline">
          Someone else set up the move
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const auth = useAuth();

  return (
    <div
      className="flex h-full flex-col bg-slate-900 text-slate-100"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <span className="font-semibold">Move Ledger</span>
        {auth.status === "signedIn" ? <SyncIndicator /> : null}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {auth.status === "loading" ? (
          <div className="flex min-h-full items-center justify-center text-slate-500">Loading</div>
        ) : auth.status === "signedOut" ? (
          <SignIn />
        ) : (
          <SignedIn user={auth.user} />
        )}
      </main>
    </div>
  );
}
```

`src/ui/Account.tsx` is no longer reachable. Leave the file. `noUnusedLocals` applies to locals, not to unexported modules, so it will not break the build, and APPLY-05 gives it a home on a settings screen.

## Step 3: verify, build, deploy

```powershell
npm run verify
npm run build
firebase deploy --only hosting
```

Domain tests stay at 47.

## Step 4: commit

```powershell
git add -A
git commit -m "feat(setup): move subscriptions, first-run flow, member onboarding"
```

Push, give the compare URL, do not merge.

## Step 5: docs, same branch

- `plans/README.md`: add the APPLY-04 row.
- `plans/STATUS.md`: record the `updateDoc` undefined hazard under Known drift, since it will recur through APPLY-05. Record the cache headers. Note that Add box and Find are APPLY-05.

## What the human does after this

1. On your phone, run the first-run flow. Create the move, add three or four real rooms.
2. On the second phone, sign in and tap "Someone else set up the move". Read the id.
3. On your phone, open Rooms and members, add her.
4. Watch her screen change from waiting to the move without a reload. That is the proof that the rules, the `memberUids` update, and the subscriptions all agree.
5. Airplane mode on both, reopen, confirm the rooms are still listed from the cache.

Step 4 is the real test. If her screen does not change, the likely cause is the `watchMoves` filter or the move update rule, and it comes back here rather than getting patched on the device.
