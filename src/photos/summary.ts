import { summarizePhoto, type SummarizeResponse } from "../lib/functions";
import {
  getPhotoRecord,
  isSummaryEnabled,
  markSummaryFailed,
  markSummaryRequested,
} from "../repositories";

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * A call that threw is recorded as `failed`, unless the photo has settled in
 * the meantime. Another phone may have asked for the same photo and got its
 * answer, and overwriting that `done` would let the next ask pay again.
 */
async function markFailedUnlessSettled(moveId: string, photoId: string, error: string): Promise<void> {
  const current = await getPhotoRecord(moveId, photoId);
  if (current?.summaryState === "done" || current?.summaryState === "skipped") return;
  await markSummaryFailed(moveId, photoId, error);
}

/**
 * One call for one photo, with the client's marks on either side of it: the
 * request time before, `failed` and the reason if the call throws. The
 * function writes `done` and `skipped` itself. Throws, so a screen can say
 * what went wrong; the uploader goes through `requestSummary`, which never
 * does.
 *
 * Neither mark is awaited. They are separate fields from the ones the
 * function settles, so the order they land in does not matter, and a write
 * promise offline never settles.
 */
export async function askForSummary(
  moveId: string,
  photoId: string,
  options: { redo?: boolean; returnOnly?: boolean } = {}
): Promise<SummarizeResponse> {
  void markSummaryRequested(moveId, photoId).catch((e) =>
    console.error("Could not mark the photo requested", e)
  );

  try {
    const result = await summarizePhoto({ moveId, photoId, ...options });
    return result.data;
  } catch (e) {
    void markFailedUnlessSettled(moveId, photoId, messageOf(e)).catch((err) =>
      console.error("Could not mark the photo failed", err)
    );
    throw e;
  }
}

/**
 * Fired after an upload confirms. Never awaited by the uploader and never
 * allowed to throw into it: the packing path has to keep working whether or
 * not this feature does.
 *
 * Whether the move has the feature on is read from the move document, cache
 * first, at the moment of asking. It used to be a module flag that `App` set
 * from the move subscription, and the uploader starts before that effect has
 * run, so a photo confirmed in that window was never summarized and nothing
 * ever asked for it again. Reading the document keeps the uploader free of
 * React and has no window to fall into.
 *
 * The function decides for itself whether to skip. The two checks here exist
 * only to avoid a round trip that is certain to come back refused: a move with
 * the feature off, and a photo that is not a contents photo.
 */
export async function requestSummary(moveId: string, photoId: string): Promise<void> {
  try {
    if (!(await isSummaryEnabled(moveId))) return;
    const photo = await getPhotoRecord(moveId, photoId);
    if (!photo || photo.type !== "contents") return;
    await askForSummary(moveId, photoId);
  } catch (e) {
    // A failed summary is not a failed upload. The photo is in Cloud Storage
    // and the box is intact; the list is the only thing missing, and the
    // photo is marked `failed` so box detail can offer to ask again.
    console.error("Contents list request failed", e);
  }
}
