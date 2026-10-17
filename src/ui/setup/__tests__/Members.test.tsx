import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Move, MoveMember } from "../../../domain";

/**
 * The Members screen for any number of people. It used to hardcode one second
 * person, 500 to 999, and "her". What is asserted here is that the range is
 * assigned from the members the move already has, removed ones included, that
 * the wording names nobody's gender, and that removal asks first and is offered
 * only where the domain allows it.
 */
const mocks = vi.hoisted(() => ({ addMember: vi.fn(), removeMember: vi.fn(), addMemberUid: vi.fn() }));

const pending = { value: undefined, written: Promise.resolve() };

vi.mock("../../../repositories", () => ({
  addMember: mocks.addMember,
  removeMember: mocks.removeMember,
  addMemberUid: mocks.addMemberUid,
  // Calls the error callback as the real one does, so a refused write can be asserted.
  writeInBackground: (work: Promise<unknown>, onError?: (e: unknown) => void) =>
    void work.catch((e) => onError?.(e)),
}));

const { Members } = await import("../Members");

const NOW = "2026-10-17T12:00:00.000Z";

const move: Move = {
  id: "m1",
  name: "KC to DFW",
  status: "packing",
  memberUids: ["u-nathan", "u-shelly"],
  createdAt: NOW,
  updatedAt: NOW,
};

function member(over: Partial<MoveMember>): MoveMember {
  return {
    id: "mem",
    moveId: "m1",
    uid: "u",
    displayName: "Someone",
    role: "member",
    numberRangeStart: 1,
    numberRangeEnd: 499,
    ...over,
  };
}

const nathan = member({ id: "mem-n", uid: "u-nathan", displayName: "Nathan", role: "owner" });
const shelly = member({ id: "mem-s", uid: "u-shelly", displayName: "Shelly", numberRangeStart: 500, numberRangeEnd: 999 });
const alex = member({ id: "mem-a", uid: "u-alex", displayName: "Alex", numberRangeStart: 1000, numberRangeEnd: 1499 });

function open(members: MoveMember[], uid = "u-nathan", m: Move = move, movePending = false) {
  render(
    <Members
      move={m}
      members={members}
      movePending={movePending}
      uid={uid}
      onDone={() => undefined}
      onBack={() => undefined}
    />
  );
}

function fill(name: string, uid: string) {
  fireEvent.change(screen.getByLabelText("Their name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Their account id"), { target: { value: uid } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addMember.mockReturnValue(pending);
  mocks.addMemberUid.mockReturnValue(Promise.resolve());
  mocks.removeMember.mockReturnValue(pending);
});

describe("adding a member", () => {
  it("shows the range a third person will get before anything is added", () => {
    open([nathan, shelly]);
    expect(screen.getByText("Their boxes will be numbered 1000 to 1499.")).toBeTruthy();
    expect(mocks.addMember).not.toHaveBeenCalled();
  });

  it("adds them with that range, memberUids first and by uid rather than a whole array", () => {
    open([nathan, shelly]);
    fill("Alex", " u-alex ");
    fireEvent.click(screen.getByText("Add this person"));
    expect(mocks.addMemberUid).toHaveBeenCalledWith("m1", "u-alex");
    expect(mocks.addMember).toHaveBeenCalledWith(
      "m1",
      { uid: "u-alex", displayName: "Alex", role: "member", numberRangeStart: 1000, numberRangeEnd: 1499 },
      [nathan, shelly]
    );
    expect(mocks.addMemberUid.mock.invocationCallOrder[0]).toBeLessThan(mocks.addMember.mock.invocationCallOrder[0]!);
  });

  it("still gives the second person 500 to 999", () => {
    open([nathan]);
    expect(screen.getByText("Their boxes will be numbered 500 to 999.")).toBeTruthy();
  });

  it("counts a removed member's range as taken", () => {
    open([nathan, shelly, { ...alex, removedAt: NOW }]);
    expect(screen.getByText("Their boxes will be numbered 1500 to 1999.")).toBeTruthy();
  });

  it("refuses an account already on the move, and one that was removed", () => {
    open([nathan, shelly, { ...alex, removedAt: NOW }]);
    fill("Shelly again", "u-shelly");
    fireEvent.click(screen.getByText("Add this person"));
    expect(screen.getByText("That person is already on the move.")).toBeTruthy();
    fill("Alex", "u-alex");
    fireEvent.click(screen.getByText("Add this person"));
    expect(screen.getByText(/was removed from this move/)).toBeTruthy();
    expect(mocks.addMember).not.toHaveBeenCalled();
    expect(mocks.addMemberUid).not.toHaveBeenCalled();
  });

  it("uses no gendered pronouns", () => {
    open([nathan, shelly]);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\b(her|she|his|he|him)\b/i);
  });
});

