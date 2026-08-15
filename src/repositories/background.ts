/**
 * Firestore write promises settle on server acknowledgment, not on the local
 * write. Offline they never settle. The local cache is updated synchronously
 * and listeners fire, so the UI has what it needs without waiting. Errors are
 * reported rather than swallowed.
 */
export function writeInBackground(work: Promise<unknown>, onError?: (e: unknown) => void): void {
  void work.catch((e) => {
    console.error("Background write failed", e);
    onError?.(e);
  });
}
