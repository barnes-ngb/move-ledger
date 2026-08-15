import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Move } from "../../../domain";
import { makeContainer, makeZone } from "../../../domain/__tests__/factories";

/**
 * The subscriptions and the download are stubbed. What is worth asserting is
 * the wiring, because the two format functions have been tested since
 * APPLY-01 and were reachable from nowhere: that both files are offered, that
 * they carry the move name and the day, and that the CSV really is the one
 * with the condition columns an insurance conversation needs.
 */
const sources = vi.hoisted(() => ({
  containers: [] as unknown[],
  photos: [] as unknown[],
  activity: [] as unknown[],
  failed: false,
}));
const mocks = vi.hoisted(() => ({ downloadText: vi.fn() }));

vi.mock("../../../hooks/useExportBundle", () => ({ useExportBundle: () => sources }));
vi.mock("../../../lib/download", () => ({ downloadText: mocks.downloadText }));

const { ExportPanel } = await import("../ExportPanel");

const move: Move = {
  id: "m1",
  name: "KC to DFW",
  status: "packing",
  memberUids: ["uid-1"],
  createdAt: "2026-08-15T12:00:00.000Z",
  updatedAt: "2026-08-15T12:00:00.000Z",
};

const zones = [makeZone()];

function open() {
  render(<ExportPanel move={move} members={[]} zones={zones} locations={[]} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  sources.failed = false;
  sources.photos = [];
  sources.activity = [];
  sources.containers = [
    makeContainer({
      destinationZoneId: "z1",
      conditions: {
        damaged: { reportedAt: "2026-08-15T12:00:00.000Z", reportedBy: "mem1", photoIds: [] },
      },
    }),
  ];
});

describe("ExportPanel", () => {
  it("stays off the screen while there is nothing to export", () => {
    sources.containers = [];
    open();
    expect(screen.queryByText("Export")).toBeNull();
  });

  it("writes a spreadsheet named for the move and the day", () => {
    open();
    fireEvent.click(screen.getByText("Download the spreadsheet"));
    const [name, mime, text] = mocks.downloadText.mock.calls[0] as [string, string, string];
    expect(name).toMatch(/^kc-to-dfw-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(mime).toBe("text/csv");
    expect(text.split("\r\n")[0]).toContain("missing,damaged");
    expect(text.split("\r\n")[1]).toContain("Kitchen");
  });

  it("writes a data file carrying the whole move", () => {
    open();
    fireEvent.click(screen.getByText("Download the data file"));
    const [name, mime, text] = mocks.downloadText.mock.calls[0] as [string, string, string];
    expect(name).toMatch(/^kc-to-dfw-\d{4}-\d{2}-\d{2}\.json$/);
    expect(mime).toBe("application/json");
    const parsed = JSON.parse(text);
    expect(parsed.move.name).toBe("KC to DFW");
    expect(parsed.containers).toHaveLength(1);
  });

  it("says so when a listener stopped, because a short file is worse than none", () => {
    sources.failed = true;
    open();
    expect(screen.getByText(/could be short/)).toBeDefined();
  });
});