describe("removing a member", () => {
  it("offers Remove only on members who can be removed", () => {
    open([nathan, shelly, alex], "u-shelly");
    // Shelly is looking: she cannot remove herself or the owner, only Alex.
    expect(screen.getAllByText("Remove")).toHaveLength(1);
  });

  it("asks first, says when they lose access and that their boxes stay, then removes", () => {
    open([nathan, shelly, alex]);
    const buttons = screen.getAllByText("Remove");
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(mocks.removeMember).not.toHaveBeenCalled();
    const detail = screen.getByText(/loses access to the move as soon as this phone reaches the server/).textContent ?? "";
    expect(detail).toContain("Their boxes stay in the move");
    expect(detail).toContain("1000 to 1499 will not be given to anyone else");
    fireEvent.click(screen.getByText("Remove Alex"));
    expect(mocks.removeMember).toHaveBeenCalledWith("m1", alex, "u-nathan");
  });

  /**
   * Offline a Firestore write promise never settles, and the screen can be left
   * or the app reloaded before it does. So the warning is not remembered by the
   * screen: it is derived from the move document's pending-write flag, which
   * Firestore keeps in the persistent cache. A fresh mount with the flag set is
   * exactly the remount case.
   */
  it("warns that a removed person may still have access while the move has unsent writes", () => {
    open([nathan, shelly, { ...alex, removedAt: NOW }], "u-nathan", move, true);
    expect(screen.getByText(/anyone removed here may still have access/)).toBeTruthy();
  });

  it("drops the warning once the move has nothing unsent, and never shows it with nobody removed", () => {
    open([nathan, shelly, { ...alex, removedAt: NOW }], "u-nathan", move, false);
    expect(screen.queryByText(/may still have access/)).toBeNull();
    cleanup();
    open([nathan, shelly, alex], "u-nathan", move, true);
    expect(screen.queryByText(/may still have access/)).toBeNull();
  });

  it("says plainly when the removal was refused", async () => {
    mocks.removeMember.mockReturnValue({ value: undefined, written: Promise.reject(new Error("denied")) });
    open([nathan, shelly, alex]);
    const buttons = screen.getAllByText("Remove");
    fireEvent.click(buttons[buttons.length - 1]!);
    await act(async () => fireEvent.click(screen.getByText("Remove Alex")));
    expect(screen.getByText("Could not remove Alex. They still have access.")).toBeTruthy();
  });

  it("does nothing when the question is answered with keep", () => {
    open([nathan, shelly, alex]);
    const buttons = screen.getAllByText("Remove");
    fireEvent.click(buttons[buttons.length - 1]!);
    fireEvent.click(screen.getByText("Keep Alex"));
    expect(mocks.removeMember).not.toHaveBeenCalled();
    expect(screen.queryByText("Remove Alex")).toBeNull();
  });

  it("shows a removed member as removed, with their range retired and no Remove", () => {
    open([nathan, shelly, { ...alex, removedAt: NOW }]);
    expect(screen.getByText("removed")).toBeTruthy();
    expect(screen.getByText("Boxes 1000 to 1499, retired")).toBeTruthy();
    // Nathan is looking: only Shelly is removable now.
    expect(screen.getAllByText("Remove")).toHaveLength(1);
  });
});
