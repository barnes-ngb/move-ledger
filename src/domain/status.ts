import type { ActivityEvent, Container, ContainerStatus } from "./schemas";

/** Pipeline order. Index position is what makes a transition forward or backward. */
export const STATUS_ORDER: readonly ContainerStatus[] = [
  "filling",
  "packed",
  "staged",
  "loaded",
  "unloaded",
  "opened",
  "emptied",
] as const;

/**
 * Legal forward moves. `packed` may skip `staged` because a box often goes
 * straight from the floor onto the truck.
 */
const FORWARD: Record<ContainerStatus, readonly ContainerStatus[]> = {
  filling: ["packed"],
  packed: ["staged", "loaded"],
  staged: ["loaded"],
  loaded: ["unloaded"],
  unloaded: ["opened"],
  opened: ["emptied"],
  emptied: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: ContainerStatus, to: ContainerStatus) {
    super(`A box cannot go from ${from} to ${to}.`);
    this.name = "IllegalTransitionError";
  }
}

export function statusIndex(status: ContainerStatus): number {
  return STATUS_ORDER.indexOf(status);
}

/** Any backward move is allowed, because corrections happen. Forward moves are constrained. */
export function canTransition(from: ContainerStatus, to: ContainerStatus): boolean {
  if (from === to) return false;
  if (statusIndex(to) < statusIndex(from)) return true;
  return FORWARD[from].includes(to);
}

/** The transitions to offer as primary buttons on the box detail screen. */
export function nextStatuses(from: ContainerStatus): readonly ContainerStatus[] {
  return FORWARD[from];
}

export interface TransitionResult {
  container: Container;
  event: Omit<ActivityEvent, "id">;
}

/**
 * The only place a container status changes. Returns the updated container and
 * the activity event that records the change. Neither is persisted here.
 */
export function transition(
  container: Container,
  to: ContainerStatus,
  actorId: string,
  now: string = new Date().toISOString()
): TransitionResult {
  if (!canTransition(container.status, to)) {
    throw new IllegalTransitionError(container.status, to);
  }
  const from = container.status;
  return {
    container: { ...container, status: to, updatedAt: now, updatedBy: actorId },
    event: {
      moveId: container.moveId,
      containerId: container.id,
      actorId,
      type: "status_changed",
      occurredAt: now,
      payload: { from, to, backward: statusIndex(to) < statusIndex(from) },
    },
  };
}
