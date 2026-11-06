import { useCallback, useEffect, useState } from "react";
import type { CareNeed } from "../domain";
import { watchCare } from "../repositories";

export interface CareSet {
  needs: CareNeed[];
  /** The listener has delivered at least once. Before that an empty list says nothing. */
  loaded: boolean;
  /** The listener stopped. `needs` holds whatever arrived before that. */
  failed: boolean;
  retry: () => void;
}

/**
 * Opened only while `active`, because the care screen is one screen among
 * several and nothing else on the move reads this collection. The persistent
 * cache serves it offline, the same as every other listener.
 */
export function useCare(moveId: string | null, active: boolean): CareSet {
  const [needs, setNeeds] = useState<CareNeed[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoaded(false);
    if (!moveId || !active) {
      setNeeds([]);
      return;
    }
    return watchCare(
      moveId,
      (next) => {
        setNeeds(next);
        setLoaded(true);
      },
      () => setFailed(true)
    );
  }, [moveId, active, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { needs, loaded, failed, retry };
}
