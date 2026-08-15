import { useState } from "react";
import type { Container, Zone } from "../../domain";
import { canDelete, hasCondition, isVoided, nextStatuses } from "../../domain";
import type { ConditionKey } from "../../domain/conditions";
import {
  clearContainerCondition,
  deleteContainer,
  reportContainerCondition,
  saveContainer,
  setStatus,
  setTitle,
  unvoidContainer,
  voidContainer,
  writeInBackground,
} from "../../repositories";
import { usePhotos } from "../../hooks/usePhotos";
import { Button, Confirm, ErrorLine, Field } from "../kit";
import { AiSummary } from "./AiSummary";
import { PhotoStrip } from "./PhotoStrip";
import { RoomPicker } from "./RoomPicker";

const SAVED_HERE = "This change is saved on your phone. It has not reached the other phone yet.";

/**
 * Detail and correction. Backward status moves are allowed because
 * corrections happen on move day, and a system that refuses them gets worked
 * around with a marker and a lie.
 *
 * Like Add box, nothing here waits on the server. A Firestore write promise
 * settles on acknowledgment, so awaiting one offline would leave every button
 * on this screen disabled while the local cache already holds the change.
 */
export function BoxDetail({
  moveId,
  container,
  zones,
  uid,
  onClose,
}: {
  moveId: string;
  container: Container;
  zones: readonly Zone[];
  uid: string;
  onClose: () => void;
}) {
  const [title, setTitleText] = useState(container.title ?? "");
  const [note, setNote] = useState(container.notes ?? "");
  const [editingRoom, setEditingRoom] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photos = usePhotos(moveId, container.id);

  const zone = zones.find((z) => z.id === container.destinationZoneId);
  const forward = nextStatuses(container.status);
  const voided = isVoided(container);
  const deletable = canDelete(container);

  function run(write: () => { written: Promise<unknown> }) {
    setError(null);
    try {
      writeInBackground(write().written, () => setError(SAVED_HERE));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }

  function saveField(patch: Partial<Container>) {
    run(() => saveContainer(moveId, { ...container, ...patch }, zones, uid));
  }

  function toggleCondition(key: ConditionKey) {
    run(() =>
      hasCondition(container, key)
        ? clearContainerCondition(moveId, container, key, uid)
        : // No note and no photos. The report is the fact that somebody said
          // so, and asking for more at the moment of saying it is what stops
          // people saying it at all.
          reportContainerCondition(moveId, container, key, { photoIds: [] }, uid)
    );
  }

  /**
   * The one irreversible action in the app, and the only place a number can be
   * freed. `canDelete` decides which of the two happens; this screen only
   * reports which one it will be.
   */
  async function removeBox() {
    setConfirming(false);
    if (!deletable) {
      run(() => voidContainer(moveId, container, uid));
      return;
    }
    setError(null);
    try {
      const { written } = await deleteContainer(moveId, container.id, uid);
      writeInBackground(written, () => setError(SAVED_HERE));
      // The box is gone from the local cache already, so staying here would
      // land on the screen that says so.
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this box.");
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <span className="font-mono text-5xl font-bold text-slate-50">{container.displayCode}</span>
        {zone ? (
          <span className="flex items-center gap-2">
            <span className="size-6 rounded-full" style={{ backgroundColor: zone.colorValue }} />
            <span className="text-xl text-slate-200">{zone.name}</span>
          </span>
        ) : (
          <span className="text-slate-500">No room</span>
        )}
      </div>

      {voided ? (
        <div className="rounded-2xl bg-amber-500/15 p-4">
          <p className="font-semibold text-amber-200">Voided</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-100/80">
            Number {container.displayCode} is retired. It will not be given to another box.
          </p>
        </div>
      ) : null}

      {/* Conditions sit alongside status per ADR-0003, so they are read where
          the number is read rather than folded into the status line. */}
      {hasCondition(container, "missing") || hasCondition(container, "damaged") ? (
        <div className="flex gap-2">
          {hasCondition(container, "missing") ? <Badge>Missing</Badge> : null}
          {hasCondition(container, "damaged") ? <Badge>Damaged</Badge> : null}
        </div>
      ) : null}

      {/* A box does not stop accepting photos. Something arrives crushed at
          the other end and the picture is taken then. */}
      <PhotoStrip moveId={moveId} containerId={container.id} uid={uid} photos={photos} />

      {container.contentsSummary ? (
        <div>
          <p className="text-sm text-slate-400">Contents</p>
          <p className="mt-1 text-lg leading-relaxed text-slate-200">{container.contentsSummary}</p>
        </div>
      ) : null}

      <AiSummary
        moveId={moveId}
        container={container}
        zones={zones}
        photos={photos.map((v) => v.photo)}
        uid={uid}
      />

      {/* A voided box keeps its photos and its number on screen, because those
          are what somebody came here to check. Everything that changes it is
          gone until the void is undone. */}
      {voided ? null : (
        <>
          <div>
            <p className="text-sm text-slate-400">Status</p>
            <p className="text-xl text-slate-100">{container.status}</p>
            <div className="mt-3 flex flex-col gap-2">
              {forward.map((s) => (
                <Button
                  key={s}
                  onClick={() => run(() => setStatus(moveId, container, s, uid))}
                  tone="quiet"
                >
                  Mark {s}
                </Button>
              ))}
            </div>
          </div>

          {/* Status is untouched by either of these. A crushed box that is on
              the truck stays loaded and gains a damaged report. */}
          <div className="flex flex-col gap-2">
            <p className="text-sm text-slate-400">Condition</p>
            <Button onClick={() => toggleCondition("missing")} tone="quiet">
              {hasCondition(container, "missing") ? "Mark found" : "Report missing"}
            </Button>
            <Button onClick={() => toggleCondition("damaged")} tone="quiet">
              {hasCondition(container, "damaged") ? "Mark undamaged" : "Report damaged"}
            </Button>
          </div>

          <div>
            <Field label="Title" value={title} onChange={setTitleText} placeholder="winter coats" />
            <div className="mt-3">
              <Button
                onClick={() => run(() => setTitle(moveId, container, title, zones, uid))}
                disabled={title.trim() === (container.title ?? "")}
                tone="quiet"
              >
                Save title
              </Button>
            </div>
          </div>

          <div>
            <Field label="Note" value={note} onChange={setNote} />
            <div className="mt-3">
              <Button
                onClick={() => saveField(note.trim() ? { notes: note.trim() } : {})}
                disabled={note === (container.notes ?? "")}
                tone="quiet"
              >
                Save note
              </Button>
            </div>
          </div>

          {editingRoom ? (
            <RoomPicker
              zones={zones}
              selectedId={container.destinationZoneId}
              onSelect={(id) => {
                setEditingRoom(false);
                saveField({ destinationZoneId: id });
              }}
            />
          ) : (
            <Button onClick={() => setEditingRoom(true)} tone="quiet">
              Change room
            </Button>
          )}
        </>
      )}

      <ErrorLine message={error} />
      <Button onClick={onClose}>Done</Button>

      {/* Kept below Done and behind a rule, because a thumb reaching for the
          bottom of a scrolled screen must not land on this. */}
      <div className="mt-6 border-t border-slate-800 pt-6">
        {voided ? (
          <Button onClick={() => run(() => unvoidContainer(moveId, container, uid))} tone="quiet">
            Put this box back
          </Button>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="min-h-14 w-full text-lg text-rose-300 underline"
          >
            {deletable ? "Delete this box" : "Void this box"}
          </button>
        )}
      </div>

      {confirming ? (
        <Confirm
          title={
            deletable
              ? `Delete box ${container.displayCode}?`
              : `Void box ${container.displayCode}?`
          }
          detail={
            deletable
              ? `Nobody has written on this box, so number ${container.displayCode} goes back and will be given to the next box. Its photos go with it.`
              : `Box ${container.displayCode} stays in the list, marked voided. Its number is retired and will never be given to another box, because it may already be written on one.`
          }
          confirmLabel={deletable ? "Delete this box" : "Void this box"}
          onConfirm={() => void removeBox()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-amber-500/20 px-3 py-1 text-sm font-semibold text-amber-200">
      {children}
    </span>
  );
}
