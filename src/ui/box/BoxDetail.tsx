import { useState } from "react";
import type { Container, Zone } from "../../domain";
import { nextStatuses } from "../../domain";
import { saveContainer, setStatus } from "../../repositories";
import { Button, ErrorLine, Field } from "../kit";
import { RoomPicker } from "./RoomPicker";

/**
 * Detail and correction. Backward status moves are allowed because
 * corrections happen on move day, and a system that refuses them gets worked
 * around with a marker and a lie.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zone = zones.find((z) => z.id === container.destinationZoneId);
  const forward = nextStatuses(container.status);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
    setBusy(false);
  }

  function saveField(patch: Partial<Container>) {
    return run(async () => {
      await saveContainer(moveId, { ...container, ...patch }, zones, uid);
    });
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

      <div>
        <p className="text-sm text-slate-400">Status</p>
        <p className="text-xl text-slate-100">{container.status}</p>
        <div className="mt-3 flex flex-col gap-2">
          {forward.map((s) => (
            <Button
              key={s}
              onClick={() => void run(() => setStatus(moveId, container, s, uid))}
              disabled={busy}
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
            onClick={() => void saveField(note.trim() ? { notes: note.trim() } : {})}
            disabled={busy || note === (container.notes ?? "")}
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
            void saveField({ destinationZoneId: id });
          }}
        />
      ) : (
        <Button onClick={() => setEditingRoom(true)} disabled={busy} tone="quiet">
          Change room
        </Button>
      )}

      <ErrorLine message={error} />
      <Button onClick={onClose}>Done</Button>
    </div>
  );
}
