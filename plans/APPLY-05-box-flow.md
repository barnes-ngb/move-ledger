# APPLY-05: The box flow

For Claude Code. Read the whole file before running anything. APPLY-04 is merged and deployed.

This is the August 24 gate. Everything before it was foundation.

## What this does

Add box, Find, and box detail. The twenty-second loop and the ten-second lookup, which are the only two numbers this project is measured by.

Also splits the Firebase bundle and adds a render environment so components can be tested at all.

## What this does not do

No photos, no contents list, no Move Day, no text search across notes. Find is by number only. Those are APPLY-06 and later.

## Verified against

**NOT built or run before delivery.** Fix compile errors in place and report exactly what changed. A behavior change is a conversation.

## Read these before writing code

**The undefined write hazard.** `containerSchema` has eight optional fields and this file writes most of them. An explicit `undefined` compiles, parses through Zod, then throws at `updateDoc`. Always conditional spread:

```ts
const next: Container = {
  ...container,
  ...(roomId ? { destinationZoneId: roomId } : {}),
};
```

**`nowIso` is not exported from `src/repositories/index.ts`.** It lives in `shared.ts`, which the barrel does not re-export. Use `new Date().toISOString()` in UI code.

**The glossary is the arbiter.** Room, Place, box, box number, member. Never Zone, Location, Container, or sequenceNumber in a string a person reads.

## Governing docs

- `docs/03-user-flows.md` flow 3 for the add loop, including what "Save and next" does.
- `docs/04-screen-specifications.md` for the number appearing before any input, the keyboard never covering the primary action, and the 56px minimum target.
- `docs/09-glossary.md` for every user-facing word.

## Preconditions. Stop if any fails.

1. On `main`, clean, pulled, `npm run verify` green at 47 tests.
2. `plans/README.md` numbering table lists APPLY-05 as the box flow.

```powershell
git checkout -b feat/box-flow
```

## Step 1: dependencies

```powershell
npm install -D jsdom @testing-library/react @testing-library/dom
```

## Step 2: split the bundle

In `vite.config.ts`, add a `build` key alongside `plugins`:

```ts
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/@firebase") || id.includes("node_modules/firebase")) {
            return "firebase";
          }
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) {
            return "react";
          }
          return undefined;
        },
      },
    },
  },
```

Honest about what this buys. It does not reduce total bytes. It lets the browser fetch three files in parallel instead of one, and it keeps the Firebase chunk's hash stable across deploys, so an app update re-downloads the small application chunk rather than 266 kB. The first load on cellular improves modestly. The second and every later update improves a lot.

## Step 3: render environment

Replace `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom rather than node, so components can render. Domain tests are
    // environment-agnostic and pass either way. Rules tests are excluded
    // here and run under the emulator via `npm run test:rules`.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
  },
});
```

## Step 4: fix the spelling

In `src/ui/setup/Rooms.tsx`, change the user-facing string "Next colour:" to "Next color:". The repository writes color everywhere else.

## Step 5: write these files

### `src/hooks/useContainers.ts`

```ts
import { useEffect, useState } from "react";
import type { Container } from "../domain";
import { watchContainers } from "../repositories";

/**
 * Separate from useMove because containers are the only collection that grows
 * without bound. The persistent cache holds them all, which is what makes
 * number reservation and Find work with no signal.
 */
export function useContainers(moveId: string | null): Container[] {
  const [containers, setContainers] = useState<Container[]>([]);
  useEffect(() => {
    if (!moveId) {
      setContainers([]);
      return;
    }
    return watchContainers(moveId, setContainers);
  }, [moveId]);
  return containers;
}
```

### `src/ui/box/keypad.ts`

```ts
/** Four digits is past the top of any range this move will use. */
export const MAX_DIGITS = 4;

export function appendDigit(typed: string, digit: string): string {
  if (!/^[0-9]$/.test(digit)) return typed;
  if (typed.length >= MAX_DIGITS) return typed;
  // A leading zero is how the number is written on the box, not how it is
  // typed. Someone reaching for 042 types 4 then 2.
  if (typed === "" && digit === "0") return typed;
  return typed + digit;
}

export function deleteDigit(typed: string): string {
  return typed.slice(0, -1);
}
```

### `src/ui/box/label.ts`

