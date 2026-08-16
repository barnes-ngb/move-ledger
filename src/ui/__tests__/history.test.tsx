import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useBackGuard, useHistoryView } from "../history";

/**
 * The back gesture, as far as jsdom can carry it.
 *
 * jsdom implements session history, so `pushState`, `back`, and `go` all
 * behave here: a pop fires `popstate` carrying the entry's state, which is
 * exactly the path the phone takes. What jsdom cannot show is the part that
 * made this a defect, which is Android closing a standalone app when the pop
 * finds no entry to land on. That needs a phone.
 */

interface View {
  name: string;
  query?: string;
}

const ROOT: View = { name: "home" };

function Screens() {
  const nav = useHistoryView<View>("test", ROOT);
  return (
    <div>
      <p>
        showing {nav.view.name}
        {nav.view.query ? ` ${nav.view.query}` : ""}
      </p>
      <button onClick={() => nav.open({ name: "list", query: "" })}>open the list</button>
      <button onClick={() => nav.open({ name: "detail" })}>open a box</button>
      <button onClick={() => nav.update({ name: "list", query: "kettle" })}>type kettle</button>
      <button onClick={nav.back}>back</button>
      <button onClick={nav.home}>home</button>
    </div>
  );
}

const asked = vi.fn();

function Guarded() {
  const nav = useHistoryView<View>("test", ROOT);
  const release = useBackGuard(nav.view.name === "add", asked);
  return (
    <div>
      <p>showing {nav.view.name}</p>
      <button onClick={() => nav.open({ name: "add" })}>add a box</button>
      <button
        onClick={() => {
          release();
          nav.home();
        }}
      >
        leave for good
      </button>
    </div>
  );
}

function showing(): string {
  return screen.getByText(/^showing/).textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  // Back to an entry this app does not own, which is what a fresh load is.
  window.history.replaceState(null, "");
});

describe("a view held in session history", () => {
  it("returns to the screen before it when the phone's back gesture fires", async () => {
    render(<Screens />);
    fireEvent.click(screen.getByText("open the list"));
    expect(showing()).toBe("showing list");

    window.history.back();
    await waitFor(() => expect(showing()).toBe("showing home"));
  });

  it("takes the on-screen back control down the same path", async () => {
    render(<Screens />);
    fireEvent.click(screen.getByText("open the list"));
    fireEvent.click(screen.getByText("back"));
    await waitFor(() => expect(showing()).toBe("showing home"));
  });

  it("comes home from two screens deep in one press", async () => {
    render(<Screens />);
    fireEvent.click(screen.getByText("open the list"));
    fireEvent.click(screen.getByText("open a box"));
    expect(showing()).toBe("showing detail");

    fireEvent.click(screen.getByText("home"));
    await waitFor(() => expect(showing()).toBe("showing home"));

    // Nothing of this app's own is left behind it. A gesture from the move
    // overview leaves the app rather than walking back into the box.
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(showing()).toBe("showing home");
  });

  it("brings the screen back with the state it was left in", async () => {
    render(<Screens />);
    fireEvent.click(screen.getByText("open the list"));
    fireEvent.click(screen.getByText("type kettle"));
    fireEvent.click(screen.getByText("open a box"));

    window.history.back();
    await waitFor(() => expect(showing()).toBe("showing list kettle"));
  });

  it("replaces the entry when only the filter text changed", async () => {
    render(<Screens />);
    fireEvent.click(screen.getByText("open the list"));
    fireEvent.click(screen.getByText("type kettle"));
    expect(showing()).toBe("showing list kettle");

    // One press leaves the list. Eight letters typed is not eight screens.
    window.history.back();
    await waitFor(() => expect(showing()).toBe("showing home"));
  });

  it("resumes on the screen the entry holds, so a reload lands where the person was", () => {
    const first = render(<Screens />);
    fireEvent.click(screen.getByText("open the list"));
    first.unmount();

    render(<Screens />);
    expect(showing()).toBe("showing list");
  });
});

describe("a screen that has a question to ask first", () => {
  it("answers the gesture with the question and stays where it is", async () => {
    render(<Guarded />);
    fireEvent.click(screen.getByText("add a box"));

    window.history.back();
    await waitFor(() => expect(asked).toHaveBeenCalledTimes(1));
    expect(showing()).toBe("showing add");
  });

  it("goes when the answer is to go", async () => {
    render(<Guarded />);
    fireEvent.click(screen.getByText("add a box"));
    fireEvent.click(screen.getByText("leave for good"));
    await waitFor(() => expect(showing()).toBe("showing home"));
    expect(asked).not.toHaveBeenCalled();
  });

  it("stops guarding once the screen is gone", async () => {
    const open = render(<Guarded />);
    fireEvent.click(screen.getByText("add a box"));
    open.unmount();

    render(<Screens />);
    window.history.back();
    await waitFor(() => expect(showing()).toBe("showing home"));
    expect(asked).not.toHaveBeenCalled();
  });
});
