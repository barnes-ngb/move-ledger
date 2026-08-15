import { useState } from "react";
import type { Container, ContainerPhoto, Zone } from "../../domain";
import {
  acceptAiSummary,
  dismissAiSummary,
  updatePhotoRecord,
  writeInBackground,
} from "../../repositories";
import { summarizePhoto } from "../../lib/functions";
import { Button, ErrorLine, TextArea } from "../kit";

/**
 * The suggestion, and the four things a person can do with it.
 *
 * Doc 07's rule is that AI suggests and the person confirms, so nothing here
 * happens on its own. The heading follows doc 09: this is not confirmed text
 * until someone accepts it, and the screen says so rather than implying it.
 *
 * The text is stored as plain prose because it is searched word by word.
 * Nothing in this component adds bullets, punctuation, or markup to it.
 */
export function AiSummary({
  moveId,
  container,
  zones,
  photos,
  uid,
}: {
  moveId: string;
  container: Container;
  zones: readonly Zone[];
  photos: readonly ContainerPhoto[];
  uid: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const suggestion = container.aiSummary?.trim() ?? "";
  const contentsPhotos = photos.filter((p) => p.type === "contents");

  if (!suggestion) return null;

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

  function accept(text: string) {
    if (!text.trim()) return;
    setEditing(false);
    run(() => acceptAiSummary(moveId, container, zones, text, uid));
  }

  /**
   * Dismiss clears the suggestion and marks every contents photo of this box
   * `skipped`, which is what stops it coming back. Clearing the text alone
   * would leave the next upload free to regenerate it.
   */
  function dismiss() {
    run(() => dismissAiSummary(moveId, container, zones, uid));
    for (const photo of contentsPhotos) {
      run(() => updatePhotoRecord(moveId, { ...photo, summaryState: "skipped" }));
    }
  }

  /**
   * Redo clears the current text first, so a fresh answer replaces the old one
   * rather than being appended to it. Every contents photo is asked again,
   * because the list accumulates across layers and re-asking only the last
   * photo would silently drop the earlier ones.
   */
  function redo() {
    setAsking(true);
    setError(null);
    run(() => dismissAiSummary(moveId, container, zones, uid));
    void Promise.allSettled(
      contentsPhotos.map((p) => summarizePhoto({ moveId, photoId: p.id, redo: true }))
    )
      .then((results) => {
        if (results.some((r) => r.status === "rejected")) {
          setError("Could not ask again. The old list is cleared; try once more when you have signal.");
        }
      })
      .finally(() => setAsking(false));
  }

  return (
    <div className="rounded-2xl border border-slate-700 p-4">
      <p className="text-sm text-slate-400">Suggested contents</p>
      <p className="mt-1 text-xs text-slate-500">
        Written from the photos. Nobody has confirmed it yet, so it is not part of this box until you
        accept it.
      </p>

      {editing ? (
        <div className="mt-3 flex flex-col gap-3">
          <TextArea label="Contents" value={draft} onChange={setDraft} />
          <Button onClick={() => accept(draft)} disabled={!draft.trim()}>
            Save and accept
          </Button>
          <Button onClick={() => setEditing(false)} tone="quiet">
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-lg leading-relaxed text-slate-200">{suggestion}</p>
          <Button onClick={() => accept(suggestion)}>Accept</Button>
          <Button
            onClick={() => {
              setDraft(suggestion);
              setEditing(true);
            }}
            tone="quiet"
          >
            Edit
          </Button>
          <Button onClick={dismiss} tone="quiet">
            Dismiss
          </Button>
          <Button onClick={redo} disabled={asking || contentsPhotos.length === 0} tone="quiet">
            {asking
              ? "Asking"
              : `Ask again, ${contentsPhotos.length} photo${contentsPhotos.length === 1 ? "" : "s"}`}
          </Button>
          <p className="text-xs text-slate-500">
            Asking again reads the photos once more and replaces this text. It costs another call for
            each photo.
          </p>
        </div>
      )}

      <ErrorLine message={error} />
    </div>
  );
}
