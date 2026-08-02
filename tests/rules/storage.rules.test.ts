/**
 * Runs only under the emulator:
 *   firebase emulators:exec --only firestore,storage "npx vitest run tests/rules"
 * Covers doc 10 cases 8 and 9 plus the read and write authorization paths in storage.rules.
 * The Storage rules call into Firestore for membership, so the Firestore emulator
 * has to be running alongside the Storage emulator. This file therefore runs on a
 * different project id than firestore.rules.test.ts, which clears Firestore in its
 * own beforeEach while vitest runs the two files in parallel.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getMetadata, ref, uploadBytes } from "firebase/storage";
import type { FirebaseStorage } from "firebase/storage";

let env: RulesTestEnvironment;

/**
 * The Storage emulator resolves `firestore.get` in storage.rules against the
 * project the CLI is running as, not against the test environment's project id.
 * Seed membership under that same project or every member check reads null.
 */
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? "move-ledger";

const MOVE = "moveA";
const GHOST_MOVE = "moveGhost";
const CONTAINER = "c1";
const NATHAN = "uid-nathan";
const SHELLY = "uid-shelly";
const STRANGER = "uid-stranger";

const NOW = "2026-08-01T18:00:00.000Z";

const PHOTO = `moves/${MOVE}/${CONTAINER}/photo.jpg`;
const TWO_MB = 2 * 1024 * 1024;

const IMAGE = { contentType: "image/jpeg" };

function bytes(size: number) {
  return new Uint8Array(size);
}

function photoRef(storage: FirebaseStorage, path = PHOTO) {
  return ref(storage, path);
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
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

async function seedPhoto() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(photoRef(ctx.storage()), bytes(64), IMAGE);
  });
}

describe("storage reads", () => {
  it("a member can read a photo in their move", async () => {
    await seedPhoto();
    const storage = env.authenticatedContext(SHELLY).storage();
    await assertSucceeds(getMetadata(photoRef(storage)));
  });

  it("a signed-out request is denied", async () => {
    await seedPhoto();
    const storage = env.unauthenticatedContext().storage();
    await assertFails(getMetadata(photoRef(storage)));
  });

  it("a signed-in non-member is denied", async () => {
    await seedPhoto();
    const storage = env.authenticatedContext(STRANGER).storage();
    await assertFails(getMetadata(photoRef(storage)));
  });

  it("a read under a move that does not exist is denied", async () => {
    const storage = env.authenticatedContext(NATHAN).storage();
    await assertFails(getMetadata(photoRef(storage, `moves/${GHOST_MOVE}/${CONTAINER}/photo.jpg`)));
  });
});

describe("storage writes", () => {
  it("a member can write an image under the ceiling", async () => {
    const storage = env.authenticatedContext(NATHAN).storage();
    await assertSucceeds(uploadBytes(photoRef(storage), bytes(256 * 1024), IMAGE));
  });

  it("a signed-out write is denied", async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(uploadBytes(photoRef(storage), bytes(64), IMAGE));
  });

  it("a signed-in non-member write is denied", async () => {
    const storage = env.authenticatedContext(STRANGER).storage();
    await assertFails(uploadBytes(photoRef(storage), bytes(64), IMAGE));
  });

  it("a write under a move that does not exist is denied", async () => {
    const storage = env.authenticatedContext(NATHAN).storage();
    await assertFails(
      uploadBytes(photoRef(storage, `moves/${GHOST_MOVE}/${CONTAINER}/photo.jpg`), bytes(64), IMAGE)
    );
  });

  it("a write outside moves/{moveId}/{containerId}/{fileName} is denied", async () => {
    const storage = env.authenticatedContext(NATHAN).storage();
    await assertFails(uploadBytes(photoRef(storage, "scratch/photo.jpg"), bytes(64), IMAGE));
    await assertFails(
      uploadBytes(photoRef(storage, `moves/${MOVE}/${CONTAINER}/nested/photo.jpg`), bytes(64), IMAGE)
    );
  });

  // Doc 10, required case 8.
  it("a write above 2 MB is denied", async () => {
    const storage = env.authenticatedContext(NATHAN).storage();
    await assertFails(uploadBytes(photoRef(storage), bytes(TWO_MB + 1), IMAGE));
    await assertFails(uploadBytes(photoRef(storage), bytes(TWO_MB), IMAGE));
  });

  // Doc 10, required case 9.
  it("a write with a non-image content type is denied", async () => {
    const storage = env.authenticatedContext(NATHAN).storage();
    await assertFails(
      uploadBytes(photoRef(storage, `moves/${MOVE}/${CONTAINER}/notes.pdf`), bytes(64), {
        contentType: "application/pdf",
      })
    );
    await assertFails(
      uploadBytes(photoRef(storage, `moves/${MOVE}/${CONTAINER}/notes.txt`), bytes(64), {
        contentType: "text/plain",
      })
    );
  });
});
