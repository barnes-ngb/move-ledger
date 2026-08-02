import { describe, expect, it } from "vitest";
import { buildSearchText, exactByNumber, findByNumber, search } from "../search";
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
