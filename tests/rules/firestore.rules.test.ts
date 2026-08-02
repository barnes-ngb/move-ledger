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
