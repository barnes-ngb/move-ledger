import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The callable and the photo repository are both replaced, because what is
 * asserted here is which calls this module decides to make. Doc 07's cost
 * rules are enforced in the function, not here; these tests cover the two
 * round trips the client can know in advance are pointless.
 */
const summarizePhoto = vi.fn(async () => ({ data: { summary: "a lamp" } }));
const getPhotoRecord = vi.fn();

vi.mock("../../lib/functions", () => ({ summarizePhoto }));
vi.mock("../../repositories", () => ({ getPhotoRecord }));

const { requestSummary, setSummaryEnabled } = await import("../summary");

function photo(over: Record<string, unknown> = {}) {
  return { id: "p1", moveId: "m1", containerId: "c1", type: "contents", ...over };
}

describe("requestSummary", () => {
  beforeEach(() => {
    summarizePhoto.mockClear();
    getPhotoRecord.mockReset();
    setSummaryEnabled(false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sends nothing while the move has not turned the feature on", async () => {
    getPhotoRecord.mockResolvedValue(photo());

    await requestSummary("m1", "p1");

    // Absent means unasked, and unasked is not consent. A photo of someone's
    // home must not leave the device on a default.
    expect(summarizePhoto).not.toHaveBeenCalled();
  });

  it("sends a contents photo once the feature is on", async () => {
    setSummaryEnabled(true);
    getPhotoRecord.mockResolvedValue(photo());

    await requestSummary("m1", "p1");

    expect(summarizePhoto).toHaveBeenCalledWith({ moveId: "m1", photoId: "p1" });
  });

  it("skips a photo that is not a contents photo", async () => {
    setSummaryEnabled(true);
    getPhotoRecord.mockResolvedValue(photo({ type: "damage" }));

    await requestSummary("m1", "p1");

    expect(summarizePhoto).not.toHaveBeenCalled();
  });

  it("swallows a failed call so the upload path is never disturbed", async () => {
    setSummaryEnabled(true);
    getPhotoRecord.mockResolvedValue(photo());
    summarizePhoto.mockRejectedValueOnce(new Error("unauthenticated"));

    await expect(requestSummary("m1", "p1")).resolves.toBeUndefined();
  });
});
