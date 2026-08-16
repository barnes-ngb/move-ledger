import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The system back gesture, and the only reason this file exists.
 *
 * Navigation is a `View` union held by the screen that owns it, and that is
 * not changing: there is no router in this app. What was missing underneath it
 * is the History API. An installed PWA runs standalone with no browser chrome,
 * and the back gesture is the first thing an Android user reaches for. With no
 * entry pushed, that gesture pops the only entry there is and Android closes
 * the app, losing the screen the person was on.
 *
 * So every view change pushes an entry, and the pop is what changes the view.
 * The on-screen Back, the header title, and the gesture all travel the same
 * path: they move through session history rather than setting state directly.
 * From the move overview back may leave the app, which is correct. That is the
 * root of the app and there is nothing behind it.
 *
 * A slot is one screen's view state. `Home` owns one and `App` owns another,
 * because the header and the screens under it hold their state in different
 * places, and an entry carries every slot's value at the moment it was pushed.
 * That is what lets two owners share one stack: whichever entry a pop lands on
 * tells every slot what it was showing then.
 *
 * Depth is counted in the entry rather than in a variable here, so a reload
 * resumes with an honest count and nothing in this module can drift from what
 * the browser actually holds.
 */

const NS = "moveLedgerNav";

interface NavState {
  /** How many entries this app has pushed. The app's own root is 0. */
  depth: number;
  /** The value each slot was showing when this entry was pushed. */
  views: Record<string, unknown>;
}

const ROOT: NavState = { depth: 0, views: {} };

function readNav(state: unknown): NavState {
  const held = (state as Record<string, unknown> | null | undefined)?.[NS];
  if (!held || typeof held !== "object") return ROOT;
  const nav = held as Partial<NavState>;
  return {
    depth: typeof nav.depth === "number" ? nav.depth : 0,
    views: nav.views && typeof nav.views === "object" ? nav.views : {},
  };
}

/** The entry the browser is on now. */
function here(): NavState {
  return readNav(window.history.state);
}

/** Keeps anything another script put on the entry. */
function wrap(nav: NavState): Record<string, unknown> {
  const existing = (window.history.state as Record<string, unknown> | null) ?? {};
  return { ...existing, [NS]: nav };
}

type Notify = (value: unknown) => void;

const slots = new Map<string, Notify>();

/**
 * The entry the browser was on before the last pop. Only the guard reads it,
 * to put back an entry it refused to leave.
 */
let previous: NavState | null = null;

let guard: (() => void) | null = null;
let listening = false;

function onPop(event: PopStateEvent) {
  if (guard) {
    const ask = guard;
    // Put the entry back before anything reads the pop. The screen stays where
    // it is and asks its question instead of vanishing under the answer.
    const restore = previous ?? { depth: here().depth + 1, views: here().views };
    window.history.pushState(wrap(restore), "");
    previous = restore;
    ask();
    return;
  }
  const nav = readNav(event.state);
  previous = nav;
  for (const [slot, notify] of slots) notify(nav.views[slot]);
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("popstate", onPop);
}

function pushView(slot: string, value: unknown): void {
  const current = here();
  const next: NavState = { depth: current.depth + 1, views: { ...current.views, [slot]: value } };
  previous = next;
  window.history.pushState(wrap(next), "");
}

function replaceView(slot: string, value: unknown): void {
  const current = here();
  const next: NavState = { depth: current.depth, views: { ...current.views, [slot]: value } };
  previous = next;
  window.history.replaceState(wrap(next), "");
}

export interface HistoryView<T> {
  /** What this slot is showing. */
  view: T;
  /** A new screen. Pushes an entry, so back returns to this one. */
  open: (next: T) => void;
  /** The same screen with different state, such as filter text. No new entry. */
  update: (next: T) => void;
  /** One entry back, which is wherever this screen was opened from. */
  back: () => void;
  /** All the way to the move overview, however deep this got. */
  home: () => void;
}

/**
 * One screen's view state, held in session history.
 *
 * The value must survive `structuredClone`, because the browser stores it. The
 * `View` unions in this app are plain data and do, which is also why the origin
 * a screen was opened from still travels with it.
 *
 * On mount the slot adopts whatever the current entry holds, so a reload lands
 * on the screen the person was on rather than dropping them at the overview
 * with entries still behind them.
 */
export function useHistoryView<T>(slot: string, root: T): HistoryView<T> {
  const [view, setView] = useState<T>(() => {
    const held = here().views[slot];
    return held === undefined ? root : (held as T);
  });

  // Read through a ref so a caller can pass a fresh root object every render
  // without resubscribing.
  const latestRoot = useRef(root);
  latestRoot.current = root;

  useEffect(() => {
    listen();
    slots.set(slot, (value) => setView(value === undefined ? latestRoot.current : (value as T)));
    return () => {
      slots.delete(slot);
    };
  }, [slot]);

  const open = useCallback(
    (next: T) => {
      pushView(slot, next);
      setView(next);
    },
    [slot]
  );

  const update = useCallback(
    (next: T) => {
      replaceView(slot, next);
      setView(next);
    },
    [slot]
  );

  // Both of these change the view only when the pop arrives, which is the
  // point: one path in, whether the press was on screen or on the phone.
  const back = useCallback(() => {
    // Nothing above the app's own root belongs to us. A control that says it
    // returns must never be the thing that closes the app.
    if (here().depth > 0) window.history.back();
  }, []);

  const home = useCallback(() => {
    const depth = here().depth;
    if (depth > 0) window.history.go(-depth);
  }, []);

  return { view, open, update, back, home };
}

/**
 * Refuse the back gesture while a screen has a question to ask first.
 *
 * Add box is the only one. Its number is reserved on mount and is spent either
 * way, so leaving without answering for the draft is how numbers go missing,
 * and the gesture must ask the same question the on-screen Back asks.
 *
 * Returns the release, which the screen calls on the way out. Leaving is a
 * navigation of its own, and a guard still standing would refuse that too.
 */
export function useBackGuard(active: boolean, ask: () => void): () => void {
  const latest = useRef(ask);
  latest.current = ask;
  // Released by identity rather than outright, the same way the home slot in
  // `nav.tsx` is, so a screen can never clear a guard that is not its own.
  const mine = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    if (guard !== null && guard === mine.current) guard = null;
    mine.current = null;
  }, []);

  useEffect(() => {
    if (!active) return;
    listen();
    const ours = () => latest.current();
    mine.current = ours;
    guard = ours;
    return release;
  }, [active, release]);

  return release;
}
