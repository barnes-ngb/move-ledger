import { useEffect, useRef, useState } from "react";
import type { Container, MoveMember, Zone } from "../../domain";
import { RangeExhaustedError, remainingInRange } from "../../domain";
import {
  deleteContainer,
  reserveContainer,
  saveContainer,
  setStatus,
  writeInBackground,
} from "../../repositories";
import { BackBar, Button, ErrorLine, Field, Sheet } from "../kit";
import { useOfferHome } from "../nav";
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
  onLeave,
}: {
  moveId: string;
  me: MoveMember;
  containers: readonly Container[];
  zones: readonly Zone[];
  uid: string;
  onLeave: () => void;
}) {
  const [container, setContainer] = useState<Container | null>(null);
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
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

  // This screen takes the header title from Home while it is open, so the way
  // home asks about the draft rather than stranding it. Both exits ask the
  // same question in the same words.
  useOfferHome(true, () => setLeaving(true));

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
        onLeave();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the box.");
    }
  }

  /**
   * Leaving without saving. The number was reserved on mount and is spent
   * either way, so the only question worth asking is whether the draft goes
   * with it. Deleting returns the number to the range, which is safe here and
   * only here: nothing has been written on cardboard yet, which is exactly
   * what `canDelete` reads.
   *
   * Keeping it is a real answer rather than a soft cancel. Drafts appear in
   * the box list and can be finished or deleted from box detail, so somebody
   * who was interrupted mid-box does not have to decide about it now.
   */
  function leave(deleteDraft: boolean) {
    setLeaving(false);
    if (!deleteDraft || !container) {
      onLeave();
      return;
    }
    const id = container.id;
    setError(null);
    // Fired rather than awaited, like every other write on this screen. The
    // delete is applied to the local cache before the promise settles, so the
    // list this returns to has already lost the draft.
    void deleteContainer(moveId, id, uid)
      .then(({ written }) => writeInBackground(written))
      .catch(() => undefined);
    onLeave();
  }

  const room = zones.find((z) => z.id === roomId);
  const left = remainingInRange(me, containers.map((c) => c.sequenceNumber));

  return (
    <div className="flex min-h-full flex-col">
      <BackBar onBack={() => setLeaving(true)} />
      <div className="flex-1 overflow-y-auto p-6 pt-2">
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
        {/* A dimmed button with no reason on it is the same as a broken one.
            There is no number, which is the only thing that disables these,
            and the reason it failed is on the error line above. */}
        {container ? null : (
          <p className="text-sm text-amber-300">
            No box number yet, so there is nothing to save. Go back and open Add box again.
          </p>
        )}
        <Button onClick={() => save(true)} disabled={!container}>
          Save and next
        </Button>
        <Button onClick={() => save(false)} disabled={!container} tone="quiet">
          Save and finish
        </Button>
      </div>

      {leaving ? (
        <Sheet
          title={container ? `Leave box ${container.displayCode}?` : "Leave without saving?"}
          detail={
            container
              ? `Nothing on this box is saved yet. Number ${container.displayCode} is already reserved for it: delete the draft and the number goes back to your range${photos.length > 0 ? `, along with the ${photos.length} photo${photos.length === 1 ? "" : "s"} on it` : ""}. Keep it and the draft stays in the box list, where you can finish it later.`
              : "No number was reserved, so there is no draft to decide about."
          }
        >
          {/* No container means the reserve failed, so there is nothing to
              delete and nothing to keep. One way out is the honest offer. */}
          {container ? (
            <>
              <Button onClick={() => leave(true)}>Delete the draft</Button>
              <Button onClick={() => leave(false)} tone="quiet">
                Keep the draft
              </Button>
            </>
          ) : (
            <Button onClick={() => leave(false)}>Leave</Button>
          )}
          <Button onClick={() => setLeaving(false)} tone="quiet">
            Stay on this box
          </Button>
        </Sheet>
      ) : null}
    </div>
  );
}
