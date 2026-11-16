import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
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

/**
 * Doc 07's shape. The model is told to return exactly this and nothing else.
 *
 * One item per thing seen, since APPLY-18. An empty list is a valid answer
 * and means nothing worth listing is in the photo. Requiring at least one
 * entry left the model no honest reply to a screenshot, so it described the
 * screenshot instead, and that sentence went into the box's search text.
 * Confidence was dropped on 2026-10-17: it was written to an activity event
 * and read nowhere.
 */
const modelResponse = z.object({
  items: z.array(z.string().min(1).max(80)).max(40),
  categories: z.array(z.string()).max(6),
});

type ModelResponse = z.infer<typeof modelResponse>;

/**
 * The model is asked for bare JSON and usually obliges, but a fence or a
 * preamble is not a crash. Everything that is not a usable reply comes back as
 * null so the one caller can write `failed` and answer the client once.
 */
function readModelReply(text: string): ModelResponse | null {
  const stripped = text.replace(/```json|```/g, "").trim();
  let value: unknown;
  try {
    value = JSON.parse(stripped);
  } catch {
    return null;
  }
  const parsed = modelResponse.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Copies of `src/domain/contents.ts`, which this package cannot import: its
 * build includes `functions/src` only. Kept to the three this file needs and
 * to the same behavior, so a list the function appends to reads the same way
 * the app reads it.
 */
const ITEM_SEPARATOR = ", ";

function cleanItem(text: string): string {
  return text.trim().replace(/[.,;]+$/, "").trim();
}

/**
 * The suggested items already on the box. The stored list is trusted only
 * while it joins to the string beside it: a phone on the build before items
 * edits or clears `aiSummary` and leaves `aiItems` untouched, and a box from
 * before items has no list at all. Either way the string is split.
 */
function storedItems(items: unknown, summary: unknown): string[] {
  const text = typeof summary === "string" ? summary : "";
  if (Array.isArray(items) && items.every((i) => typeof i === "string") && items.join(ITEM_SEPARATOR) === text) {
    return items as string[];
  }
  return text
    .split(ITEM_SEPARATOR)
    .map(cleanItem)
    .filter((item) => item.length > 0);
}

/** `existing` plus each of `incoming` whose text, ignoring case, is not there yet. */
function mergeItems(existing: readonly string[], incoming: readonly string[]): string[] {
  const seen = new Set(existing.map((item) => item.toLowerCase()));
  const merged = [...existing];
  for (const raw of incoming) {
    const item = cleanItem(raw);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

export const summarizePhoto = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: "us-central1", memory: "512MiB", timeoutSeconds: 60 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

    // `returnOnly` is for Ask again. The client asks every contents photo at
    // once and replaces the suggestion only when all of them answer, so a
    // failure part way through leaves the old text standing. That cannot be
    // done if each call writes its own line as it lands, so with this set the
    // function marks the photo and hands the result back without touching the
    // box. Older clients never send it and keep the append behavior.
    const { moveId, photoId, redo, returnOnly } = z
      .object({
        moveId: z.string().min(1),
        photoId: z.string().min(1),
        redo: z.boolean().optional(),
        returnOnly: z.boolean().optional(),
      })
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
      model: "claude-sonnet-5",
      // Forty items of up to eighty characters do not fit in 400, and a reply
      // cut off at the cap fails the parse. The cap is a ceiling, not a charge.
      max_tokens: 1200,
      // Sonnet 5 thinks by default when this is omitted, and max_tokens caps
      // thinking plus reply together. Listing what is in a photo needs no
      // reasoning, and a truncated reply would fail the parse on every photo.
      thinking: { type: "disabled" },
      system:
        "You list what is visible in a photo of a partly packed moving box, one item per entry. " +
        "Someone will search this list later to find which box a thing ended up in, " +
        "and they will search for the detail they remember. So when a color, a " +
        "material, or a size is plainly visible, put it into the noun: " +
        '"white ceramic vase", "small wooden figure", "blue plastic bin". ' +
        "Do not guess at an adjective you cannot see, and do not guess at items you " +
        "cannot see. Do not describe the room, the box itself, or the packing materials. " +
        "Brand names, titles, and labels printed on objects help someone find them, so " +
        'include them: a magazine title, the brand on a product box. Text on documents, ' +
        "paperwork, mail, screens, or anything that is itself a page of writing must " +
        'never be transcribed: name the object, "a stack of papers", and stop. ' +
        "Each item is a plain noun phrase, not a sentence, with no trailing punctuation, " +
        'such as "coffee maker" or "stack of paperback books". Name each thing once. ' +
        "At most 40 items, each under 80 characters. " +
        "If no household items are visible, or the image is a screen, a document, or " +
        "not a box, reply with an empty items list and empty categories. Never describe " +
        "what the image is instead. " +
        "Categories are up to six short lowercase words for the kind of things in the " +
        'box, such as "kitchen" or "books". ' +
        "Reply with JSON only, no preamble and no code fence, matching: " +
        '{"items": string[], "categories": string[]}',
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
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");

    const reply = readModelReply(text);
    if (!reply) {
      await photoRef.update({
        summaryState: "failed",
        summaryError: "The reply could not be read.",
        summaryRequestedAt: FieldValue.delete(),
      });
      throw new HttpsError("internal", "The reply could not be read.");
    }

    // Nothing to list. The box is left exactly as it was: no items, no search
    // words. `skipped` stops the photo being sent again without a redo.
    const items = mergeItems([], reply.items);
    if (items.length === 0) {
      await photoRef.update({
        summaryState: "skipped",
        summaryError: FieldValue.delete(),
        summaryRequestedAt: FieldValue.delete(),
      });
      return { skipped: "nothing visible" };
    }
    const categories = [...new Set(reply.categories.map((c) => c.trim().toLowerCase()).filter(Boolean))];

    // The client's request mark goes with every settled state, so a photo it
    // was asked for never looks like one still waiting.
    const settled = { summaryError: FieldValue.delete(), summaryRequestedAt: FieldValue.delete() };

    if (returnOnly && redo) {
      await photoRef.update({ summaryState: "done", ...settled });
    } else {
      const containerRef = db.doc(`moves/${moveId}/containers/${photo.containerId}`);

      // Accumulate. Each contents photo appends its items, so a box packed in
      // layers ends up with all of its layers searchable rather than only the
      // bottom one, and an item a second photo sees again is not listed
      // twice. `aiSummary` is written as the joined list for the export and
      // for a phone on the build before items. A transaction because two
      // photos can finish at once. The categories join the same union, and
      // the new words go into searchText beside them so the two cannot drift.
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(containerRef);
        const data = snap.data() ?? {};
        const existing = storedItems(data.aiItems, data.aiSummary);
        const next = mergeItems(existing, items);
        const added = next.slice(existing.length);
        const existingCategories: unknown = data.aiCategories;
        const known = Array.isArray(existingCategories)
          ? existingCategories.filter((c): c is string => typeof c === "string")
          : [];
        const words = [...added, ...categories].join(" ");
        tx.update(containerRef, {
          aiItems: next,
          aiSummary: next.join(ITEM_SEPARATOR),
          aiCategories: [...new Set([...known, ...categories])],
          searchText: `${data.searchText ?? ""} ${words}`.toLowerCase().trim(),
          updatedAt: new Date().toISOString(),
        });
        tx.update(photoRef, { summaryState: "done", ...settled });
      });
    }

    await db.collection(`moves/${moveId}/activity`).add({
      moveId,
      containerId: photo.containerId,
      actorId: uid,
      type: "summary_generated",
      occurredAt: new Date().toISOString(),
      payload: { photoId, categories },
    });

    // `summary` is the same list joined, for a client on the build before
    // items, which reads nothing else from an Ask again answer.
    return { items, summary: items.join(ITEM_SEPARATOR), categories };
  }
);

