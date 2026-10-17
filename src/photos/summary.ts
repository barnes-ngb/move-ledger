import { summarizePhoto, type SummarizeResponse } from "../lib/functions";
import { getPhotoRecord, isSummaryEnabled, setSummaryState } from "../repositories";

/**
 * How long the `queued` mark is given to reach the server before the call goes
 * out anyway. The wait exists so the function's own `done` cannot land first
 * and then be overwritten by a late `queued`; a model call takes seconds, so a
 * short head start is enough. It is bounded because a write promise offline
 * never settles, and nothing in this app waits on the network open-ended.
 */
const QUEUED_HEAD_START_MS = 3_000;

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * One call for one photo, with its state written on either side of it:
 * `queued` before, `failed` and the reason if the call throws. The function
 * writes `done` and `skipped` itself. Throws, so a screen can say what went
 * wrong; the uploader goes through `requestSummary`, which never does.
 */
export async function askForSummary(
  moveId: string,
  photoId: string,
  options: { redo?: boolean; returnOnly?: boolean } = {}
): Promise<SummarizeResponse> {
  const queued = setSummaryState(moveId, photoId, "queued").catch((e) =>
    console.error("Could not mark the photo queued", e)
  );
  await Promise.race([queued, new Promise((resolve) => setTimeout(resolve, QUEUED_HEAD_START_MS))]);

  try {
    const result = await summarizePhoto({ moveId, photoId, ...options });
    return result.data;
  } catch (e) {
    // Not awaited: the caller wants the error now, and the mark queues
    // offline like every other write.
    void setSummaryState(moveId, photoId, "failed", messageOf(e)).catch((err) =>
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
