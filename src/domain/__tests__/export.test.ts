import { describe, expect, it } from "vitest";
import { EXPORT_FORMAT_VERSION, toCsv, toJson } from "../export";
import { makeContainer, makeZone } from "./factories";

const zones = [makeZone()];

describe("toJson", () => {
  it("stamps a format version so a future reader knows the shape", () => {
    const json = JSON.parse(
      toJson(
        {
          move: {
            id: "m1",
            name: "KC to DFW",
            status: "packing",
            memberUids: ["u1"],
            createdAt: "2026-07-25T18:00:00.000Z",
            updatedAt: "2026-07-25T18:00:00.000Z",
          },
          members: [],
          locations: [],
          zones,
          containers: [makeContainer()],
          photos: [],
          activity: [],
        },
        "2026-07-26T12:00:00.000Z"
      )
    );
    expect(json.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(json.exportedAt).toBe("2026-07-26T12:00:00.000Z");
    expect(json.containers).toHaveLength(1);
  });
});

describe("toCsv", () => {
  it("writes a header and one row per box, sorted by number", () => {
    const csv = toCsv({
      containers: [
        makeContainer({ id: "c2", sequenceNumber: 43, displayCode: "043" }),
        makeContainer({ id: "c1", sequenceNumber: 42, displayCode: "042", destinationZoneId: "z1" }),
      ],
      zones,
      photos: [],
    });
    const lines = csv.split("\r\n");
    expect(lines[0]).toMatch(/^number,room,color,status/);
    expect(lines[1]).toMatch(/^042,Kitchen,BLUE,packed/);
    expect(lines[2]).toMatch(/^043,,,packed/);
  });

  it("escapes a note containing a comma or a quote", () => {
    const csv = toCsv({
      containers: [makeContainer({ notes: 'mugs, "the good ones"' })],
      zones,
      photos: [],
    });
    expect(csv).toContain('"mugs, ""the good ones"""');
  });

  it("gives conditions their own columns for an insurance conversation", () => {
    const csv = toCsv({
      containers: [
        makeContainer({
          conditions: { damaged: { reportedAt: "2026-07-26T12:00:00.000Z", reportedBy: "mem1", photoIds: ["p1"] } },
        }),
      ],
      zones,
      photos: [],
    });
    expect(csv.split("\r\n")[1]).toContain("2026-07-26T12:00:00.000Z");
  });

  it("counts photos per box", () => {
    const photo = (id: string) => ({
      id,
      moveId: "m1",
      containerId: "c1",
      type: "contents" as const,
      width: 1600,
      height: 1200,
      bytes: 204800,
      uploadState: "uploaded" as const,
      attempts: 0,
      createdAt: "2026-07-25T18:00:00.000Z",
      createdBy: "mem1",
    });
    const csv = toCsv({
      containers: [makeContainer({ id: "c1" })],
      zones,
      photos: [photo("p1"), photo("p2")],
    });
    expect(csv.split("\r\n")[1]).toMatch(/,2,/);
  });
});