/**
 * Furniture estimates from a photo. ADR-0009.
 *
 * Kept apart from the contents list on purpose: this returns its answer to the
 * phone and writes nothing to the box. The phone shows it as a suggestion and
 * a person decides whether to use it, so a guess never lands in the totals
 * without somebody looking at it first.
 */
const FURNITURE_ESTIMATE_CAP = 200;

const furnitureReply = z.object({
  name: z.string(),
  widthIn: z.number().positive().max(240),
  depthIn: z.number().positive().max(240),
  heightIn: z.number().positive().max(240),
  weightLb: z.number().positive().max(2000),
  weightLowLb: z.number().positive().max(2000),
  weightHighLb: z.number().positive().max(2000),
  scale: z.enum(["tape", "surroundings", "none"]),
  note: z.string().max(300),
});
type FurnitureReply = z.infer<typeof furnitureReply>;

function readFurnitureReply(text: string): FurnitureReply | "not furniture" | null {
  const stripped = text.replace(/```json|```/g, "").trim();
  let value: unknown;
  try {
    value = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (value && typeof value === "object" && (value as { name?: unknown }).name === "") return "not furniture";
  const parsed = furnitureReply.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const estimateFurniture = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: "us-central1", memory: "512MiB", timeoutSeconds: 120 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

    const { moveId, containerId } = z
      .object({ moveId: z.string().min(1), containerId: z.string().min(1) })
      .parse(request.data);

    const db = getFirestore();

    // The same membership and consent checks as the contents list: a callable
    // function bypasses security rules, and photos leave the phone only when
    // the move has said yes to that.
    const moveSnap = await db.doc(`moves/${moveId}`).get();
    if (!moveSnap.exists) throw new HttpsError("not-found", "No such move.");
    const move = moveSnap.data()!;
    if (!Array.isArray(move.memberUids) || !move.memberUids.includes(uid)) {
      throw new HttpsError("permission-denied", "Not a member of this move.");
    }
    if (move.aiEnabled !== true) {
      throw new HttpsError("failed-precondition", "Photo features are turned off for this move.");
    }

    const photos = await db
      .collection(`moves/${moveId}/photos`)
      .where("containerId", "==", containerId)
      .get();
    // Up to three, newest first. A tape measure is usually in a later shot.
    const uploaded = photos.docs
      .map((d) => d.data())
      .filter((p) => typeof p.storagePath === "string" && p.type !== "damage")
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 3);
    if (uploaded.length === 0) {
      throw new HttpsError("failed-precondition", "No photo of this piece has uploaded yet.");
    }

    // The cap, counted before the call so a failed reply still counts: the
    // call was made and paid for either way.
    const usageRef = db.doc(`moves/${moveId}/usage/furnitureEstimates`);
    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const count = (snap.data()?.count as number | undefined) ?? 0;
      if (count >= FURNITURE_ESTIMATE_CAP) return false;
      tx.set(usageRef, { count: count + 1 }, { merge: true });
      return true;
    });
    if (!allowed) throw new HttpsError("resource-exhausted", "This move has reached its photo estimate limit.");

    const images = await Promise.all(
      uploaded.map(async (p) => {
        const [bytes] = await getStorage().bucket().file(p.storagePath as string).download();
        return {
          type: "image" as const,
          source: { type: "base64" as const, media_type: "image/jpeg" as const, data: bytes.toString("base64") },
        };
      })
    );

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    const result = await client.messages.create({
      model: "claude-sonnet-5",
      // Thinking is left on here, unlike the contents list: judging size from
      // a photo is reasoning, and the cap below covers it and the reply.
      max_tokens: 4000,
      system:
        "You estimate the size and weight of one piece of household furniture or one appliance " +
        "from photos, so a family can tell whether their belongings fit a moving container. " +
        "Name the piece in a few plain words, such as \"6-drawer dresser\" or \"front-load washer\". " +
        "Estimate its outside width, depth, and height in inches as it stands, including handles and legs. " +
        "If a tape measure is visible, read it and use it as the scale, and say so with scale \"tape\". " +
        "Otherwise judge scale from doors, outlets, floor tiles, or other things of known size, with scale " +
        "\"surroundings\", or say \"none\" if there is nothing to judge from. " +
        "Estimate weight in pounds as it would be moved, empty of contents: judge the material from what you " +
        "can see, solid wood, particleboard, metal, or upholstery, and give a most likely figure with a low " +
        "and a high. Lean toward the high side when unsure, because the container has a hard weight limit. " +
        "The note is one short sentence saying what the estimate rests on, such as which tape reading you used. " +
        "Never transcribe text from documents or screens. " +
        "If the photos do not show a piece of furniture or an appliance, reply with {\"name\": \"\"}. " +
        "Reply with JSON only, no preamble and no code fence, matching: " +
        '{"name": string, "widthIn": number, "depthIn": number, "heightIn": number, "weightLb": number, ' +
        '"weightLowLb": number, "weightHighLb": number, "scale": "tape" | "surroundings" | "none", "note": string}',
      messages: [
        {
          role: "user",
          content: [
            ...images,
            { type: "text", text: "Estimate the size and weight of this piece." },
          ],
        },
      ],
    });

    const text = result.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    const reply = readFurnitureReply(text);
    if (reply === null) throw new HttpsError("internal", "The reply could not be read.");
    if (reply === "not furniture") return { skipped: "no furniture in the photos" };

    // Rounded to what a tape measure would read, so the suggestion does not
    // claim more precision than a photo has.
    const inch = (n: number) => Math.round(n);
    return {
      estimate: {
        name: reply.name.trim().slice(0, 80),
        widthIn: inch(reply.widthIn),
        depthIn: inch(reply.depthIn),
        heightIn: inch(reply.heightIn),
        weightLb: Math.round(reply.weightLb),
        weightLowLb: Math.round(Math.min(reply.weightLowLb, reply.weightLb)),
        weightHighLb: Math.round(Math.max(reply.weightHighLb, reply.weightLb)),
        scale: reply.scale,
        note: reply.note.trim(),
        photos: uploaded.length,
      },
    };
  }
);
