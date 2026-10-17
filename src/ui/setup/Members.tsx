import { useState } from "react";
import { isRemoved, nextMemberRange, removalRefusal, type Move, type MoveMember } from "../../domain";
import { addMember, addMemberUid, removeMember, writeInBackground } from "../../repositories";
import { Button, Confirm, ErrorLine, Field, Screen } from "../kit";

/**
 * The couch step from ADR-0005, for as many people as are packing. Each one
 * installs the app, signs in, and reads their account id off their own screen.
 * They are added here once, and taken off here when the move no longer needs
 * them.
 *
 * The range is assigned rather than typed: the next block of 500 above every
 * range the move has ever handed out, removed members included, so a retired
 * range is never given to somebody else.
 */
export function Members({
  move,
  members,
  uid: myUid,
  onDone,
  onBack,
}: {
  move: Move;
  members: MoveMember[];
  /** The signed-in person, who can remove others but not themselves. */
  uid: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<MoveMember | null>(null);
  // A removal this phone has made and the server has not confirmed. Offline a
  // write promise neither resolves nor rejects, so this is the only honest
  // signal that the person still has access, and it clears itself on signal.
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);

  const range = nextMemberRange(members);

  function add() {
    setError(null);
    try {
      const trimmed = uid.trim();
      const existing = members.find((m) => m.uid === trimmed);
      if (existing && isRemoved(existing)) {
        throw new Error("That account was removed from this move and cannot be added again here.");
      }
      if (existing || move.memberUids.includes(trimmed)) throw new Error("That person is already on the move.");
      // memberUids first, so their device can read the move the moment it
      // reaches the server. Both writes are ordered by Firestore's own queue.
      // arrayUnion rather than a new array, so a removal another phone made
      // from its own copy is not undone by this one.
      const updated = addMemberUid(move.id, trimmed);
      const added = addMember(
        move.id,
        {
          uid: trimmed,
          displayName: name.trim(),
          role: "member",
          ...range,
        },
        members
      );
      writeInBackground(Promise.all([updated, added.written]), () =>
        setError("They are saved on this phone. Their phone will not see the move until this one has signal.")
      );
      setUid("");
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that person.");
    }
  }

  function remove(member: MoveMember) {
    setRemoving(null);
    setError(null);
    try {
      const removed = removeMember(move.id, member, myUid);
      setUnconfirmed(member.displayName);
      const confirmed = removed.written.then(() =>
        setUnconfirmed((name) => (name === member.displayName ? null : name))
      );
      writeInBackground(confirmed, () => {
        setUnconfirmed(null);
        setError(`Could not remove ${member.displayName}. They still have access.`);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove that person.");
    }
  }

  return (
    <Screen title="Who else is packing" onBack={onBack}>
      <ul className="flex flex-col gap-2">
        {members.map((m) => {
          const removed = isRemoved(m);
          const canRemove = removalRefusal(m, myUid) === null;
          return (
            <li key={m.id} className="flex items-center gap-3 rounded-xl bg-slate-800 p-3">
              <div className="min-w-0 flex-1">
                <p className={removed ? "text-slate-400" : "text-slate-100"}>
                  {m.displayName}
                  {removed ? <span className="ml-2 text-sm text-amber-300">removed</span> : null}
                </p>
                <p className="text-sm text-slate-400">
                  Boxes {m.numberRangeStart} to {m.numberRangeEnd}
                  {removed ? ", retired" : ""}
                </p>
              </div>
              {canRemove ? (
                <button
                  onClick={() => setRemoving(m)}
                  className="min-h-14 rounded-xl bg-slate-700 px-4 font-medium text-slate-100"
                >
                  Remove
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-slate-400">
        On their phone: install the app, sign in with a Google account, then read the account id off
        their own screen.
      </p>
      <Field label="Their name" value={name} onChange={setName} />
      <Field label="Their account id" value={uid} onChange={setUid} />
      <p className="text-sm text-slate-400">
        Their boxes will be numbered {range.numberRangeStart} to {range.numberRangeEnd}.
      </p>
      <ErrorLine message={error} />
      {unconfirmed ? (
        <p className="text-sm text-amber-300">
          {unconfirmed} is removed on this phone. They keep access until this phone reaches the server.
        </p>
      ) : null}
      <Button onClick={add} disabled={!uid.trim() || !name.trim()} tone="quiet">
        Add this person
      </Button>
      <Button onClick={onDone}>Done</Button>

      {removing ? (
        <Confirm
          title={`Remove ${removing.displayName}?`}
          detail={`${removing.displayName} loses access to the move as soon as this phone reaches the server, which with signal is at once. Their boxes stay in the move with their numbers, and ${removing.numberRangeStart} to ${removing.numberRangeEnd} will not be given to anyone else. Anything their phone has not sent yet will not arrive.`}
          confirmLabel={`Remove ${removing.displayName}`}
          cancelLabel={`Keep ${removing.displayName}`}
          onConfirm={() => remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </Screen>
  );
}
