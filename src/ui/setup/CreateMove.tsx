import { useState } from "react";
import type { User } from "firebase/auth";
import { addLocation, addMember, createMove, updateMove } from "../../repositories";
import { Button, ErrorLine, Field, Screen } from "../kit";

/**
 * Creates everything a move needs to exist: the move, both places, and the
 * creator's own member record holding numbers 1 to 499. The second member is
 * added later, on the Members screen, because her uid does not exist yet.
 */
export function CreateMove({ user }: { user: User }) {
  const [name, setName] = useState("KC to DFW");
  const [origin, setOrigin] = useState("Kansas City");
  const [destination, setDestination] = useState("DFW");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const move = await createMove(name.trim(), user.uid);
      const from = await addLocation(move.id, { name: origin.trim(), type: "home" });
      const to = await addLocation(move.id, { name: destination.trim(), type: "home" });
      // Conditional spread rather than explicit undefined. See the hazard note.
      await updateMove({ ...move, originLocationId: from.id, destinationLocationId: to.id });
      await addMember(
        move.id,
        {
          uid: user.uid,
          displayName: user.displayName ?? "Me",
          role: "owner",
          numberRangeStart: 1,
          numberRangeEnd: 499,
        },
        []
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
      <Button onClick={() => void create()} disabled={busy || !ready}>
        {busy ? "Creating" : "Create the move"}
      </Button>
      <p className="text-sm text-slate-400">
        Your boxes will be numbered 1 to 499. The second person gets 500 to 999, so two phones can
        number boxes at the same time without a collision.
      </p>
    </Screen>
  );
}
