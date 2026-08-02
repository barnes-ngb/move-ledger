import { useEffect, useRef, useState } from "react";
import type { Container, MoveMember, Zone } from "../../domain";
import { RangeExhaustedError, remainingInRange } from "../../domain";
import { reserveContainer, saveContainer, setStatus } from "../../repositories";
import { Button, ErrorLine, Field } from "../kit";
import { RoomPicker } from "./RoomPicker";
import { labelInstruction } from "./label";

/**
 * The twenty-second loop.
 *
 * The number is reserved on mount, before any input exists, because it is
 * written on cardboard with a marker and must never change afterward. That is
 * why `filling` is a status: a box record exists from the moment its number
 * is claimed.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // StrictMode runs effects twice in development. Without this guard the dev
  // build burns a box number on every mount, and burned numbers never refill.
  const reserving = useRef(false);

  async function reserve() {
    if (reserving.current) return;
    reserving.current = true;
    setError(null);
    try {
      const next = await reserveContainer(moveId, me, containers, uid);
      setContainer(next);
    } catch (e) {
      setError(
        e instanceof RangeExhaustedError
          ? "Your box numbers are used up. Tell the other person before you keep packing."
          : "Could not reserve a number. Check the connection."
      );
    }
    reserving.current = false;
  }

  useEffect(() => {
    void reserve();
    // Reserve exactly once per mount of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(andNext: boolean) {
    if (!container) return;
    setBusy(true);
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
      const saved = await saveContainer(moveId, next, zones, uid);
      await setStatus(moveId, saved, "packed", uid);

      if (andNext) {
        setContainer(null);
        setRoomId(undefined);
        setNote("");
        await reserve();
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the box.");
    }
    setBusy(false);
  }

  const room = zones.find((z) => z.id === roomId);
  const left = remainingInRange(me, containers.map((c) => c.sequenceNumber));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        {/* The label instruction. Written before anything else is decided. */}
        <div className="rounded-3xl bg-slate-800 p-6 text-center">
          <p className="text-sm text-slate-400">Write on the box</p>
          <p className="mt-2 font-mono text-6xl font-bold tracking-wider text-slate-50">
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
        <Button onClick={() => void save(true)} disabled={busy || !container}>
          Save and next
        </Button>
        <Button onClick={() => void save(false)} disabled={busy || !container} tone="quiet">
          Save and finish
        </Button>
      </div>
    </div>
  );
}
