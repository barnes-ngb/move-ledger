import { summarizePhoto } from "../lib/functions";
import { getPhotoRecord } from "../repositories";

/**
 * Whether this move has the contents list turned on. Held here rather than
 * read from Firestore because the uploader is not a component and has no
 * subscription of its own. `App` keeps it in step with `move.aiEnabled`.
 *
 * Absent means nobody has been asked yet, which is not consent, so the default
 * is off and stays off until someone answers the notice.
 */
let enabled = false;

export function setSummaryEnabled(next: boolean): void {
  enabled = next;
}

/**
 * Fired after an upload confirms. Never awaited by the uploader and never
 * allowed to throw into it: the packing path has to keep working whether or
 * not this feature does.
 *
 * The function decides for itself whether to skip. The two checks here exist
 * only to avoid a round trip that is certain to come back refused: a move with
 * the feature off, and a photo that is not a contents photo.
 */
export async function requestSummary(moveId: string, photoId: string): Promise<void> {
  if (!enabled) return;
  try {
    const photo = await getPhotoRecord(moveId, photoId);
    if (!photo || photo.type !== "contents") return;
    await summarizePhoto({ moveId, photoId });
  } catch (e) {
    // A failed summary is not a failed upload. The photo is in Cloud Storage
    // and the box is intact; the list is the only thing missing.
    console.error("Contents list request failed", e);
  }
}
