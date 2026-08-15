import { useEffect, useState } from "react";
import type { ActivityEvent, Container, ContainerPhoto } from "../domain";
import { watchActivity, watchContainers, watchPhotos } from "../repositories";

export interface ExportSources {
  containers: Container[];
  photos: ContainerPhoto[];
  activity: ActivityEvent[];
  /** A listener stopped. What arrived before it stopped is still here. */
  failed: boolean;
}

/**
 * The three collections the export needs that nothing else on the setup screen
 * subscribes to. `useMove` already holds the move, the members, the rooms, and
 * the places.
 *
 * Opened only while `active`, the same way `usePhotoCounts` does it, because
 * doc 11 counts reads and activity is the collection that grows fastest. The
 * persistent cache serves these listeners from disk and the server sends only
 * what changed since, so the second export of a day is close to free, and an
 * export with no signal at all is the local cache written to a file.
 *
 * A stopped listener is reported rather than swallowed. An export is the one
 * screen where a short collection is worse than no file: a person exporting
 * for an insurance conversation would have no way to tell that half their
 * boxes are missing from it.
 */
export function useExportBundle(moveId: string | null, active: boolean): ExportSources {
  const [containers, setContainers] = useState<Container[]>([]);
  const [photos, setPhotos] = useState<ContainerPhoto[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!moveId || !active) {
      setContainers([]);
      setPhotos([]);
      setActivity([]);
      setFailed(false);
      return;
    }
    const fail = () => setFailed(true);
    const stop = [
      watchContainers(moveId, setContainers, fail),
      watchPhotos(moveId, setPhotos, fail),
      watchActivity(moveId, setActivity, fail),
    ];
    return () => stop.forEach((fn) => fn());
  }, [moveId, active]);

  return { containers, photos, activity, failed };
}