```ts
/**
 * The block a person reads while holding a marker. Doc 09 calls this the
 * label instruction. Number first, because that is what gets written first
 * and it exists before a room has been chosen.
 */
export function labelInstruction(displayCode: string, colorName?: string): string {
  return colorName ? `${displayCode}  ${colorName}` : displayCode;
}
```

### `src/ui/box/RoomPicker.tsx`

```tsx
import type { Zone } from "../../domain";

/**
 * Colour chips rather than a select. The colour is what gets written on the
 * box, so choosing it is the point rather than decoration.
 */
export function RoomPicker({
  zones,
  selectedId,
  onSelect,
}: {
  zones: readonly Zone[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {zones.map((z) => {
        const on = z.id === selectedId;
        return (
          <button
            key={z.id}
            onClick={() => onSelect(z.id)}
            className={
              "flex min-h-16 items-center gap-3 rounded-2xl px-4 text-left text-lg " +
              (on ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-100")
            }
          >
            <span className="size-6 shrink-0 rounded-full" style={{ backgroundColor: z.colorValue }} />
            <span className="truncate">{z.name}</span>
          </button>
        );
      })}
    </div>
  );
}
```

### `src/ui/box/AddBox.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import type { Container, MoveMember, Zone } from "../../domain";
import { RangeExhaustedError, remainingInRange } from "../../domain";
import { reserveContainer, saveContainer, setStatus } from "../../repositories";
import { Button, ErrorLine, Field } from "../kit";
import { RoomPicker } from "./RoomPicker";
import { labelInstruction } from "./label";

/**
 * The twenty-second loop.
 *
 * The number is reserved on mount, before any input exists, because it is
 * written on cardboard with a marker and must never change afterward. That is
 * why `filling` is a status: a box record exists from the moment its number
 * is claimed.
 */
export function AddBox({
  moveId,
  me,
  containers,
  zones,
  uid,
  onClose,
}: {
  moveId: string;
  me: MoveMember;
  containers: readonly Container[];
  zones: readonly Zone[];
  uid: string;
  onClose: () => void;
}) {
  const [container, setContainer] = useState<Container | null>(null);
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // StrictMode runs effects twice in development. Without this guard the dev
  // build burns a box number on every mount, and burned numbers never refill.
  const reserving = useRef(false);

  async function reserve() {
    if (reserving.current) return;
    reserving.current = true;
    setError(null);
    try {
      const next = await reserveContainer(moveId, me, containers, uid);
      setContainer(next);
    } catch (e) {
      setError(
        e instanceof RangeExhaustedError
          ? "Your box numbers are used up. Tell the other person before you keep packing."
          : "Could not reserve a number. Check the connection."
      );
    }
    reserving.current = false;
  }

  useEffect(() => {
    void reserve();
    // Reserve exactly once per mount of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(andNext: boolean) {
    if (!container) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = note.trim();
      // Conditional spread. An explicit undefined here throws at the write.
      const next: Container = {
        ...container,
        ...(roomId ? { destinationZoneId: roomId } : {}),
        ...(trimmed ? { notes: trimmed } : {}),
        labelConfirmedAt: new Date().toISOString(),
      };
      const saved = await saveContainer(moveId, next, zones, uid);
      await setStatus(moveId, saved, "packed", uid);

      if (andNext) {
        setContainer(null);
        setRoomId(undefined);
        setNote("");
        await reserve();
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the box.");
    }
    setBusy(false);
  }

  const room = zones.find((z) => z.id === roomId);
  const left = remainingInRange(me, containers.map((c) => c.sequenceNumber));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        {/* The label instruction. Written before anything else is decided. */}
        <div className="rounded-3xl bg-slate-800 p-6 text-center">
          <p className="text-sm text-slate-400">Write on the box</p>
          <p className="mt-2 font-mono text-6xl font-bold tracking-wider text-slate-50">
            {container ? container.displayCode : "..."}
          </p>
          {room ? (
            <p className="mt-2 text-2xl font-semibold" style={{ color: room.colorValue }}>
              {room.colorName}
            </p>
          ) : (
            <p className="mt-2 text-slate-500">Pick a room for the color</p>
          )}
          <span className="sr-only">
            {container ? labelInstruction(container.displayCode, room?.colorName) : ""}
          </span>
        </div>

        {left <= 25 ? (
          <p className="mt-4 text-sm text-amber-300">{left} box numbers left in your range.</p>
        ) : null}

        <div className="mt-6">
          <RoomPicker zones={zones} selectedId={roomId} onSelect={setRoomId} />
        </div>

        <div className="mt-6">
          <Field label="Note, optional" value={note} onChange={setNote} placeholder="kettle and mugs" />
        </div>

        <ErrorLine message={error} />
      </div>

      {/* Pinned below the scroll area so the keyboard never covers it. */}
      <div className="flex flex-col gap-3 border-t border-slate-800 p-4">
        <Button onClick={() => void save(true)} disabled={busy || !container}>
          Save and next
        </Button>
        <Button onClick={() => void save(false)} disabled={busy || !container} tone="quiet">
          Save and finish
        </Button>
      </div>
    </div>
  );
}
```

### `src/ui/box/FindBox.tsx`

```tsx
import { useEffect, useState } from "react";
import type { Container, Zone } from "../../domain";
import { findByNumber } from "../../domain";
import { appendDigit, deleteDigit } from "./keypad";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

