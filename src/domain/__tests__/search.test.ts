import { describe, expect, it } from "vitest";
import { buildSearchText, exactByNumber, findByNumber, search, tokenMatches, tokenize } from "../search";
import { makeContainer, makeZone } from "./factories";

const zones = [makeZone(), makeZone({ id: "z2", name: "Garage", colorName: "RED" })];

describe("buildSearchText", () => {
  it("folds every searchable field to lowercase", () => {
    const text = buildSearchText(
      {
        displayCode: "042",
        title: "Coffee Gear",
        notes: "Kettle and MUGS",
        contentsSummary: undefined,
        aiSummary: "measuring cups",
      },
      "Kitchen"
    );
    expect(text).toBe("042 coffee gear kettle and mugs measuring cups kitchen");
  });

  it("drops fields that are absent rather than leaving gaps", () => {
    const text = buildSearchText({ displayCode: "007", title: undefined, notes: undefined, contentsSummary: undefined, aiSummary: undefined });
    expect(text).toBe("007");
  });
});

describe("search", () => {
  const containers = [
    makeContainer({ id: "c1", sequenceNumber: 42, displayCode: "042", notes: "kettle and mugs", destinationZoneId: "z1" }),
    makeContainer({ id: "c2", sequenceNumber: 43, displayCode: "043", aiSummary: "power drill, sockets", destinationZoneId: "z2" }),
    makeContainer({ id: "c3", sequenceNumber: 44, displayCode: "044", title: "Medicine", destinationZoneId: "z1" }),
  ];

  it("finds a box by a word in its note", () => {
    const hits = search(containers, "kettle", zones);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.container.id).toBe("c1");
    expect(hits[0]!.field).toBe("notes");
    expect(hits[0]!.suggestionOnly).toBe(false);
  });

  it("marks a match that came only from an unconfirmed summary", () => {
    const hits = search(containers, "drill", zones);
    expect(hits[0]!.suggestionOnly).toBe(true);
    expect(hits[0]!.field).toBe("aiSummary");
  });

  it("prefers confirmed text over a suggestion when both could match", () => {
    const both = makeContainer({ id: "c9", notes: "lamp", aiSummary: "lamp" });
    expect(search([both], "lamp").at(0)?.field).toBe("notes");
  });

  it("searches the destination room name", () => {
    const hits = search(containers, "garage", zones);
    expect(hits.map((h) => h.container.id)).toEqual(["c2"]);
  });

  it("returns nothing for an empty query rather than everything", () => {
    expect(search(containers, "   ", zones)).toEqual([]);
  });
});

/**
 * Box 015 as the deployed function actually wrote it. The quotes, the plus
 * sign, and the word order are the reason this file exists: every phrase below
 * is one a person would type and none of them is a substring of this text.
 */
const BOX_015 =
  "Magazines and brochures: 'Travel + Leisure' magazine, '2026 Kansas City World Soccer Preview' magazine, Subaru Forester Accessories 2026 brochure, and a Navarra brochure.";

describe("search, word by word", () => {
  const box015 = makeContainer({ id: "c15", sequenceNumber: 15, displayCode: "015", aiSummary: BOX_015 });

  it("finds box 015 by two words that sit apart in the text", () => {
    expect(search([box015], "soccer magazine").map((h) => h.container.id)).toEqual(["c15"]);
    expect(search([box015], "travel leisure").map((h) => h.container.id)).toEqual(["c15"]);
  });

  it("ignores the punctuation between the words", () => {
    const plus = search([box015], "travel + leisure");
    const plain = search([box015], "travel leisure");
    expect(plus.map((h) => h.container.id)).toEqual(plain.map((h) => h.container.id));
    expect(plus[0]!.matchedCount).toBe(plain[0]!.matchedCount);
  });

  it("still finds the one word that worked before", () => {
    expect(search([box015], "subaru").map((h) => h.container.id)).toEqual(["c15"]);
  });

  it("puts a box that answered two words above one that answered one", () => {
    const one = makeContainer({ id: "one", sequenceNumber: 3, displayCode: "003", notes: "soccer cleats" });
    const two = makeContainer({ id: "two", sequenceNumber: 88, displayCode: "088", notes: "soccer magazine pile" });
    const hits = search([one, two], "soccer magazine");
    expect(hits.map((h) => h.container.id)).toEqual(["two", "one"]);
    expect(hits[0]!.matchedCount).toBe(2);
    expect(hits[1]!.matchedCount).toBe(1);
  });

  it("orders boxes that answered the same number of words by their number", () => {
    const later = makeContainer({ id: "later", sequenceNumber: 91, displayCode: "091", notes: "mugs" });
    const earlier = makeContainer({ id: "earlier", sequenceNumber: 12, displayCode: "012", notes: "mugs" });
    expect(search([later, earlier], "mugs").map((h) => h.container.id)).toEqual(["earlier", "later"]);
  });

  it("resolves plurals in both directions", () => {
    const singular = makeContainer({ id: "s", notes: "magazine" });
    const plural = makeContainer({ id: "p", notes: "magazines" });
    expect(search([plural], "magazine")).toHaveLength(1);
    expect(search([singular], "magazines")).toHaveLength(1);
  });

  it("does not let a short word run loose", () => {
    const boxes = [makeContainer({ id: "cardboard", notes: "cardboard flats" })];
    expect(search(boxes, "car")).toEqual([]);
  });

  it("counts a word once however many fields it hit", () => {
    const both = makeContainer({ id: "b", notes: "lamp", aiSummary: "lamp" });
    expect(search([both], "lamp")[0]!.matchedCount).toBe(1);
  });

  it("does not call a hit a suggestion when confirmed text matched another word", () => {
    const mixed = makeContainer({ id: "m", notes: "kettle", aiSummary: "power drill" });
    const hit = search([mixed], "kettle drill")[0]!;
    expect(hit.matchedCount).toBe(2);
    expect(hit.field).toBe("notes");
    expect(hit.suggestionOnly).toBe(false);
  });

  it("still narrows by digits while a number is being typed", () => {
    const boxes = [
      makeContainer({ id: "a", sequenceNumber: 4, displayCode: "004" }),
      makeContainer({ id: "b", sequenceNumber: 42, displayCode: "042" }),
    ];
    expect(search(boxes, "4").map((h) => h.container.id)).toEqual(["a", "b"]);
    expect(search(boxes, "42").map((h) => h.container.id)).toEqual(["b"]);
  });
});

