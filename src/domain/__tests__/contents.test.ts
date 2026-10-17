import { describe, expect, it } from "vitest";
import {
  aiItemsOf,
  contentsItemsOf,
  itemsOf,
  joinItems,
  mergeItems,
  parseItemLines,
  splitSummary,
} from "../contents";

describe("splitSummary", () => {
  it("splits a string from before items on its commas", () => {
    expect(splitSummary("Coffee maker, blender parts, measuring cups")).toEqual([
      "Coffee maker",
      "blender parts",
      "measuring cups",
    ]);
  });

  it("drops the period a sentence ended in", () => {
    expect(splitSummary("books, a lamp.")).toEqual(["books", "a lamp"]);
  });

  it("keeps a typed list with no commas as one item", () => {
    expect(splitSummary("kettle and mugs")).toEqual(["kettle and mugs"]);
  });

  it("reads nothing from nothing", () => {
    expect(splitSummary(undefined)).toEqual([]);
    expect(splitSummary("")).toEqual([]);
    expect(splitSummary(" , ")).toEqual([]);
  });
});

describe("parseItemLines", () => {
  it("takes one item per line, trimmed, with blank lines dropped", () => {
    expect(parseItemLines("  kettle \n\ntwo mugs\r\n   \ntea towels\n")).toEqual([
      "kettle",
      "two mugs",
      "tea towels",
    ]);
  });

  it("keeps a comma inside a line, since the line is the item", () => {
    expect(parseItemLines("pens, pencils")).toEqual(["pens, pencils"]);
  });
});

describe("mergeItems", () => {
  it("appends what is new and skips what is there, ignoring case", () => {
    expect(mergeItems(["Books", "a lamp"], ["books", "A Lamp", "tea towels"])).toEqual([
      "Books",
      "a lamp",
      "tea towels",
    ]);
  });

  it("skips a repeat inside the same answer", () => {
    expect(mergeItems([], ["mug", "Mug", "mug."])).toEqual(["mug"]);
  });

  it("drops blanks and trailing punctuation", () => {
    expect(mergeItems([], ["  ", "stapler."])).toEqual(["stapler"]);
  });
});

/**
 * Read, never migrated. A box from before items has a string alone, and a
 * phone on the build before items edits the string and cannot see the list.
 */
describe("itemsOf", () => {
  it("uses the stored list while it joins to the string beside it", () => {
    expect(itemsOf(["pens, pencils", "stapler"], "pens, pencils, stapler")).toEqual([
      "pens, pencils",
      "stapler",
    ]);
  });

  it("splits the string when there is no list", () => {
    expect(itemsOf(undefined, "books, a lamp")).toEqual(["books", "a lamp"]);
  });

  it("trusts the string over a list an older build left behind", () => {
    expect(itemsOf(["books", "a lamp"], "books, a lamp, a rug")).toEqual(["books", "a lamp", "a rug"]);
  });

  it("reads a list whose string was cleared as empty", () => {
    expect(itemsOf(["books"], undefined)).toEqual([]);
  });

  it("round trips through joinItems", () => {
    const items = ["white ceramic vase", "blue plastic bin"];
    expect(itemsOf(items, joinItems(items))).toEqual(items);
  });

  it("reads the two lists of a box separately", () => {
    const box = {
      aiItems: ["a lamp"],
      aiSummary: "a lamp",
      contentsItems: undefined,
      contentsSummary: "books, linens",
    };
    expect(aiItemsOf(box)).toEqual(["a lamp"]);
    expect(contentsItemsOf(box)).toEqual(["books", "linens"]);
  });
});
