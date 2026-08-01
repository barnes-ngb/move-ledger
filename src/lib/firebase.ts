import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { firebaseConfig, configIsFilled } from "./firebase-config";

if (!configIsFilled()) {
  throw new Error(
    "firebase-config.ts still has FILL_ME values. Complete the console walkthrough and paste the web app config."
  );
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

/**
 * Persistent local cache is the offline story for everything except photo
 * bytes. Reads serve from disk, writes queue on disk and replay on reconnect,
 * surviving app restarts. See docs/05-system-architecture.md.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const storage = getStorage(app);
