/**
 * Firebase web app config. Filled by hand after the console setup walkthrough,
 * step 6. These values identify the project; they do not authorize anything.
 * Authorization lives in firestore.rules and storage.rules. This file is
 * committed on purpose.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyCsnmFkiAILXbxuEYfIMpRuhqzqSQ8w1ps",
  authDomain: "move-ledger.firebaseapp.com",
  projectId: "move-ledger",
  storageBucket: "move-ledger.firebasestorage.app",
  messagingSenderId: "1012528589337",
  appId: "1:1012528589337:web:71107b53f57f8df5121888",
} as const;

export function configIsFilled(): boolean {
  return !Object.values(firebaseConfig).some((v) => v.startsWith("FILL_ME"));
}
