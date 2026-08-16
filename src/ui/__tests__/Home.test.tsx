import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Container, Move, MoveMember } from "../../domain";
import type { MoveContext } from "../../hooks/useMove";
import { makeContainer, makeZone } from "../../domain/__tests__/factories";

/**
 * The screens under the move, and the gesture that moves between them.
 *
 * The four screens are stubbed. What is being asserted is the navigation: a
 * pop returns to the screen before it rather than closing the app, and it
 * returns with the state that screen was left in, which is the origin tracking
 * APPLY-08 built and this run had to keep.
 *
 * The hooks are stubbed for the usual reason: they reach `lib/firebase`, which
 * initializes an app at import.
 */
const container: Container = makeContainer({ id: "c1", displayCode: "042" });

vi.mock("../../hooks/useContainers", () => ({
  useContainers: () => ({ containers: [container], failed: false, retry: () => undefined }),
}));
vi.mock("../../hooks/usePhotoCounts", () => ({ usePhotoCounts: () => ({}) }));

vi.mock("../box/AddBox", () => ({
  AddBox: ({ onLeave }: { onLeave: () => void }) => (
    <div>
      <p>on add box</p>
      <button onClick={onLeave}>leave add box</button>
    </div>
  ),
}));

vi.mock("../box/FindBox", () => ({
  FindBox: ({ onBack }: { onBack: () => void }) => (
    <div>
      <p>on find</p>
      <button onClick={onBack}>find back</button>
    </div>
  ),
}));

vi.mock("../box/BoxList", () => ({
  BoxList: ({
    query,
    onQueryChange,
    onOpen,
    onBack,
  }: {
    query: string;
    onQueryChange: (q: string) => void;
    onOpen: (c: Container) => void;
    onBack: () => void;
  }) => (
    <div>
      <p>on the list, filtered by "{query}"</p>
      <button onClick={() => onQueryChange("kettle")}>type kettle</button>
      <button onClick={() => onOpen(container)}>open box 042</button>
      <button onClick={onBack}>list back</button>
    </div>
  ),
}));

vi.mock("../box/BoxDetail", () => ({
  BoxDetail: ({ backLabel, onBack }: { backLabel: string; onBack: () => void }) => (
    <div>
      <p>on box 042</p>
      <button onClick={onBack}>{backLabel}</button>
    </div>
  ),
}));

const { Home } = await import("../Home");

const move: Move = {
  id: "m1",
  name: "KC to DFW",
  status: "packing",
  memberUids: ["uid-1"],
  createdAt: "2026-08-16T12:00:00.000Z",
  updatedAt: "2026-08-16T12:00:00.000Z",
};

const me: MoveMember = {
  id: "mem1",
  moveId: "m1",
  uid: "uid-1",
  displayName: "Nathan",
  role: "owner",
  numberRangeStart: 1,
  numberRangeEnd: 499,
};

const ctx: MoveContext = {
  loading: false,
  failed: false,
  retry: () => undefined,
  move,
  members: [me],
  zones: [makeZone()],
  locations: [],
  me,
};

function open() {
  render(<Home ctx={ctx} uid="uid-1" onSetup={() => undefined} />);
}

/** The gesture. jsdom pops the entry and raises `popstate`, same as a phone. */
async function pressSystemBack() {
  window.history.back();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  window.history.replaceState(null, "");
});

describe("the move overview and the screens under it", () => {
  it("comes back to the move when the phone's back gesture fires", async () => {
    open();
    fireEvent.click(screen.getByText("See all boxes"));
    expect(screen.getByText(/on the list/)).toBeDefined();

    await pressSystemBack();
    await waitFor(() => expect(screen.getByText("Add a box")).toBeDefined());
  });

  it("comes back from Find the same way", async () => {
    open();
    fireEvent.click(screen.getByText("Find a box"));
    await pressSystemBack();
    await waitFor(() => expect(screen.getByText("Add a box")).toBeDefined());
  });

  it("returns a box to the list it was opened from, with the filter text still in it", async () => {
    open();
    fireEvent.click(screen.getByText("See all boxes"));
    fireEvent.click(screen.getByText("type kettle"));
    fireEvent.click(screen.getByText("open box 042"));
    expect(screen.getByText("on box 042")).toBeDefined();

    await pressSystemBack();
    await waitFor(() => expect(screen.getByText(/filtered by "kettle"/)).toBeDefined());
  });

  it("names where back goes, since the box was opened from the list", () => {
    open();
    fireEvent.click(screen.getByText("See all boxes"));
    fireEvent.click(screen.getByText("open box 042"));
    expect(screen.getByText("Back to the list")).toBeDefined();
  });

  it("leaves the list in one press however much was typed into it", async () => {
    open();
    fireEvent.click(screen.getByText("See all boxes"));
    fireEvent.click(screen.getByText("type kettle"));

    await pressSystemBack();
    await waitFor(() => expect(screen.getByText("Add a box")).toBeDefined());
  });

  it("sends the on-screen back control down the same path", async () => {
    open();
    fireEvent.click(screen.getByText("See all boxes"));
    fireEvent.click(screen.getByText("list back"));
    await waitFor(() => expect(screen.getByText("Add a box")).toBeDefined());
  });

  it("leaves Add box for the move", async () => {
    open();
    fireEvent.click(screen.getByText("Add a box"));
    expect(screen.getByText("on add box")).toBeDefined();

    fireEvent.click(screen.getByText("leave add box"));
    await waitFor(() => expect(screen.getByText("See all boxes")).toBeDefined());
  });
});
