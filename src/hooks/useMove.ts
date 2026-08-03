import { useCallback, useEffect, useState } from "react";
import type { Location, Move, MoveMember, Zone } from "../domain";
import { watchLocations, watchMembers, watchMoves, watchZones } from "../repositories";

export interface MoveContext {
  loading: boolean;
  /**
   * A listener stopped. Whatever arrived before it stopped is still in the
   * other fields, so a caller can show the failure without discarding data.
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

/**
 * One subscription set for the whole app. The persistent cache serves these
 * from disk on a cold start, so a phone in a garage with no signal shows real
 * data rather than a spinner.
 *
 * A failed listener is a terminal event: Firestore reports it once and never
 * calls the success path again. So `loading` is cleared on the error path as
 * well as the data path. Without that the app sits on "Loading" for as long as
 * the phone is open, which is exactly how this was found.
 */
export function useMove(uid: string): MoveContext {
  const [move, setMove] = useState<Move | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [members, setMembers] = useState<MoveMember[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  // Bumping this re-runs both effects, which is the whole of retry.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    return watchMoves(
      uid,
      (moves) => {
        setMove(moves[0] ?? null);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setFailed(true);
      }
    );
  }, [uid, attempt]);

  useEffect(() => {
    if (!move) {
      setMembers([]);
      setZones([]);
      setLocations([]);
      return;
    }
    // Any of the three failing is a failure of the whole context. Members in
    // particular: with no member records `me` stays null, and a screen that
    // trusts that would tell the owner of the move she is waiting for an
    // invite she already has.
    const fail = () => setFailed(true);
    const stop = [
      watchMembers(move.id, setMembers, fail),
      watchZones(move.id, setZones, fail),
      watchLocations(move.id, setLocations, fail),
    ];
    return () => stop.forEach((fn) => fn());
  }, [move?.id, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  return {
    loading,
    failed,
    retry,
    move,
    members,
    zones,
    locations,
    me: members.find((m) => m.uid === uid) ?? null,
  };
}
