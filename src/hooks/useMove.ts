import { useCallback, useEffect, useState } from "react";
import type { Location, Move, MoveMember, Zone } from "../domain";
import { watchLocations, watchMembers, watchMoves, watchZones } from "../repositories";
import { serverConfirmed, type SnapshotOrigin } from "../repositories/shared";

export interface MoveContext {
  loading: boolean;
  /**
   * A listener stopped and its retries are spent. Whatever arrived before it
   * stopped is still in the other fields, so a caller can show the failure
   * without discarding data.
   */
  failed: boolean;
  /** Tears down every listener in this hook and subscribes again. */
  retry: () => void;
  move: Move | null;
  members: MoveMember[];
  zones: Zone[];
  locations: Location[];
  /** The signed-in user's own member record. Null until setup creates it. */
  me: MoveMember | null;
}

/** Waited out before each re-subscribe. The length of this is the budget. */
const RETRY_DELAYS_MS = [300, 1200, 3000];

/**
 * How long a move that the server has not confirmed is given before its
 * subcollections are read anyway. Offline that wait never ends on its own, and
 * an offline phone must still reach its own move, so the wait has to expire.
 */
const UNCONFIRMED_GRACE_MS = 4000;

type Stop = () => void;

/**
 * Wraps a listener so a single stop is not the end of it. Firestore reports a
 * failure once and never calls the success path again, so recovery means
 * opening a new listener, which is what this does on a short backoff before it
 * gives up and reports the failure onward.
 *
 * The budget resets whenever data arrives. A listener that ran for an hour and
 * then died is not carrying the two denials it survived at startup.
 */
function subscribeWithRetry<A extends unknown[]>(
  open: (onData: (...args: A) => void, onError: () => void) => Stop,
  onData: (...args: A) => void,
  onExhausted: () => void
): Stop {
  let stop: Stop | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;
  let cancelled = false;

  const start = () => {
    if (cancelled) return;
    stop = open(
      (...args) => {
        retries = 0;
        onData(...args);
      },
      () => {
        stop?.();
        stop = null;
        if (cancelled) return;
        const delay = RETRY_DELAYS_MS[retries];
        if (delay === undefined) {
          onExhausted();
          return;
        }
        retries += 1;
        timer = setTimeout(start, delay);
      }
    );
  };

  start();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    stop?.();
  };
}

/**
 * One subscription set for the whole app. The persistent cache serves these
 * from disk on a cold start, so a phone in a garage with no signal shows real
 * data rather than a spinner.
 *
 * Two failure shapes are handled here and they are not the same.
 *
 * A listener that stops is recoverable. It retries on a backoff and only then
 * reports `failed`, because a denial at startup is usually a race rather than
 * a verdict and a permanent error screen is the wrong answer to a race.
 *
 * A move the server has not confirmed is not read at all. Everything under
 * `/moves/{id}` is authorized against the server's copy of that document, so
 * opening members, zones, and locations on a move that exists only in the
 * local cache denies all three at once. That is the startup race: watchMoves
 * yields from cache, three listeners open, three are denied. The gate is here
 * rather than in the rules because the rules are right.
 */
export function useMove(uid: string): MoveContext {
  const [move, setMove] = useState<Move | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [members, setMembers] = useState<MoveMember[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  // The move whose subcollections are cleared to open, either because the
  // server confirmed the document or because the grace period ran out. Held as
  // an id rather than a flag so that a later local edit to the move, which
  // arrives unconfirmed, does not tear down listeners that are already working.
  const [readyMoveId, setReadyMoveId] = useState<string | null>(null);
  // Bumping this re-runs every effect, which is the whole of retry.
  const [attempt, setAttempt] = useState(0);

  const ready = move !== null && readyMoveId === move.id;

  useEffect(() => {
    return subscribeWithRetry<[Move[], SnapshotOrigin]>(
      (onData, onError) => watchMoves(uid, onData, onError),
      (moves, origin) => {
        const next = moves[0] ?? null;
        setMove(next);
        if (next && serverConfirmed(origin)) setReadyMoveId(next.id);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setFailed(true);
      }
    );
  }, [uid, attempt]);

  useEffect(() => {
    if (!move || ready) return;
    const id = move.id;
    const timer = setTimeout(() => setReadyMoveId(id), UNCONFIRMED_GRACE_MS);
    return () => clearTimeout(timer);
  }, [move?.id, ready, attempt]);

  useEffect(() => {
    if (!move || !ready) {
      setMembers([]);
      setZones([]);
      setLocations([]);
      return;
    }
    const moveId = move.id;
    // Any of the three failing is a failure of the whole context. Members in
    // particular: with no member records `me` stays null, and a screen that
    // trusts that would tell the owner of the move she is waiting for an
    // invite she already has.
    const fail = () => setFailed(true);
    const stop = [
      subscribeWithRetry<[MoveMember[]]>((d, e) => watchMembers(moveId, d, e), setMembers, fail),
      subscribeWithRetry<[Zone[]]>((d, e) => watchZones(moveId, d, e), setZones, fail),
      subscribeWithRetry<[Location[]]>((d, e) => watchLocations(moveId, d, e), setLocations, fail),
    ];
    return () => stop.forEach((fn) => fn());
  }, [move?.id, ready, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  return {
    // An unconfirmed move is a wait, not a fault. The data is on its way and
    // no action from the person holding the phone makes it arrive sooner.
    loading: !failed && (loading || (move !== null && !ready)),
    failed,
    retry,
    move,
    members,
    zones,
    locations,
    me: members.find((m) => m.uid === uid) ?? null,
  };
}
