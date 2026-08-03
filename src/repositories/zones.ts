import { deleteDoc, doc } from "firebase/firestore";
import { locationSchema, zoneSchema, type Location, type Zone } from "../domain/schemas";
import { db } from "../lib/firebase";
import { createValidated, moveScoped, newId, subscribeValidated, updateValidated } from "./shared";

const zones = (moveId: string) => moveScoped(db, moveId, "zones");
const locations = (moveId: string) => moveScoped(db, moveId, "locations");

export async function addLocation(moveId: string, loc: Omit<Location, "id" | "moveId">): Promise<Location> {
  return createValidated(locations(moveId), locationSchema, { ...loc, id: newId(), moveId });
}

export function watchLocations(
  moveId: string,
  onData: (l: Location[]) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(locations(moveId), locationSchema, onData, { onError });
}

export async function addZone(moveId: string, zone: Omit<Zone, "id" | "moveId">): Promise<Zone> {
  return createValidated(zones(moveId), zoneSchema, { ...zone, id: newId(), moveId });
}

export async function updateZone(moveId: string, next: Zone): Promise<Zone> {
  return updateValidated(zones(moveId), zoneSchema, next);
}

export function watchZones(
  moveId: string,
  onData: (z: Zone[]) => void,
  onError?: (error: unknown) => void
): () => void {
  return subscribeValidated(zones(moveId), zoneSchema, onData, { onError });
}

export async function removeZone(moveId: string, zoneId: string): Promise<void> {
  await deleteDoc(doc(zones(moveId), zoneId));
}