describe("tokenize", () => {
  it("drops the punctuation a generated contents list carries", () => {
    expect(tokenize("'Travel + Leisure' magazine, 2026")).toEqual([
      "travel",
      "leisure",
      "magazine",
      "2026",
    ]);
  });

  it("returns nothing for text with no words in it", () => {
    expect(tokenize("  +  ")).toEqual([]);
  });

  it("folds accents so one spelling reaches the other", () => {
    expect(tokenize("Café")).toEqual(["cafe"]);
    expect(tokenize("jalapeño")).toEqual(["jalapeno"]);
  });

  it("keeps a word written in another script rather than deleting it", () => {
    expect(tokenize("коробка с книгами")).toEqual(["коробка", "с", "книгами"]);
  });
});

/**
 * Added in review on pull request 17. The plan's tokenizer split on
 * `[^a-z0-9]+`, which erases a non-Latin script outright, and the suggested
 * replacement would have broken the accented case that worked by accident.
 */
describe("search, text that is not plain ASCII", () => {
  it("finds an accented word from either spelling", () => {
    const boxes = [makeContainer({ id: "c", notes: "café press and a grinder" })];
    expect(search(boxes, "cafe")).toHaveLength(1);
    expect(search(boxes, "café")).toHaveLength(1);
  });

  it("keeps the accented match the old tokenizer got by accident", () => {
    const boxes = [makeContainer({ id: "c", aiSummary: "jalapeño peppers, dried" })];
    expect(search(boxes, "jalapeno")).toHaveLength(1);
  });

  it("finds a box whose text is written in another script", () => {
    const boxes = [makeContainer({ id: "c", notes: "коробка с книгами" })];
    expect(search(boxes, "коробка")).toHaveLength(1);
  });
});

describe("tokenMatches", () => {
  it("matches a word to itself", () => {
    expect(tokenMatches("toy", "toy")).toBe(true);
  });

  it("matches a long enough prefix in either direction", () => {
    expect(tokenMatches("magazine", "magazines")).toBe(true);
    expect(tokenMatches("magazines", "magazine")).toBe(true);
  });

  it("refuses a prefix shorter than four letters", () => {
    expect(tokenMatches("car", "cardboard")).toBe(false);
    expect(tokenMatches("toys", "toy")).toBe(false);
  });
});

describe("findByNumber", () => {
  const containers = [
    makeContainer({ id: "c1", sequenceNumber: 4, displayCode: "004" }),
    makeContainer({ id: "c2", sequenceNumber: 42, displayCode: "042" }),
    makeContainer({ id: "c3", sequenceNumber: 43, displayCode: "043" }),
  ];

  it("narrows as digits are typed", () => {
    expect(findByNumber(containers, "4")).toHaveLength(3);
    expect(findByNumber(containers, "42")).toHaveLength(1);
  });

  it("resolves 42 to box 042", () => {
    expect(exactByNumber(containers, "42")?.displayCode).toBe("042");
  });

  it("ignores anything that is not a digit", () => {
    expect(exactByNumber(containers, "#42")?.displayCode).toBe("042");
    expect(findByNumber(containers, "abc")).toEqual([]);
  });
});
