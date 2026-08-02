import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { watchAuth } from "../auth";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: User };

/**
 * The gate every screen sits behind. `loading` is a real state rather than a
 * flash of the sign-in screen, because Firebase resolves the persisted
 * session asynchronously on every cold start.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  useEffect(
    () => watchAuth((user) => setState(user ? { status: "signedIn", user } : { status: "signedOut" })),
    []
  );
  return state;
}
