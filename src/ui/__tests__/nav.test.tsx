import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HomeSlotProvider, useHomeSlot, useOfferHome } from "../nav";

/**
 * The header is rendered above every screen and the state that decides where
 * home is lives below it, so the handover is the whole of this file.
 *
 * The case that matters is Add box taking the header from Home: the inner
 * screen has to win while it is open, and Home has to get the header back
 * when it closes rather than the title going dead.
 */
function Harness({ inner }: { inner: boolean }) {
  const home = useHomeSlot();
  return (
    <div>
      {home.goHome ? (
        <button onClick={home.goHome}>Move Ledger</button>
      ) : (
        <span>Move Ledger</span>
      )}
      <HomeSlotProvider claim={home.claim}>
        <Outer active={!inner} />
        {inner ? <Inner /> : null}
      </HomeSlotProvider>
    </div>
  );
}

const outerWent = vi.fn();
const innerWent = vi.fn();

function Outer({ active }: { active: boolean }) {
  useOfferHome(active, () => outerWent());
  return null;
}

function Inner() {
  useOfferHome(true, () => innerWent());
  return null;
}

describe("the home slot", () => {
  it("leaves the title as plain text when nothing offers a way home", () => {
    render(
      <HomeSlotProvider claim={() => () => undefined}>
        <Wrapper />
      </HomeSlotProvider>
    );
    expect(screen.queryByRole("button", { name: "Move Ledger" })).toBeNull();
  });

  it("gives the title the offer that is on screen", () => {
    render(<Harness inner={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Ledger" }));
    expect(outerWent).toHaveBeenCalledTimes(1);
    expect(innerWent).not.toHaveBeenCalled();
  });

  it("hands the title to the inner screen while it is open", () => {
    vi.clearAllMocks();
    const { rerender } = render(<Harness inner={false} />);
    rerender(<Harness inner={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Ledger" }));
    expect(innerWent).toHaveBeenCalledTimes(1);
    expect(outerWent).not.toHaveBeenCalled();
  });

  it("gives it back when the inner screen closes", () => {
    vi.clearAllMocks();
    const { rerender } = render(<Harness inner={true} />);
    rerender(<Harness inner={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Ledger" }));
    expect(outerWent).toHaveBeenCalledTimes(1);
    expect(innerWent).not.toHaveBeenCalled();
  });
});

function Wrapper() {
  const home = useHomeSlot();
  return home.goHome ? <button>Move Ledger</button> : <span>Move Ledger</span>;
}
