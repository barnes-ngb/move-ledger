import { describe, expect, it } from "vitest";
import type { ContainerPhoto } from "../schemas";
import { SUMMARY_REQUEST_LEASE_MS, isUnaskedForSummary } from "../summary";

const NOW = Date.parse("2026-10-17T12:00:00.000Z");

function photo(over: Partial<ContainerPhoto> = {}): ContainerPhoto {
  return {
    id: "p1",
    moveId: "m1",
    containerId: "c1",
    type: "contents",
    storagePath: "moves/m1/c1/p1.jpg",
    width: 1600,
    height: 1200,
    bytes: 200_000,
    uploadState: "uploaded",
    attempts: 0,
    createdAt: "2026-10-17T11:00:00.000Z",
    createdBy: "uid-1",
    ...over,
  };
}

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe("isUnaskedForSummary", () => {
  it("counts an uploaded contents photo with no state", () => {
    expect(isUnaskedForSummary(photo(), NOW)).toBe(true);
    expect(isUnaskedForSummary(photo({ summaryState: "none" }), NOW)).toBe(true);
    expect(isUnaskedForSummary(photo({ summaryState: "failed" }), NOW)).toBe(true);
  });

  it("leaves out a photo the function has settled", () => {
    expect(isUnaskedForSummary(photo({ summaryState: "done" }), NOW)).toBe(false);
    expect(isUnaskedForSummary(photo({ summaryState: "skipped" }), NOW)).toBe(false);
  });

  it("leaves out a photo that has not uploaded or is not a contents photo", () => {
    expect(isUnaskedForSummary(photo({ storagePath: undefined }), NOW)).toBe(false);
    expect(isUnaskedForSummary(photo({ type: "damage" }), NOW)).toBe(false);
  });

  it("holds a photo back while a request for it is inside the lease", () => {
    expect(isUnaskedForSummary(photo({ summaryRequestedAt: ago(10_000) }), NOW)).toBe(false);
  });

  /**
   * The page closed after the mark landed and before the call settled. No
   * answer is coming, so the photo has to come back to the ask control.
   */
  it("offers it again once the lease has run out", () => {
    expect(isUnaskedForSummary(photo({ summaryRequestedAt: ago(SUMMARY_REQUEST_LEASE_MS) }), NOW)).toBe(true);
  });
});
