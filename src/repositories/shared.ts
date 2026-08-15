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
 * A write that has been applied to the local cache and is on its way to the
 * server. `value` is the document as it was written, available immediately.
 * `written` settles when the server acknowledges it, which offline is never.
 *
 * The split exists because those are two different events and the interface
 * only ever needed the first one. Awaiting the second is what left Add box
 * showing "..." and both Save buttons disabled in a basement.
 */
export interface PendingWrite<T> {
  value: T;
  written: Promise<void>;
}

/** One `written` promise covering several writes, for a repository call that makes more than one. */
export function allWritten(...writes: Array<Promise<unknown>>): Promise<void> {
  return Promise.all(writes).then(() => undefined);
}

/**
 * Every write in the app funnels through these two functions. A document that
 * fails its schema never reaches Firestore, which keeps the database and
 * docs/02-domain-model.md in agreement by force rather than by discipline.
 *
 * Both are synchronous on purpose. Validation is synchronous, the local cache
 * write is synchronous, and the caller gets the parsed document without
 * waiting for a network it may not have. A schema failure still throws here,
 * before anything reaches Firestore.
 */
export function createValidated<T extends { id: string }>(
  ref: CollectionReference<DocumentData>,
  schema: ZodType<T>,
  value: T
): PendingWrite<T> {
  const parsed = schema.parse(value);
  return { value: parsed, written: setDoc(doc(ref, parsed.id), parsed) };
}

export function updateValidated<T extends { id: string }>(
  ref: CollectionReference<DocumentData>,
  schema: ZodType<T>,
  next: T
): PendingWrite<T> {
  const parsed = schema.parse(next);
  const { id, ...fields } = parsed;
  return { value: parsed, written: updateDoc(doc(ref, id), fields as DocumentData) };
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
  /**
   * Opts this listener into snapshots that carry no document change, only a
   * change of `SnapshotOrigin`. Off by default, which is the SDK's default.
   *
   * Needed by any caller that acts on the origin, because the acknowledgement
   * of a local write moves `hasPendingWrites` from true to false and touches
   * nothing else. Without this flag Firestore raises no event for that, and a
   * caller waiting on the server would wait forever.
   */
  watchMetadata?: boolean;
}

/**
 * Where the documents in a snapshot came from. Firestore reports this on every
 * snapshot; `subscribeValidated` passes it on rather than dropping it, so a
 * caller can tell a document the server has agreed to from one that exists
 * only on this phone.
 */
export interface SnapshotOrigin {
  /** True until the server has answered this query. Cache-only result. */
  fromCache: boolean;
  /** True while a document here holds a local write the server has not acknowledged. */
  hasPendingWrites: boolean;
}

/**
 * The server has these documents and agrees with them. A subcollection read
 * that depends on a parent document is only safe to open once its parent is
 * confirmed, because the rules run on the server against what the server has,
 * not against what this phone believes.
 */
export function serverConfirmed(origin: SnapshotOrigin): boolean {
  return !origin.fromCache && !origin.hasPendingWrites;
}

/**
 * Subscription helper. Documents that fail the schema on the way OUT are
 * dropped and reported rather than crashing the listener, because one bad
 * document must not brick the app on both phones at once.
 */
export function subscribeValidated<T>(
  ref: CollectionReference<DocumentData>,
  schema: ZodType<T>,
  onData: (items: T[], origin: SnapshotOrigin) => void,
  handlers?: SubscribeHandlers,
  ...constraints: QueryConstraint[]
): () => void {
  const reportBadDoc =
    handlers?.onBadDoc ?? ((id: string, e: unknown) => console.error(`Invalid document ${id}`, e));
  return onSnapshot(
    query(ref, ...constraints),
    { includeMetadataChanges: handlers?.watchMetadata ?? false },
    (snap) => {
      const items: T[] = [];
      for (const d of snap.docs) {
        const parsed = schema.safeParse({ ...d.data(), id: d.id });
        if (parsed.success) items.push(parsed.data);
        else reportBadDoc(d.id, parsed.error);
      }
      onData(items, {
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
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
