# APPLY-07: The contents summary

For Claude Code. Read the whole file before running anything. APPLY-06 is merged, so photos capture, queue, and upload.

## What this does

A callable Cloud Function holding the Anthropic key. It reads an uploaded photo from Cloud Storage, asks a vision model what is in the box, and writes the result back to the container. Then the client side: automatic triggering after upload, display as a suggestion, and accept, edit, dismiss, or redo.

This is the last feature. After it, the app is done and the remaining work is Shelly using it.

## What this does not do

No object detection, no OCR, no room suggestion, no packing warnings. Doc 07 cut all of them and they stay cut.

## This plan needs a desktop

Steps 1 through 4 cannot run from a phone. `firebase functions:secrets:set` is interactive and `firebase deploy --only functions` needs credentials the CI service account does not have, because `firebase init hosting:github` grants Hosting permissions only.

Steps 5 onward are ordinary client work and preview from the phone as usual. Stopping after step 4 leaves the repository in a working state.

## Verified against

**NOT built or run before delivery.** Fix compile errors in place and report exactly what changed.

## Governing docs, and two amendments this plan makes

`docs/07-ai-assistance.md` governs. Two of its rules are being changed, so amend the doc **first**, in this branch, before writing code.

**Amendment 1: accumulate rather than one photo per box.** Doc 07 says summarize at most one photo per box, the first contents photo. That was written when a box was one moment. Packing happens in layers: books, then linens, then a lamp. The first photo is the bottom of the box and the least representative thing in it. Every contents photo now gets one call and the results append. A box whose list reads "books, linens, lamp" is exactly the recall the scope note describes.

**Amendment 2: the cap rises.** Doc 07 set 400 against an estimate of one call per box at 300 boxes. Doc 11 assumes 600 photos. Set the cap at 800 and record the arithmetic.

Unchanged and not negotiable:

- AI suggests, the person confirms. A suggestion never becomes canonical text without a tap.
- Never process the same photo twice. Cache on `storagePath`.
- The cap is enforced in the function, not the client.
- Send the image and the zone name. Nothing else. Never the destination address.
- Both members are told once, in plain words, before the feature is enabled.
- One setting disables it for the whole move.

`docs/11-budget-and-limits.md` rule 5 matters here: the summary must be one Firestore write per photo, not one per attempt. Every write fans out to both phones' subscriptions.

## Preconditions. Stop if any fails.

1. On `main`, clean, pulled, `npm run verify` and `npm run test:rules` both green.
2. `firebase --version` works and `firebase login` is current.
3. The human has the Anthropic API key to hand. It is never pasted into this repository or into a chat.

```powershell
git checkout -b feat/contents-summary
```

## Step 1: domain fields

Three additions. These touch the domain core, so the existing tests must still pass and new ones cover the additions.

`containerPhotoSchema` gains:

```ts
  summaryState: z.enum(["none", "queued", "done", "skipped", "failed"]).optional(),
```

`none` and absent mean the same thing; absent is what existing documents have. `skipped` is what dismissal writes, and it is what prevents regeneration for that photo per doc 07.

`moveSchema` gains:

```ts
  aiEnabled: z.boolean().optional(),
```

Absent means nobody has been asked yet, which is distinct from `false`. The privacy notice keys on that distinction.

`activityEventSchema`'s type enum gains `"summary_generated"`.

## Step 2: the function

### `firebase.json`

Add alongside the existing blocks, changing nothing else:

```json
  "functions": {
    "source": "functions",
    "predeploy": ["npm --prefix functions run build"]
  },
```

### `functions/package.json`

```json
{
  "name": "move-ledger-functions",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "engines": { "node": "22" },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.65.0",
    "firebase-admin": "^13.0.0",
    "firebase-functions": "^6.0.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "typescript": "^5.9.0"
  }
}
```

Check the resolved versions after install and report any that differ by a major from these. The functions runtime is separate from the app, so its TypeScript does not have to match the app's.

### `functions/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "lib",
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### `functions/src/index.ts`

