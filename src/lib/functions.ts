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

/** What `estimateFurniture` hands back. A suggestion: the phone shows it and a person decides. ADR-0009. */
export interface FurnitureEstimate {
  name: string;
  widthIn: number;
  depthIn: number;
  heightIn: number;
  weightLb: number;
  weightLowLb: number;
  weightHighLb: number;
  /** What the size was judged from. "tape" means a tape measure was read in the photo. */
  scale: "tape" | "surroundings" | "none";
  note: string;
  /** How many photos it looked at. */
  photos: number;
}

export interface EstimateFurnitureResponse {
  estimate?: FurnitureEstimate;
  skipped?: string;
}

let estimateCallable:
  | ((data: { moveId: string; containerId: string }) => Promise<HttpsCallableResult<EstimateFurnitureResponse>>)
  | null = null;

/** Built on first use, for the reason `summarizePhoto` gives. */
export function estimateFurniture(data: {
  moveId: string;
  containerId: string;
}): Promise<HttpsCallableResult<EstimateFurnitureResponse>> {
  estimateCallable ??= httpsCallable<{ moveId: string; containerId: string }, EstimateFurnitureResponse>(
    getFunctions(app, "us-central1"),
    "estimateFurniture"
  );
  return estimateCallable(data);
}