/**
 * The ten-second lookup. A keypad rather than a text field, because the app
 * is used standing up and a numeric keyboard on a text input is smaller and
 * slower. Opens the box outright the moment one match remains.
 */
export function FindBox({
  containers,
  zones,
  onOpen,
}: {
  containers: readonly Container[];
  zones: readonly Zone[];
  onOpen: (c: Container) => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = findByNumber(containers, typed);

  useEffect(() => {
    if (typed.length > 0 && matches.length === 1) onOpen(matches[0]!);
  }, [typed, matches.length]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="p-6 text-center">
        <p className="font-mono text-5xl tracking-widest text-slate-50">{typed || "\u00a0"}</p>
        <p className="mt-2 text-sm text-slate-400">
          {typed ? `${matches.length} box${matches.length === 1 ? "" : "es"}` : "Type the number on the box"}
        </p>
      </div>

      <ul className="flex-1 overflow-y-auto px-6">
        {matches.slice(0, 12).map((c) => {
          const zone = zones.find((z) => z.id === c.destinationZoneId);
          return (
            <li key={c.id}>
              <button
                onClick={() => onOpen(c)}
                className="flex min-h-16 w-full items-center gap-4 border-b border-slate-800 text-left"
              >
                <span className="font-mono text-2xl text-slate-100">{c.displayCode}</span>
                {zone ? (
                  <span className="size-5 rounded-full" style={{ backgroundColor: zone.colorValue }} />
                ) : null}
                <span className="flex-1 truncate text-slate-300">{zone?.name ?? "No room"}</span>
                <span className="text-sm text-slate-500">{c.status}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-3 gap-2 border-t border-slate-800 p-3">
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              onClick={() => setTyped(k === "back" ? deleteDigit(typed) : appendDigit(typed, k))}
              className="min-h-16 rounded-2xl bg-slate-800 text-2xl font-semibold text-slate-100"
            >
              {k === "back" ? "\u232b" : k}
            </button>
          )
        )}
      </div>
    </div>
  );
}
```

### `src/ui/box/BoxDetail.tsx`

```tsx
import { useState } from "react";
import type { Container, Zone } from "../../domain";
import { nextStatuses } from "../../domain";
import { saveContainer, setStatus } from "../../repositories";
import { Button, ErrorLine, Field } from "../kit";
import { RoomPicker } from "./RoomPicker";

/**
 * Detail and correction. Backward status moves are allowed because
 * corrections happen on move day, and a system that refuses them gets worked
 * around with a marker and a lie.
 */
export function BoxDetail({
  moveId,
  container,
  zones,
  uid,
  onClose,
}: {
  moveId: string;
  container: Container;
  zones: readonly Zone[];
  uid: string;
  onClose: () => void;
}) {
  const [note, setNote] = useState(container.notes ?? "");
  const [editingRoom, setEditingRoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zone = zones.find((z) => z.id === container.destinationZoneId);
  const forward = nextStatuses(container.status);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
    setBusy(false);
  }

  function saveField(patch: Partial<Container>) {
    return run(async () => {
      await saveContainer(moveId, { ...container, ...patch }, zones, uid);
    });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <span className="font-mono text-5xl font-bold text-slate-50">{container.displayCode}</span>
        {zone ? (
          <span className="flex items-center gap-2">
            <span className="size-6 rounded-full" style={{ backgroundColor: zone.colorValue }} />
            <span className="text-xl text-slate-200">{zone.name}</span>
          </span>
        ) : (
          <span className="text-slate-500">No room</span>
        )}
      </div>

      <div>
        <p className="text-sm text-slate-400">Status</p>
        <p className="text-xl text-slate-100">{container.status}</p>
        <div className="mt-3 flex flex-col gap-2">
          {forward.map((s) => (
            <Button
              key={s}
              onClick={() => void run(() => setStatus(moveId, container, s, uid))}
              disabled={busy}
              tone="quiet"
            >
              Mark {s}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Field label="Note" value={note} onChange={setNote} />
        <div className="mt-3">
          <Button
            onClick={() => void saveField(note.trim() ? { notes: note.trim() } : {})}
            disabled={busy || note === (container.notes ?? "")}
            tone="quiet"
          >
            Save note
          </Button>
        </div>
      </div>

      {editingRoom ? (
        <RoomPicker
          zones={zones}
          selectedId={container.destinationZoneId}
          onSelect={(id) => {
            setEditingRoom(false);
            void saveField({ destinationZoneId: id });
          }}
        />
      ) : (
        <Button onClick={() => setEditingRoom(true)} disabled={busy} tone="quiet">
          Change room
        </Button>
      )}

      <ErrorLine message={error} />
      <Button onClick={onClose}>Done</Button>
    </div>
  );
}
```

### `src/ui/Home.tsx`

Replace it.

```tsx
import { useState } from "react";
import type { Container } from "../domain";
import type { MoveContext } from "../hooks/useMove";
import { useContainers } from "../hooks/useContainers";
import { AddBox } from "./box/AddBox";
import { BoxDetail } from "./box/BoxDetail";
import { FindBox } from "./box/FindBox";
import { Button, Screen } from "./kit";

type View = { name: "home" } | { name: "add" } | { name: "find" } | { name: "detail"; id: string };

export function Home({ ctx, uid, onSetup }: { ctx: MoveContext; uid: string; onSetup: () => void }) {
  const [view, setView] = useState<View>({ name: "home" });
  const containers = useContainers(ctx.move?.id ?? null);

  if (!ctx.move || !ctx.me) return null;
  const moveId = ctx.move.id;

  if (view.name === "add") {
    return (
      <AddBox
        moveId={moveId}
        me={ctx.me}
        containers={containers}
        zones={ctx.zones}
        uid={uid}
        onClose={() => setView({ name: "home" })}
      />
    );
  }

  if (view.name === "find") {
    return (
      <FindBox
        containers={containers}
        zones={ctx.zones}
        onOpen={(c) => setView({ name: "detail", id: c.id })}
      />
    );
  }

  if (view.name === "detail") {
    const found = containers.find((c) => c.id === view.id);
    if (!found) return <Screen title="That box is gone">{null}</Screen>;
    return (
      <BoxDetail
        moveId={moveId}
        container={found as Container}
        zones={ctx.zones}
        uid={uid}
        onClose={() => setView({ name: "find" })}
      />
    );
  }

  const mine = containers.filter((c) => c.ownerMemberId === ctx.me!.id).length;

  return (
    <div className="flex min-h-full flex-col justify-between p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-slate-100">{ctx.move.name}</h2>
        <p className="text-slate-400">
          {containers.length} box{containers.length === 1 ? "" : "es"}, {mine} of them yours.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Button onClick={() => setView({ name: "add" })}>Add a box</Button>
        <Button onClick={() => setView({ name: "find" })} tone="quiet">
          Find a box
        </Button>
        <button onClick={onSetup} className="min-h-12 text-slate-400 underline">
          Rooms and members
        </button>
      </div>
    </div>
  );
}
```

### `src/App.tsx`

One change. `Home` now needs the uid:

```tsx
  return <Home ctx={ctx} uid={user.uid} onSetup={() => setSetupOpen(true)} />;
```

### `src/ui/box/__tests__/keypad.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { appendDigit, deleteDigit } from "../keypad";

describe("appendDigit", () => {
  it("builds a number as digits are typed", () => {
    expect(appendDigit(appendDigit("", "4"), "2")).toBe("42");
  });

  it("refuses a leading zero, because 042 is typed as 42", () => {
    expect(appendDigit("", "0")).toBe("");
    expect(appendDigit("4", "0")).toBe("40");
  });

  it("ignores anything that is not a digit", () => {
    expect(appendDigit("4", "x")).toBe("4");
  });

  it("stops at four digits", () => {
    expect(appendDigit("1234", "5")).toBe("1234");
  });
});

describe("deleteDigit", () => {
  it("removes the last digit and survives an empty string", () => {
    expect(deleteDigit("42")).toBe("4");
    expect(deleteDigit("")).toBe("");
  });
});
```

### `src/ui/box/__tests__/label.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { labelInstruction } from "../label";

describe("labelInstruction", () => {
  it("shows the number alone before a room is chosen", () => {
    expect(labelInstruction("042")).toBe("042");
  });

  it("adds the color name once there is one", () => {
    expect(labelInstruction("042", "BLUE")).toBe("042  BLUE");
  });
});
```

### `src/ui/box/__tests__/FindBox.test.tsx`

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FindBox } from "../FindBox";
import type { Container, Zone } from "../../../domain";

const NOW = "2026-08-02T12:00:00.000Z";

function box(over: Partial<Container>): Container {
  return {
    id: "c1",
    moveId: "m1",
    sequenceNumber: 42,
    displayCode: "042",
    type: "box",
    ownerMemberId: "mem1",
    status: "packed",
    unpackPriority: "normal",
    flags: {
      fragile: false,
      heavy: false,
      keepUpright: false,
      doNotStack: false,
      containsLiquids: false,
      temperatureSensitive: false,
      highValue: false,
      importantDocuments: false,
    },
    conditions: {},
    createdAt: NOW,
    createdBy: "mem1",
    updatedAt: NOW,
    updatedBy: "mem1",
    searchText: "",
    ...over,
  };
}

const zones: Zone[] = [];

describe("FindBox", () => {
  it("narrows as digits are typed", () => {
    const boxes = [
      box({ id: "a", sequenceNumber: 4, displayCode: "004" }),
      box({ id: "b", sequenceNumber: 42, displayCode: "042" }),
      box({ id: "c", sequenceNumber: 43, displayCode: "043" }),
    ];
    render(<FindBox containers={boxes} zones={zones} onOpen={() => undefined} />);
    fireEvent.click(screen.getByText("4"));
    expect(screen.getByText("3 boxes")).toBeDefined();
  });

  it("opens the box outright once one match remains", () => {
    const onOpen = vi.fn();
    const boxes = [
      box({ id: "a", sequenceNumber: 4, displayCode: "004" }),
      box({ id: "b", sequenceNumber: 42, displayCode: "042" }),
    ];
    render(<FindBox containers={boxes} zones={zones} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("4"));
    fireEvent.click(screen.getByText("2"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]?.[0]?.id).toBe("b");
  });
});
```

## Step 6: verify, build, deploy

```powershell
npm run verify
npm run build
firebase deploy --only hosting
```

Expect 47 domain tests plus the new ones, all passing. Report the chunk sizes from the build so the split can be judged against the 895 kB single chunk it replaces.

## Step 7: commit and docs

```powershell
git add -A
git commit -m "feat(boxes): add, find, and edit a box"
```

Same branch:

- `plans/README.md`: add the APPLY-05 run row.
- `plans/STATUS.md`: move the box flow to done, close the bundle and component-test entries under Live drift, record the resulting chunk sizes, and mark sequence step 7 done.

Push, give the compare URL, do not merge.

## What the human does after this

This is the gate, so measure it rather than eyeballing it.

1. Add ten boxes with a timer running. Record seconds per box. The target is under 20, and "Save and next" is what makes that possible.
2. Find three of them by number. Target is under 10 seconds each.
3. Airplane mode, add three more boxes, confirm the numbers keep climbing without duplicating. Turn the network back on and confirm they appear on the other phone.
4. If both numbers hold, the August 24 gate is met.

Point three is the one that would hurt to get wrong, because a duplicate number cannot be repaired after a marker has touched cardboard.
