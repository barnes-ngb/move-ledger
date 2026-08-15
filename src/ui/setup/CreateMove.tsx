import { useState } from "react";
import type { User } from "firebase/auth";
import { addLocation, addMember, createMove, updateMove, writeInBackground } from "../../repositories";
import { Button, ErrorLine, Field, Screen } from "../kit";

/**
 * Creates everything a move needs to exist: the move, both places, and the
 * creator's own member record holding numbers 1 to 499. The second member is
 * added later, on the Members screen, because her uid does not exist yet.
 *
 * Every id this chain needs comes from the local write, so the whole sequence
 * runs with no network. Waiting on the server here used to leave the button
 * reading "Creating" for as long as the phone stayed offline.
 */
export function CreateMove({ user }: { user: User }) {
  const [name, setName] = useState("KC to DFW");
  const [origin, setOrigin] = useState("Kansas City");
  const [destination, setDestination] = useState("DFW");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function create() {
    setBusy(true);
    setError(null);
    try {
      const move = createMove(name.trim(), user.uid);
      const from = addLocation(move.value.id, { name: origin.trim(), type: "home" });
      const to = addLocation(move.value.id, { name: destination.trim(), type: "home" });
      // Conditional spread rather than explicit undefined. See the hazard note.
      const linked = updateMove({
        ...move.value,
        originLocationId: from.value.id,
        destinationLocationId: to.value.id,
      });
      const member = addMember(
        move.value.id,
        {
          uid: user.uid,
          displayName: user.displayName ?? "Me",
          role: "owner",
          numberRangeStart: 1,
          numberRangeEnd: 499,
        },
        []
      );
      writeInBackground(
        Promise.all([move.written, from.written, to.written, linked.written, member.written]),
        () => {
          setError("The move is saved on this phone. It has not reached the server yet.");
          setBusy(false);
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the move.");
      setBusy(false);
    }
  }

  const ready = name.trim() && origin.trim() && destination.trim();

  return (
    <Screen title="Set up the move">
      <Field label="Name" value={name} onChange={setName} autoFocus />
      <Field label="Moving from" value={origin} onChange={setOrigin} />
      <Field label="Moving to" value={destination} onChange={setDestination} />
      <ErrorLine message={error} />
      <Button onClick={create} disabled={busy || !ready}>
        {busy ? "Creating" : "Create the move"}
      </Button>
      <p className="text-sm text-slate-400">
        Your boxes will be numbered 1 to 499. The second person gets 500 to 999, so two phones can
        number boxes at the same time without a collision.
      </p>
    </Screen>
  );
}
