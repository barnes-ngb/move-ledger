import { useCallback, useEffect, useState } from "react";
import type { Container } from "../domain";
import { watchContainers } from "../repositories";

export interface ContainerSet {
  containers: Container[];
  /** The listener stopped. `containers` holds whatever arrived before that. */
  failed: boolean;
  retry: () => void;
}

/**
 * Separate from useMove because containers are the only collection that grows
 * without bound. The persistent cache holds them all, which is what makes
 * number reservation and Find work with no signal.
 *
 * Returns an object rather than the bare array because an empty array and a
 * dead listener look identical to a caller, and the difference matters here:
 * one means no boxes yet, the other means the count on screen is wrong.
 */
export function useContainers(moveId: string | null): ContainerSet {
  const [containers, setContainers] = useState<Container[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!moveId) {
      setContainers([]);
      return;
    }
    return watchContainers(moveId, setContainers, () => setFailed(true));
  }, [moveId, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { containers, failed, retry };
}
