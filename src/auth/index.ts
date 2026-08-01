import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";

const provider = new GoogleAuthProvider();

/**
 * Popup rather than redirect. Redirect sign-in depends on third-party storage
 * behavior that modern mobile browsers keep tightening, and popup is the
 * currently recommended path for web. Two users will ever do this, once each,
 * per device.
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

/** Returns the unsubscribe function. Call it on unmount. */
export function watchAuth(onChange: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, onChange);
}

export function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No signed-in user. The UI must gate on watchAuth before calling repositories.");
  return uid;
}
