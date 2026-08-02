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
 * Subscription helper. Documents that fail the schema on the way OUT are
 * dropped and reported rather than crashing the listener, because one bad
 * document must not brick the app on both phones at once.
 */
export function subscribeValidated<T>(
  ref: CollectionReference<DocumentData>,
  schema: ZodType<T>,
  onData: (items: T[]) => void,
  onBadDoc?: (id: string, error: unknown) => void,
  ...constraints: QueryConstraint[]
): () => void {
  const report = onBadDoc ?? ((id: string, e: unknown) => console.error(`Invalid document ${id}`, e));
  return onSnapshot(query(ref, ...constraints), (snap) => {
    const items: T[] = [];
    for (const d of snap.docs) {
      const parsed = schema.safeParse({ ...d.data(), id: d.id });
      if (parsed.success) items.push(parsed.data);
      else report(d.id, parsed.error);
    }
    onData(items);
  });
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
