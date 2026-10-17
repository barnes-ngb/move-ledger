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
 * An empty summary is a valid answer and means nothing worth listing is in
 * the photo. Requiring at least one character left the model no honest reply
 * to a screenshot, so it described the screenshot instead, and that sentence
 * went into the box's search text. Confidence was dropped on 2026-10-17: it
 * was written to an activity event and read nowhere.
 */
const modelResponse = z.object({
  summary: z.string().max(400),
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
      max_tokens: 400,
      // Sonnet 5 thinks by default when this is omitted, and max_tokens caps
      // thinking plus reply together. Listing what is in a photo needs no
      // reasoning, and a truncated reply would fail the parse on every photo.
      thinking: { type: "disabled" },
      system:
        "You list what is visible in a photo of a partly packed moving box. " +
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
        "If no household items are visible, or the image is a screen, a document, or " +
        'not a box, reply with an empty summary "" and empty categories. Never describe ' +
        "what the image is instead. " +
        "Categories are up to six short lowercase words for the kind of things in the " +
        'box, such as "kitchen" or "books". ' +
        "Keep the summary under 400 characters. " +
        "Reply with JSON only, no preamble and no code fence, matching: " +
        '{"summary": string, "categories": string[]}',
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
      await photoRef.update({ summaryState: "failed", summaryError: "The reply could not be read." });
      throw new HttpsError("internal", "The reply could not be read.");
    }

    // Nothing to list. The box is left exactly as it was: no line, no search
    // words. `skipped` stops the photo being sent again without a redo.
    const line = reply.summary.trim();
    if (!line) {
      await photoRef.update({ summaryState: "skipped", summaryError: FieldValue.delete() });
      return { skipped: "nothing visible" };
    }
    const categories = [...new Set(reply.categories.map((c) => c.trim().toLowerCase()).filter(Boolean))];

    if (returnOnly && redo) {
      await photoRef.update({ summaryState: "done", summaryError: FieldValue.delete() });
    } else {
      const containerRef = db.doc(`moves/${moveId}/containers/${photo.containerId}`);

      // Accumulate. Each contents photo appends one line, so a box packed in
      // layers ends up with all of its layers searchable rather than only the
      // bottom one. A transaction because two photos can finish at once. The
      // categories join the same union, and their words go into searchText
      // beside the line so the two cannot drift apart.
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(containerRef);
        const existing: string = snap.data()?.aiSummary ?? "";
        const existingCategories: unknown = snap.data()?.aiCategories;
        const known = Array.isArray(existingCategories)
          ? existingCategories.filter((c): c is string => typeof c === "string")
          : [];
        const next = existing ? `${existing} ${line}` : line;
        const words = [line, ...categories].join(" ");
        tx.update(containerRef, {
          aiSummary: next,
          aiCategories: [...new Set([...known, ...categories])],
          searchText: `${snap.data()?.searchText ?? ""} ${words}`.toLowerCase().trim(),
          updatedAt: new Date().toISOString(),
        });
        tx.update(photoRef, { summaryState: "done", summaryError: FieldValue.delete() });
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

    return { summary: line, categories };
  }
);
