import { describe, expect, it } from "vitest";
import { MAX_EDGE, fitWithin } from "../resize";

/**
 * `fitWithin` is the whole resize decision, separated from the canvas so it
 * can be tested at all. The canvas half is exercised by taking a photo on a
 * phone, which is the manual acceptance test doc 06 names.
 */
describe("fitWithin", () => {
  it("scales a landscape photo by its long edge", () => {
    expect(fitWithin({ width: 4032, height: 3024 })).toEqual({ width: 1600, height: 1200 });
  });

  it("scales a portrait photo by its long edge", () => {
    expect(fitWithin({ width: 3024, height: 4032 })).toEqual({ width: 1200, height: 1600 });
  });

  it("scales a square photo to the maximum edge on both sides", () => {
    expect(fitWithin({ width: 3000, height: 3000 })).toEqual({ width: MAX_EDGE, height: MAX_EDGE });
  });

  it("leaves a small image alone rather than enlarging it", () => {
    // Upscaling would produce a larger file with no more detail in it.
    expect(fitWithin({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });

  it("leaves an image already at the maximum edge alone", () => {
    expect(fitWithin({ width: 1600, height: 900 })).toEqual({ width: 1600, height: 900 });
  });

  it("never rounds a very wide image down to zero", () => {
    expect(fitWithin({ width: 16000, height: 5 })).toEqual({ width: 1600, height: 1 });
  });

  it("honors a maximum edge other than the default", () => {
    expect(fitWithin({ width: 1000, height: 500 }, 100)).toEqual({ width: 100, height: 50 });
  });
});
