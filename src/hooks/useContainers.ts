import { useEffect, useState } from "react";
import type { Container } from "../domain";
import { watchContainers } from "../repositories";

/**
 * Separate from useMove because containers are the only collection that grows
 * without bound. The persistent cache holds them all, which is what makes
 * number reservation and Find work with no signal.
 */
export function useContainers(moveId: string | null): Container[] {
  const [containers, setContainers] = useState<Container[]>([]);
  useEffect(() => {
    if (!moveId) {
      setContainers([]);
      return;
    }
    return watchContainers(moveId, setContainers);
  }, [moveId]);
  return containers;
}
