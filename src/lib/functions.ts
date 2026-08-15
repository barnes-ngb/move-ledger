import { getFunctions, httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { app } from "./firebase";

export interface SummarizeRequest {
  moveId: string;
  photoId: string;
  redo?: boolean;
}

export interface SummarizeResponse {
  summary?: string;
  skipped?: string;
}

let callable: ((data: SummarizeRequest) => Promise<HttpsCallableResult<SummarizeResponse>>) | null = null;

/**
 * The callable is built on first use rather than at module load.
 *
 * `getFunctions` initializes a Firebase SDK component, and the uploader
 * imports this file, so building it at load time pulled the Functions SDK into
 * every path that touches the upload queue. A move that never turns contents
 * lists on should never load it at all.
 */
export function summarizePhoto(
  data: SummarizeRequest
): Promise<HttpsCallableResult<SummarizeResponse>> {
  callable ??= httpsCallable<SummarizeRequest, SummarizeResponse>(
    getFunctions(app, "us-central1"),
    "summarizePhoto"
  );
  return callable(data);
}
