import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The callable and the repositories are both replaced, because what is
 * asserted here is which calls and which state writes this module decides to
 * make. Doc 07's cost rules are enforced in the function, not here; these
 * tests cover the two round trips the client can know in advance are
 * pointless, and the marks it leaves on a photo either side of a call.
 */
const summarizePhoto = vi.fn(async (_data: unknown) => ({ data: { summary: "a lamp" } as Record<string, unknown> }));
const getPhotoRecord = vi.fn();
const isSummaryEnabled = vi.fn(async (_moveId: string) => false);
const setSummaryState = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock("../../lib/functions", () => ({ summarizePhoto }));
vi.mock("../../repositories", () => ({ getPhotoRecord, isSummaryEnabled, setSummaryState }));

const { askForSummary, requestSummary } = await import("../summary");

function photo(over: Record<string, unknown> = {}) {
  return { id: "p1", moveId: "m1", containerId: "c1", type: "contents", ...over };
}

beforeEach(() => {
  summarizePhoto.mockClear();
  getPhotoRecord.mockReset();
  isSummaryEnabled.mockReset();
  isSummaryEnabled.mockResolvedValue(false);
  setSummaryState.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("requestSummary", () => {
  it("sends nothing while the move has not turned the feature on", async () => {
    getPhotoRecord.mockResolvedValue(photo());

    await requestSummary("m1", "p1");

    // Absent means unasked, and unasked is not consent. A photo of someone's
    // home must not leave the device on a default.
    expect(summarizePhoto).not.toHaveBeenCalled();
    expect(setSummaryState).not.toHaveBeenCalled();
  });

  it("sends a contents photo once the feature is on", async () => {
    isSummaryEnabled.mockResolvedValue(true);
    getPhotoRecord.mockResolvedValue(photo());

    await requestSummary("m1", "p1");

    expect(summarizePhoto).toHaveBeenCalledWith({ moveId: "m1", photoId: "p1" });
  });

  /**
   * The enabled race. The setting used to be a module flag `App` set from the
   * move subscription, and the uploader could confirm an upload before that
   * effect ran. Reading the move document at the moment of asking means
   * there is no flag to be early for: this module holds no state at all.
   */
  it("reads the setting from the move at the moment it asks", async () => {
    getPhotoRecord.mockResolvedValue(photo());
    isSummaryEnabled.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await requestSummary("m1", "p1");
    expect(summarizePhoto).not.toHaveBeenCalled();

    await requestSummary("m1", "p1");
    expect(isSummaryEnabled).toHaveBeenLastCalledWith("m1");
    expect(summarizePhoto).toHaveBeenCalledTimes(1);
  });

  it("skips a photo that is not a contents photo", async () => {
    isSummaryEnabled.mockResolvedValue(true);
    getPhotoRecord.mockResolvedValue(photo({ type: "damage" }));

    await requestSummary("m1", "p1");

    expect(summarizePhoto).not.toHaveBeenCalled();
  });

  it("swallows a failed call so the upload path is never disturbed", async () => {
    isSummaryEnabled.mockResolvedValue(true);
    getPhotoRecord.mockResolvedValue(photo());
    summarizePhoto.mockRejectedValueOnce(new Error("unauthenticated"));

    await expect(requestSummary("m1", "p1")).resolves.toBeUndefined();
  });

  it("marks the photo queued before the call and failed with the reason after one throws", async () => {
    isSummaryEnabled.mockResolvedValue(true);
    getPhotoRecord.mockResolvedValue(photo());
    summarizePhoto.mockRejectedValueOnce(new Error("deadline-exceeded"));

    await requestSummary("m1", "p1");

    expect(setSummaryState.mock.calls).toEqual([
      ["m1", "p1", "queued"],
      ["m1", "p1", "failed", "deadline-exceeded"],
    ]);
  });
});

describe("askForSummary", () => {
  it("writes queued before the call goes out", async () => {
    const order: string[] = [];
    setSummaryState.mockImplementationOnce(async (...args: unknown[]) => {
      order.push(`state:${String(args[2])}`);
      return undefined;
    });
    summarizePhoto.mockImplementationOnce(async () => {
      order.push("call");
      return { data: { summary: "a lamp" } };
    });

    await askForSummary("m1", "p1");

    expect(order).toEqual(["state:queued", "call"]);
  });

  it("passes redo and returnOnly through and hands back the answer", async () => {
    summarizePhoto.mockResolvedValueOnce({ data: { summary: "a lamp", categories: ["lighting"] } });

    const answer = await askForSummary("m1", "p1", { redo: true, returnOnly: true });

    expect(summarizePhoto).toHaveBeenCalledWith({ moveId: "m1", photoId: "p1", redo: true, returnOnly: true });
    expect(answer).toEqual({ summary: "a lamp", categories: ["lighting"] });
  });

  it("rethrows so a screen can say what went wrong", async () => {
    summarizePhoto.mockRejectedValueOnce(new Error("resource-exhausted"));

    await expect(askForSummary("m1", "p1")).rejects.toThrow("resource-exhausted");
    expect(setSummaryState).toHaveBeenLastCalledWith("m1", "p1", "failed", "resource-exhausted");
  });

  /**
   * Offline a write promise never settles. The head start is bounded so the
   * call still goes out, and fails on its own terms, rather than hanging the
   * panel on "Asking" forever.
   */
  it("does not wait on a queued mark that never settles", async () => {
    vi.useFakeTimers();
    try {
      setSummaryState.mockImplementationOnce(() => new Promise<undefined>(() => undefined));
      const pending = askForSummary("m1", "p1");
      await vi.advanceTimersByTimeAsync(3_000);
      await pending;
      expect(summarizePhoto).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
