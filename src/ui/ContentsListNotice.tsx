import { useState } from "react";
import type { Move } from "../domain";
import { updateMove, writeInBackground } from "../repositories";
import { Button, ErrorLine, Screen } from "./kit";

/**
 * Shown once, before a single photo is sent anywhere. Doc 07 requires both
 * members to be told in plain words that photos of their home go to a third
 * party, and requires that telling them happen before the feature is enabled.
 *
 * Both answers write `aiEnabled`, because the point of the field being absent
 * is that it means unasked. Leaving it absent on a refusal would ask again on
 * the next photo, which is not a question, it is nagging.
 */
export function ContentsListNotice({ move, onAnswered }: { move: Move; onAnswered: () => void }) {
  const [error, setError] = useState<string | null>(null);

  function answer(aiEnabled: boolean) {
    setError(null);
    try {
      writeInBackground(updateMove({ ...move, aiEnabled }).written, () =>
        setError("Your answer is saved on this phone. It has not reached the other phone yet.")
      );
      onAnswered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your answer.");
    }
  }

  return (
    <Screen title="Contents lists">
      <p className="text-slate-300">
        Move Ledger can look at a photo of an open box and write a list of what is in it, so a search
        for "stapler" finds the right box later.
      </p>
      <p className="text-slate-300">
        Doing that sends the photo to Anthropic, the company that makes the model. It sends the photo
        and the room name, nothing else. Never your address.
      </p>
      <p className="text-slate-300">You can turn this off at any time under Rooms and members.</p>
      <ErrorLine message={error} />
      <Button onClick={() => answer(true)}>Turn it on</Button>
      <Button onClick={() => answer(false)} tone="quiet">
        No thanks
      </Button>
    </Screen>
  );
}
