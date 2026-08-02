import { useEffect, useState } from "react";
import type { Location, Move, MoveMember, Zone } from "../domain";
import { watchLocations, watchMembers, watchMoves, watchZones } from "../repositories";

export interface MoveContext {
  loading: boolean;
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
 */
export function useMove(uid: string): MoveContext {
  const [move, setMove] = useState<Move | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MoveMember[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    return watchMoves(uid, (moves) => {
      setMove(moves[0] ?? null);
      setLoading(false);
    });
  }, [uid]);

  useEffect(() => {
    if (!move) {
      setMembers([]);
      setZones([]);
      setLocations([]);
      return;
    }
    const stop = [
      watchMembers(move.id, setMembers),
      watchZones(move.id, setZones),
      watchLocations(move.id, setLocations),
    ];
    return () => stop.forEach((fn) => fn());
  }, [move?.id]);

  return {
    loading,
    move,
    members,
    zones,
    locations,
    me: members.find((m) => m.uid === uid) ?? null,
  };
}
