import { useState } from "react";
import type { Move, MoveMember } from "../../domain";
import { addMember, updateMove } from "../../repositories";
import { Button, ErrorLine, Field, Screen } from "../kit";

/**
 * The couch step from ADR-0005. The second person installs the app, signs in,
 * and reads her account id off her own screen. It is added here once and never
 * again.
 */
export function Members({
  move,
  members,
  onDone,
}: {
  move: Move;
  members: MoveMember[];
  onDone: () => void;
}) {
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const trimmed = uid.trim();
      if (members.some((m) => m.uid === trimmed)) throw new Error("That person is already on the move.");
      // memberUids first, so her device can read the move the moment it syncs.
      await updateMove({ ...move, memberUids: [...move.memberUids, trimmed] });
      await addMember(
        move.id,
        {
          uid: trimmed,
          displayName: name.trim(),
          role: "member",
          numberRangeStart: 500,
          numberRangeEnd: 999,
        },
        members
      );
      setUid("");
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that person.");
    }
    setBusy(false);
  }

  return (
    <Screen title="Who else is packing">
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.id} className="rounded-xl bg-slate-800 p-3">
            <p className="text-slate-100">{m.displayName}</p>
            <p className="text-sm text-slate-400">
              Boxes {m.numberRangeStart} to {m.numberRangeEnd}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-sm text-slate-400">
        On her phone: install the app, sign in, then read the account id off her own screen.
      </p>
      <Field label="Her name" value={name} onChange={setName} placeholder="Shelly" />
      <Field label="Her account id" value={uid} onChange={setUid} />
      <ErrorLine message={error} />
      <Button onClick={() => void add()} disabled={busy || !uid.trim() || !name.trim()} tone="quiet">
        Add her
      </Button>
      <Button onClick={onDone}>Done</Button>
    </Screen>
  );
}
