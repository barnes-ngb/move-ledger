import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Move } from "../../domain";

/**
 * Editing a move, stubbed at the SDK boundary. The thing worth proving is what
 * a write leaves out: `memberUids` is written only by the membership batches in
 * `members.ts`, as an `arrayUnion` or `arrayRemove`. A whole-move write from a
 * phone whose copy predates an add or a removal put the old array back when it
 * replayed, which locked a helper out with nothing on any screen to repair it.
 */
const mocks = vi.hoisted(() => ({ updateDoc: vi.fn() }));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...parts: string[]) => parts.join("/"),
  doc: (ref: string, id: string) => `${ref}/${id}`,
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocFromCache: vi.fn(),
  onSnapshot: vi.fn(),
  query: (ref: unknown) => ref,
  setDoc: vi.fn(),
  updateDoc: mocks.updateDoc,
  where: vi.fn(),
}));

vi.mock("../../lib/firebase", () => ({ db: {} }));

const { setAiEnabled, setMoveLocations, updateMove } = await import("../moves");

const move: Move = {
  id: "m1",
  name: "KC to DFW",
  status: "packing",
  memberUids: ["u-nathan", "u-shelly"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateDoc.mockResolvedValue(undefined);
});

describe("updateMove", () => {
  it("writes the contents list setting and nothing about membership", () => {
    setAiEnabled("m1", true);
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = mocks.updateDoc.mock.calls[0]!;
    expect(ref).toBe("moves/m1");
    expect(Object.keys(data as object).sort()).toEqual(["aiEnabled", "updatedAt"]);
    expect(data).toMatchObject({ aiEnabled: true });
  });

  it("writes false as an answer rather than leaving the field absent", () => {
    setAiEnabled("m1", false);
    expect(mocks.updateDoc.mock.calls[0]![1]).toMatchObject({ aiEnabled: false });
  });

  it("links the two places and nothing else", () => {
    setMoveLocations("m1", "l-from", "l-to");
    const data = mocks.updateDoc.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(["destinationLocationId", "originLocationId", "updatedAt"]);
  });

  it("refuses memberUids before anything reaches Firestore", () => {
    // Refused by the compiler too. If this line ever compiles, `tsc` fails on
    // the unused directive.
    // @ts-expect-error memberUids is not a field a screen may write
    expect(() => updateMove("m1", { memberUids: ["u-nathan"] })).toThrow();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it("refuses a whole move spread into it, which is the shape that caused the lockout", () => {
    expect(() =>
      updateMove("m1", { ...move, aiEnabled: true } as unknown as Parameters<typeof updateMove>[1])
    ).toThrow();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});
