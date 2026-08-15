import { useEffect, useRef, useState } from "react";
import type { Container, MoveMember, Zone } from "../../domain";
import { RangeExhaustedError, remainingInRange } from "../../domain";
import { reserveContainer, saveContainer, setStatus, writeInBackground } from "../../repositories";
import { Button, ErrorLine, Field } from "../kit";
import { PhotoStrip } from "./PhotoStrip";
import { RoomPicker } from "./RoomPicker";
import { labelInstruction } from "./label";
import { usePhotos } from "../../hooks/usePhotos";

/**
 * Packing a box, without a wait in it.
 *
 * The number is reserved on mount, before any input exists, because it is
 * written on cardboard with a marker and must never change afterward. That is
 * why `filling` is a status: a box record exists from the moment its number
 * is claimed.
 *
 * Nothing on this screen awaits a Firestore write. Those promises settle when
 * the server acknowledges them, so awaiting one in a basement leaves the
 * number showing "..." and both Save buttons disabled for as long as the phone
 * stays there. The local cache has every document the moment it is written.
 */
export function AddBox({
  moveId,
  me,
  containers,
  zones,
  uid,
  onClose,
}: {
  moveId: string;
  me: MoveMember;
  containers: readonly Container[];
  zones: readonly Zone[];
  uid: string;
  onClose: () => void;
}) {
  const [container, setContainer] = useState<Container | null>(null);
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // StrictMode runs effects twice in development, and reserving is now
  // synchronous, so nothing else keeps the second run from burning a number.
  // The latch is released deliberately in save(), which is the only place a
  // second number is wanted. Burned numbers never refill.
  const reserved = useRef(false);
  /**
   * Boxes reserved on this screen, kept because the containers prop arrives
   * through a subscription. Save and next reserves the next number in the same
   * tick as the save, and if the listener has not delivered the box just saved
   * yet, the highest known number would still be the previous one. Two boxes
   * with one number is the single mistake in this app that a marker makes
   * permanent.
   */
  const reservedHere = useRef<Container[]>([]);
  const photos = usePhotos(moveId, container?.id ?? null);

  function reserve() {
    if (reserved.current) return;
    reserved.current = true;
    setError(null);
    const known = [
      ...containers,
      ...reservedHere.current.filter((c) => !containers.some((k) => k.id === c.id)),
    ];
    try {
      const { value, written } = reserveContainer(moveId, me, known, uid);
      reservedHere.current = [...reservedHere.current, value];
      setContainer(value);
      writeInBackground(written, () =>
        setError("This box is saved on your phone. It has not reached the other phone yet.")
      );
    } catch (e) {
      setError(
        e instanceof RangeExhaustedError
          ? "Your box numbers are used up. Tell the other person before you keep packing."
          : "Could not reserve a number."
      );
    }
  }

  useEffect(() => {
    reserve();
    // Reserve exactly once per mount of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(andNext: boolean) {
    if (!container) return;
    setError(null);
    try {
      const trimmed = note.trim();
      // Conditional spread. An explicit undefined here throws at the write.
      const next: Container = {
        ...container,
        ...(roomId ? { destinationZoneId: roomId } : {}),
        ...(trimmed ? { notes: trimmed } : {}),
        labelConfirmedAt: new Date().toISOString(),
      };
      const saved = saveContainer(moveId, next, zones, uid);
      const packed = setStatus(moveId, saved.value, "packed", uid);
      writeInBackground(Promise.all([saved.written, packed.written]), () =>
        setError("This box is saved on your phone. It has not reached the other phone yet.")
      );
      reservedHere.current = reservedHere.current.map((c) => (c.id === packed.value.id ? packed.value : c));

      if (andNext) {
        setContainer(null);
        setRoomId(undefined);
        setNote("");
        reserved.current = false;
        reserve();
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the box.");
    }
  }

  const room = zones.find((z) => z.id === roomId);
  const left = remainingInRange(me, containers.map((c) => c.sequenceNumber));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        {/* The label instruction. Written before anything else is decided. */}
        <div className="rounded-3xl bg-slate-800 p-6 text-center">
          <p className="text-sm text-slate-400">Write on the box</p>
          <p className="mt-2 font-mono text-7xl font-bold tracking-wider text-slate-50">
            {container ? container.displayCode : "..."}
          </p>
          {room ? (
            <p className="mt-2 text-2xl font-semibold" style={{ color: room.colorValue }}>
              {room.colorName}
            </p>
          ) : (
            <p className="mt-2 text-slate-500">Pick a room for the color</p>
          )}
          <span className="sr-only">
            {container ? labelInstruction(container.displayCode, room?.colorName) : ""}
          </span>
        </div>

        {/* Photos attach while the box fills, layer by layer, not after it is sealed. */}
        {container ? (
          <div className="mt-6">
            <PhotoStrip
              moveId={moveId}
              containerId={container.id}
              uid={uid}
              photos={photos}
            />
          </div>
        ) : null}

        {left <= 25 ? (
          <p className="mt-4 text-sm text-amber-300">{left} box numbers left in your range.</p>
        ) : null}

        <div className="mt-6">
          <RoomPicker zones={zones} selectedId={roomId} onSelect={setRoomId} />
        </div>

        <div className="mt-6">
          <Field label="Note, optional" value={note} onChange={setNote} placeholder="kettle and mugs" />
        </div>

        <ErrorLine message={error} />
      </div>

      {/* Pinned below the scroll area so the keyboard never covers it. */}
      <div className="flex flex-col gap-3 border-t border-slate-800 p-4">
        <Button onClick={() => save(true)} disabled={!container}>
          Save and next
        </Button>
        <Button onClick={() => save(false)} disabled={!container} tone="quiet">
          Save and finish
        </Button>
      </div>
    </div>
  );
}
