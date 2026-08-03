import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  type CollectionReference,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
} from "firebase/firestore";
import type { ZodType } from "zod";

/**
 * Every write in the app funnels through these two functions. A document that
 * fails its schema never reaches Firestore, which keeps the database and
 * docs/02-domain-model.md in agreement by force rather than by discipline.
 */
export async function createValidated<T extends { id: string }>(
  ref: CollectionReference<DocumentData>,
  schema: ZodType<T>,
  value: T
): Promise<T> {
  const parsed = schema.parse(value);
  await setDoc(doc(ref, parsed.id), parsed);
  return parsed;
}

export async function updateValidated<T extends { id: string }>(
  ref: CollectionReference<DocumentData>,
  schema: ZodType<T>,
  next: T
): Promise<T> {
  const parsed = schema.parse(next);
  const { id, ...fields } = parsed;
  await updateDoc(doc(ref, id), fields as DocumentData);
  return parsed;
}

/**
 * The two things that can go wrong on a listener, kept apart because they are
 * not the same event and the interface answers them differently.
 *
 * `onBadDoc` is one document failing its schema. The listener survives, the
 * other documents arrive, and the app keeps working.
 *
 * `onError` is the listener itself stopping. Firestore calls it once, for a
 * denied read or a query the rules refuse, and never calls the success path
 * again. Anything waiting on first data has to be released here or it waits
 * forever.
 *
 * They arrive as one optional object rather than two positional parameters so
 * that the rest parameter holding the query constraints stays last and no
 * caller has to write `undefined, undefined` to reach it.
 */
export interface SubscribeHandlers {
  onBadDoc?: (id: string, error: unknown) => void;
  onError?: (error: unknown) => void;
}

/**
 * Subscription helper. Documents that fail the schema on the way OUT are
 * dropped and reported rather than crashing the listener, because one bad
 * document must not brick the app on both phones at once.
 */
export function subscribeValidated<T>(
  ref: CollectionReference<DocumentData>,
  schema: ZodType<T>,
  onData: (items: T[]) => void,
  handlers?: SubscribeHandlers,
  ...constraints: QueryConstraint[]
): () => void {
  const reportBadDoc =
    handlers?.onBadDoc ?? ((id: string, e: unknown) => console.error(`Invalid document ${id}`, e));
  return onSnapshot(
    query(ref, ...constraints),
    (snap) => {
      const items: T[] = [];
      for (const d of snap.docs) {
        const parsed = schema.safeParse({ ...d.data(), id: d.id });
        if (parsed.success) items.push(parsed.data);
        else reportBadDoc(d.id, parsed.error);
      }
      onData(items);
    },
    (error) => {
      // Logged whether or not a caller handles it. The console keeps the
      // actual reason, which never reaches a user-facing string.
      console.error("Subscription stopped", error);
      handlers?.onError?.(error);
    }
  );
}

export function moveScoped(db: Firestore, moveId: string, sub: string): CollectionReference<DocumentData> {
  return collection(db, "moves", moveId, sub);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}
