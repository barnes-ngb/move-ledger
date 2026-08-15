import { useState } from "react";
import type { Container, Zone } from "../../domain";
import { nextStatuses } from "../../domain";
import { saveContainer, setStatus, writeInBackground } from "../../repositories";
import { usePhotos } from "../../hooks/usePhotos";
import { Button, ErrorLine, Field } from "../kit";
import { AiSummary } from "./AiSummary";
import { PhotoStrip } from "./PhotoStrip";
import { RoomPicker } from "./RoomPicker";

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
  const [note, setNote] = useState(container.notes ?? "");
  const [editingRoom, setEditingRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photos = usePhotos(moveId, container.id);

  const zone = zones.find((z) => z.id === container.destinationZoneId);
  const forward = nextStatuses(container.status);

  function run(write: () => { written: Promise<unknown> }) {
    setError(null);
    try {
      writeInBackground(write().written, () =>
        setError("This change is saved on your phone. It has not reached the other phone yet.")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }

  function saveField(patch: Partial<Container>) {
    run(() => saveContainer(moveId, { ...container, ...patch }, zones, uid));
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

      <ErrorLine message={error} />
      <Button onClick={onClose}>Done</Button>
    </div>
  );
}
