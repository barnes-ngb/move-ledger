/**
 * Runs only under the emulator:
 *   firebase emulators:exec --only firestore "npx vitest run tests/rules"
 * Covers the required cases from docs/10-security-rules.md.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  where,
} from "firebase/firestore";

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

/**
 * These are list queries, not document gets. They are the shape watchMoves
 * actually sends: collection("moves") filtered on memberUids array-contains.
 */
describe("the moves list query", () => {
  function myMoves(db: ReturnType<ReturnType<typeof env.authenticatedContext>["firestore"]>, uid: string) {
    return getDocs(query(collection(db, "moves"), where("memberUids", "array-contains", uid)));
  }

  it("succeeds against an empty moves collection", async () => {
    await env.clearFirestore();
    const db = env.authenticatedContext(NATHAN).firestore();
    await assertSucceeds(myMoves(db, NATHAN));
  });

  it("succeeds and returns the move the caller belongs to", async () => {
    const db = env.authenticatedContext(NATHAN).firestore();
    const snap = await assertSucceeds(myMoves(db, NATHAN));
    expect(snap.docs.map((d) => d.id)).toEqual([MOVE]);
  });

  it("succeeds and returns nothing when the caller belongs to no move", async () => {
    const db = env.authenticatedContext(STRANGER).firestore();
    const snap = await assertSucceeds(myMoves(db, STRANGER));
    expect(snap.empty).toBe(true);
  });

  it("refuses an unfiltered list of every move", async () => {
    const db = env.authenticatedContext(NATHAN).firestore();
    await assertFails(getDocs(collection(db, "moves")));
  });
});

/**
 * The shape useMove actually sends. watchMembers, watchZones and watchLocations
 * each open an unfiltered list query on a subcollection of /moves/{moveId}.
 * A suite built from getDoc never evaluates the list path on these rules.
 */
describe("subcollection list queries", () => {
  const SUBS = ["members", "zones", "locations", "containers", "photos", "activity"] as const;

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore();
      for (const sub of SUBS) {
        await setDoc(doc(fs, "moves", MOVE, sub, `${sub}-1`), { moveId: MOVE, seeded: true });
      }
    });
  });

  for (const sub of SUBS) {
    it(`a member can list ${sub}`, async () => {
      const db = env.authenticatedContext(NATHAN).firestore();
      const snap = await assertSucceeds(getDocs(collection(db, "moves", MOVE, sub)));
      expect(snap.docs.map((d) => d.id)).toEqual([`${sub}-1`]);
    });

    it(`a non-member cannot list ${sub}`, async () => {
      const db = env.authenticatedContext(STRANGER).firestore();
      await assertFails(getDocs(collection(db, "moves", MOVE, sub)));
    });

    // The state actually reported: a move exists and nothing has been added to
    // it yet, so all three listeners open on an empty collection.
    it(`a member can list ${sub} when the collection is empty`, async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await deleteDoc(doc(ctx.firestore(), "moves", MOVE, sub, `${sub}-1`));
      });
      const db = env.authenticatedContext(NATHAN).firestore();
      const snap = await assertSucceeds(getDocs(collection(db, "moves", MOVE, sub)));
      expect(snap.empty).toBe(true);
    });
  }
});

/**
 * Diagnostic, not a rule requirement. isMember() resolves membership with a
 * get() on the parent move. If that document is not on the server yet, the
 * get() returns null and every subcollection listener under it is denied at
 * once, which is the same symptom as a broken list rule and is not one.
 */
describe("a subcollection of a move the server does not have", () => {
  it("denies every subcollection listener at once", async () => {
    const db = env.authenticatedContext(NATHAN).firestore();
    for (const sub of ["members", "zones", "locations"]) {
      await assertFails(getDocs(collection(db, "moves", "not-on-server", sub)));
    }
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
