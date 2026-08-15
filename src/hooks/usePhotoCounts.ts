import { useEffect, useState } from "react";
import { watchPhotos } from "../repositories";

/**
 * How many photos each box has, for the list. Photo documents are small and
 * this move will hold a few hundred of them, so one listener over the move's
 * photos costs less than a query per row.
 *
 * The listener opens only while `active`, which is only while the list is on
 * screen, for the same reason `useHasAnyPhoto` does it: doc 11 counts reads.
 */
export function usePhotoCounts(moveId: string | null, active: boolean): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!moveId || !active) {
      setCounts({});
      return;
    }
    return watchPhotos(moveId, (photos) => {
      const next: Record<string, number> = {};
      for (const p of photos) next[p.containerId] = (next[p.containerId] ?? 0) + 1;
      setCounts(next);
    });
  }, [moveId, active]);

  return counts;
}
