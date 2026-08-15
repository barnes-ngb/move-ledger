import type { Container } from "./schemas";

/**
 * A box never written on cardboard can be deleted, because its number is
 * genuinely free. Any other box is voided instead: the document stays so
 * nextSequenceNumber keeps counting past it, which stops a retired number
 * being reissued to a second physical box.
 */
export function canDelete(container: Container): boolean {
  return container.status === "filling" && container.labelConfirmedAt === undefined;
}

export function isVoided(container: Container): boolean {
  return container.voidedAt !== undefined;
}

/**
 * Thrown rather than returned, because there is no sensible way to carry on. A
 * caller that reaches this has asked to free a number that a piece of cardboard
 * is already wearing.
 */
export class ContainerNotDeletableError extends Error {
  constructor(public readonly container: Pick<Container, "id" | "displayCode">) {
    super(`Box ${container.displayCode} has been written on, so its number cannot be freed.`);
    this.name = "ContainerNotDeletableError";
  }
}
