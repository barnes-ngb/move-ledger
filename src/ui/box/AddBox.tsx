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
import { useBackGuard } from "../history";
import { BackBar, Button, ErrorLine, Field, Sheet } from "../kit";
import { useOfferHome } from "../nav";
import { AiSummary } from "./AiSummary";
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
  // The leave sheet covers the screen, so a failure while deleting has to be
  // readable on the sheet. The error line under the fields is behind it.
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  /**
   * The draft as the subscription currently has it, which is not what
   * `container` holds. That state is written once by `reserveContainer` and
   * never again, so anything written to this box while the screen is open is
   * invisible to it. A contents summary is exactly that: it is produced in the
   * background after the photo uploads, so it usually lands while the person is
   * still standing here packing the same box.
   *
   * The fallback is the window between the reserve and the listener's first
   * delivery, when the document is in the local cache and not yet in the prop.
   */
  const live = container
    ? (containers.find((c) => c.id === container.id) ?? container)
    : null;

  // This screen takes the header title from Home while it is open, so the way
  // home asks about the draft rather than stranding it. All three exits ask
  // the same question in the same words.
  useOfferHome(true, () => setLeaving(true));

  // The third exit is the phone's own back gesture, which would otherwise
  // strand the draft silently, which is the whole thing APPLY-10 fixed. The
  // guard puts the entry back and asks instead. It is released on the way out,
  // because leaving is a navigation and a guard still standing refuses it too.
  const releaseBack = useBackGuard(true, () => setLeaving(true));

  function exit() {
    releaseBack();
    onLeave();
  }

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

  /**
   * Saves the live document rather than the one reserved on mount.
   *
   * `saveContainer` rebuilds `searchText` from whatever it is handed, so the
   * stale copy took the box's own words back out of it: a summary that arrived
   * while this screen was open, or a contents list accepted on it a moment ago,
   * was stored and unfindable until the next write to that box.
   */
  function save(andNext: boolean) {
    if (!live) return;
    setError(null);
    try {
      const trimmed = note.trim();
      // Conditional spread. An explicit undefined here throws at the write.
      const next: Container = {
        ...live,
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
        exit();
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
   *
   * The delete is the one thing on this screen that is waited on, and it is
   * the same shape box detail has used since APPLY-09. What is awaited is the
   * guard rather than the network: `deleteContainer` reads the stored document
   * and refuses a box that has been written on, which offline is answered by
   * the cache. The Firestore write behind it goes to the background like
   * everything else here. Leaving before the guard has answered would tell
   * somebody their number went back to the range while it did not, and the
   * screen that would have said otherwise is gone by then.
   */
  function leave(deleteDraft: boolean) {
    if (!deleteDraft || !container) {
      setLeaving(false);
      exit();
      return;
    }
    void removeDraft(container.id);
  }

  async function removeDraft(id: string) {
    setSheetError(null);
    setDeleting(true);
    try {
      const { written } = await deleteContainer(moveId, id, uid);
      writeInBackground(written, () =>
        setError("This box is deleted on your phone. The other phone has not caught up yet.")
      );
      setDeleting(false);
      setLeaving(false);
      exit();
    } catch (e) {
      // Stay on the sheet. The draft is still there, the number is still
      // spent, and Keep the draft is still an answer.
      setDeleting(false);
      setSheetError(
        e instanceof Error ? e.message : "Could not delete the draft. It is still in the box list."
      );
    }
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
        {live ? (
          <div className="mt-6">
            <PhotoStrip
              moveId={moveId}
              containerId={live.id}
              uid={uid}
              photos={photos}
            />
          </div>
        ) : null}

        {/* The suggestion, where it arrives rather than where it was first
            built. A summary is written in the background after a photo
            uploads, so it usually lands while the person is still on this
            screen, and until now the only way to read it was to save the box,
            leave, and open it again from the list.

            The same component box detail mounts, doing the same four things.
            It renders nothing until there is a suggestion, and everything it
            writes goes through the repositories rather than through this
            screen, so the room, the note, and the photos are untouched by any
            of it. The key resets its edit state at the box boundary: Save and
            next swaps the container underneath it, and a half-typed edit of
            one box's suggestion must not be sitting in the next one's. */}
        {live ? (
          <div className="mt-6">
            <AiSummary
              key={live.id}
              moveId={moveId}
              container={live}
              zones={zones}
              photos={photos.map((v) => v.photo)}
              uid={uid}
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
              <ErrorLine message={sheetError} />
              <Button onClick={() => leave(true)} disabled={deleting}>
                {deleting ? "Deleting the draft" : "Delete the draft"}
              </Button>
              <Button onClick={() => leave(false)} disabled={deleting} tone="quiet">
                Keep the draft
              </Button>
            </>
          ) : (
            <Button onClick={() => leave(false)}>Leave</Button>
          )}
          <Button onClick={() => setLeaving(false)} disabled={deleting} tone="quiet">
            Stay on this box
          </Button>
        </Sheet>
      ) : null}
    </div>
  );
}
