import type { ContainerPhoto } from "./schemas";

/**
 * How long a request mark keeps a photo off the ask control. The function's
 * own timeout is 60 seconds, so a mark older than this belongs to a call that
 * is not coming back: the page was closed, or the phone died, before it
 * settled. Past it, the photo is offered again rather than stranded.
 */
export const SUMMARY_REQUEST_LEASE_MS = 2 * 60_000;

/**
 * Whether a photo uploaded and never got a contents list, so box detail
 * should offer to write one.
 *
 * `summaryState` is the function's to settle. The client's mark lives in
 * `summaryRequestedAt` instead, because a phone writing a transient state
 * into that field could overwrite another phone's `done` or `skipped` and
 * take down the function's guards against paying for the same image twice.
 */
export function isUnaskedForSummary(photo: ContainerPhoto, nowMs: number): boolean {
  if (photo.type !== "contents" || photo.storagePath === undefined) return false;
  const state = photo.summaryState;
  if (state !== undefined && state !== "none" && state !== "failed") return false;
  if (!photo.summaryRequestedAt) return true;
  return nowMs - Date.parse(photo.summaryRequestedAt) >= SUMMARY_REQUEST_LEASE_MS;
}
