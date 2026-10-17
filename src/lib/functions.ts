import { getFunctions, httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { app } from "./firebase";

export interface SummarizeRequest {
  moveId: string;
  photoId: string;
  redo?: boolean;
  /** With `redo`: mark the photo and return the result without writing to the box. */
  returnOnly?: boolean;
}

export interface SummarizeResponse {
  /** One entry per thing seen. Absent from a function deployed before APPLY-18. */
  items?: string[];
  /** The items joined with ", ", or the old single-string reply from a function before items. */
  summary?: string;
  categories?: string[];
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
