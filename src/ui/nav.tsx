import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * One answer to "what does the title do".
 *
 * There is no router in this app and there is not going to be one: navigation
 * is a `View` union held by the screen that owns it. The header, though, is
 * rendered in `App` above every screen, so it cannot read that state directly.
 * A screen offers the header a way home while it is on screen, and the header
 * reads whatever is currently offered.
 *
 * Null is a real answer. Sign-in, the first-run flow, and the forced room
 * setup a move with no rooms starts in have no home to go to yet, and the
 * title stays plain text there rather than being a button that does nothing.
 *
 * Exactly one screen offers at a time, and it is the innermost one that is
 * active. That is what lets Add box take the header from Home and ask about
 * its draft before the screen goes.
 */
export type GoHome = () => void;

export interface HomeSlot {
  /** What the header title does now, or null when there is nowhere to go. */
  goHome: GoHome | null;
  claim: Claim;
}

type Claim = (goHome: GoHome) => () => void;

export function useHomeSlot(): HomeSlot {
  const [held, setHeld] = useState<{ fn: GoHome } | null>(null);

  // Releasing checks identity rather than clearing outright. React runs every
  // cleanup in a commit before any effect, so the order is already safe, and
  // this makes it safe whatever order they run in.
  const claim = useCallback<Claim>((fn) => {
    const entry = { fn };
    setHeld(entry);
    return () => setHeld((current) => (current === entry ? null : current));
  }, []);

  return { goHome: held ? held.fn : null, claim };
}

const ClaimContext = createContext<Claim>(() => () => undefined);

export function HomeSlotProvider({ claim, children }: { claim: Claim; children: ReactNode }) {
  return <ClaimContext.Provider value={claim}>{children}</ClaimContext.Provider>;
}

/**
 * Offer the header a way home while `active`. The function is read through a
 * ref, so a screen can pass a fresh closure on every render without
 * re-claiming, and `active` is the only thing that hands the header over.
 */
export function useOfferHome(active: boolean, goHome: GoHome): void {
  const claim = useContext(ClaimContext);
  const latest = useRef(goHome);
  latest.current = goHome;

  useEffect(() => {
    if (!active) return;
    return claim(() => latest.current());
  }, [active, claim]);
}