```ts
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

/**
 * Doc 07 sets a hard cap enforced here rather than in the client, because a
 * client-side cap is a suggestion. Doc 11 assumes 600 photos at 300 boxes and
 * two photos each; 800 leaves headroom without leaving room for a runaway.
 */
const MOVE_CAP = 800;

/** Doc 07's shape. The model is told to return exactly this and nothing else. */
const modelResponse = z.object({
  summary: z.string().min(1).max(400),
  categories: z.array(z.string()).max(6),
  confidence: z.number().min(0).max(1),
});

export const summarizePhoto = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: "us-central1", memory: "512MiB", timeoutSeconds: 60 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

    const { moveId, photoId, redo } = z
      .object({ moveId: z.string().min(1), photoId: z.string().min(1), redo: z.boolean().optional() })
      .parse(request.data);

    const db = getFirestore();

    // Membership is checked here with Admin credentials, because a callable
    // function bypasses security rules entirely.
    const moveRef = db.doc(`moves/${moveId}`);
    const moveSnap = await moveRef.get();
    if (!moveSnap.exists) throw new HttpsError("not-found", "No such move.");
    const move = moveSnap.data()!;
    if (!Array.isArray(move.memberUids) || !move.memberUids.includes(uid)) {
      throw new HttpsError("permission-denied", "Not a member of this move.");
    }
    if (move.aiEnabled !== true) {
      throw new HttpsError("failed-precondition", "The contents list is turned off for this move.");
    }

    const photoRef = db.doc(`moves/${moveId}/photos/${photoId}`);
    const photoSnap = await photoRef.get();
    if (!photoSnap.exists) throw new HttpsError("not-found", "No such photo.");
    const photo = photoSnap.data()!;

    if (!photo.storagePath) throw new HttpsError("failed-precondition", "That photo has not uploaded yet.");
    if (photo.type !== "contents") return { skipped: "not a contents photo" };
    if (photo.summaryState === "skipped" && !redo) return { skipped: "dismissed" };
    if (photo.summaryState === "done" && !redo) return { skipped: "already summarized" };

    // The doc 07 cost rule, keyed on storagePath. A redo is the one way past
    // it and the client states plainly that it costs another call.
    if (!redo) {
      const seen = await db
        .collection(`moves/${moveId}/photos`)
        .where("storagePath", "==", photo.storagePath)
        .where("summaryState", "==", "done")
        .limit(1)
        .get();
      if (!seen.empty) return { skipped: "this image was already summarized" };
    }

    const used = await db
      .collection(`moves/${moveId}/photos`)
      .where("summaryState", "==", "done")
      .count()
      .get();
    if (used.data().count >= MOVE_CAP) {
      throw new HttpsError("resource-exhausted", "This move has reached its contents-list limit.");
    }

    const [bytes] = await getStorage().bucket().file(photo.storagePath).download();

    // Zone name only. Doc 07 forbids sending anything else, and the
    // destination address in particular.
    let zoneName: string | undefined;
    const containerSnap = await db.doc(`moves/${moveId}/containers/${photo.containerId}`).get();
    const zoneId = containerSnap.data()?.destinationZoneId;
    if (zoneId) {
      const zoneSnap = await db.doc(`moves/${moveId}/zones/${zoneId}`).get();
      zoneName = zoneSnap.data()?.name;
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    const result = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system:
        "You list what is visible in a photo of a partly packed moving box. " +
        "The list helps someone remember later which box a thing is in, so plain " +
        "everyday nouns are better than precise ones. Do not guess at items you " +
        "cannot see. Do not describe the room, the box, or the packing materials. " +
        "Reply with JSON only, no preamble and no code fence, matching: " +
        '{"summary": string, "categories": string[], "confidence": number}',
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: bytes.toString("base64") },
            },
            {
              type: "text",
              text: zoneName
                ? `This box is going to the ${zoneName}. List what you can see in it.`
                : "List what you can see in this box.",
            },
          ],
        },
      ],
    });

    const text = result.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    const parsed = modelResponse.safeParse(JSON.parse(text));
    if (!parsed.success) {
      await photoRef.update({ summaryState: "failed" });
      throw new HttpsError("internal", "The reply could not be read.");
    }

    const containerRef = db.doc(`moves/${moveId}/containers/${photo.containerId}`);

    // Accumulate. Each contents photo appends one line, so a box packed in
    // layers ends up with all of its layers searchable rather than only the
    // bottom one. A transaction because two photos can finish at once.
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(containerRef);
      const existing: string = snap.data()?.aiSummary ?? "";
      const line = parsed.data.summary.trim();
      const next = existing ? `${existing} ${line}` : line;
      tx.update(containerRef, {
        aiSummary: next,
        searchText: `${snap.data()?.searchText ?? ""} ${line}`.toLowerCase().trim(),
        updatedAt: new Date().toISOString(),
      });
      tx.update(photoRef, { summaryState: "done" });
    });

    await db.collection(`moves/${moveId}/activity`).add({
      moveId,
      containerId: photo.containerId,
      actorId: uid,
      type: "summary_generated",
      occurredAt: new Date().toISOString(),
      payload: { photoId, confidence: parsed.data.confidence, categories: parsed.data.categories },
    });

    return { summary: parsed.data.summary };
  }
);
```

