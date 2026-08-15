import { useEffect, useState } from "react";
import { watchPhotos } from "../repositories";

/**
 * Whether this move has any photo at all. Doc 07 asks the privacy question
 * only once there is something to send, so a move with no photos is never
 * interrupted by it.
 *
 * The listener opens only while `active`, which is only while `aiEnabled` is
 * absent. Once anyone answers, it never opens again for the life of the move,
 * which is what keeps this off the doc 11 read budget.
 */
export function useHasAnyPhoto(moveId: string | null, active: boolean): boolean {
  const [has, setHas] = useState(false);

  useEffect(() => {
    if (!moveId || !active) {
      setHas(false);
      return;
    }
    return watchPhotos(moveId, (photos) => setHas(photos.length > 0));
  }, [moveId, active]);

  return has;
}