Two things to check rather than assume. The model string may have moved on; verify it against Anthropic's current model list and report what you used. The Admin SDK writes bypass security rules entirely, which is why membership is checked in code at the top, and that check is the only thing standing between a signed-in stranger and someone else's photos.

## Step 3: the secret

The human runs this. The key never enters the repository or a chat.

```powershell
firebase functions:secrets:set ANTHROPIC_API_KEY
```

## Step 4: deploy the function

```powershell
npm --prefix functions install
npm --prefix functions run build
firebase deploy --only functions
```

Report the deployed function name and region. First deploy enables required APIs and may take several minutes.

## Step 5: client wiring

### `src/lib/functions.ts`

```ts
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

const functions = getFunctions(app, "us-central1");

export const summarizePhoto = httpsCallable<
  { moveId: string; photoId: string; redo?: boolean },
  { summary?: string; skipped?: string }
>(functions, "summarizePhoto");
```

### Automatic trigger

In `src/photos/uploader.ts`, after `confirm` resolves and the blob is removed, fire the summary for a contents photo. Never await it and never let a failure disturb the upload path, which has to keep working whether or not this feature does.

The function itself decides whether to skip. The client only avoids calling when the move has AI turned off, since a call that returns `failed-precondition` is a wasted round trip.

### Privacy notice and the setting

`move.aiEnabled` is absent until someone is asked. When a move has photos and the field is absent, show a short screen, once:

> **Contents lists**
>
> Move Ledger can look at a photo of an open box and write a list of what is in it, so a search for "stapler" finds the right box later.
>
> Doing that sends the photo to Anthropic, the company that makes the model. It sends the photo and the room name, nothing else. Never your address.
>
> You can turn this off at any time under Rooms and members.
>
> `Turn it on`  `No thanks`

Both answers write the field. Add the same toggle to the Rooms and members screen so it can be changed later.

### Display, accept, edit, dismiss, redo

On box detail, when `aiSummary` is present:

- Show it under a heading that marks it as a suggestion. Doc 09 arbitrates the wording.
- **Accept** moves the text to `contentsSummary`, clears `aiSummary`, and rebuilds `searchText`.
- **Edit** opens the text for editing, and accepting the edit does the same with the edited text.
- **Dismiss** clears `aiSummary` and writes `summaryState: "skipped"` on every contents photo of that box, which is what stops regeneration.
- **Redo** calls the function with `redo: true`. It must say plainly that this asks again and costs another call. Doc 07's rule is that AI suggests and the person confirms, so redo is a deliberate act, never automatic.

All of these are Firestore writes, so they go through `writeInBackground` like everything else.

## Step 6: verify and ship

```powershell
npm run verify
npm run build
npm --prefix functions run typecheck
```

Do not deploy hosting. CI owns it. Push and open a pull request for the preview URL.

## Step 7: docs and commit

- `docs/07-ai-assistance.md`: both amendments, written before the code as instructed above.
- `plans/README.md`: the APPLY-07 row.
- `plans/STATUS.md`: the feature, the amendments, the cap arithmetic, and one new Live drift entry: deploying functions needs the desktop, because the CI service account has Hosting permissions only. Note that adding the Cloud Functions Admin role to that account would close it, and that this has not been done.

Commit, push, compare URL. Do not merge.

## What the human does after this

1. Preview URL on the phone. Turn the feature on when asked.
2. Add a box. Photograph one layer, add more, photograph again.
3. Wait. The lists arrive in the background; they are not part of packing.
4. Check that the box carries both layers rather than only the first. That is the whole reason for amendment 1.
5. Search for something visible only in the second photo. If box 042 comes back, the feature has done its entire job.
6. Check the Firebase console for function errors and the billing page for anything surprising.

Accuracy does not matter. A list reading "cables, books, a stapler, blue bin" that makes a search work is a complete success.
