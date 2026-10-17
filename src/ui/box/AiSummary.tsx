import { useRef, useState, type ReactNode } from "react";
import {
  aiItemsOf,
  isUnaskedForSummary,
  joinItems,
  mergeItems,
  parseItemLines,
  splitSummary,
  type Container,
  type ContainerPhoto,
  type Zone,
} from "../../domain";
import {
  acceptAiSummary,
  dismissAiSummary,
  replaceAiSummary,
  updatePhotoRecord,
  writeInBackground,
} from "../../repositories";
import type { SummarizeResponse } from "../../lib/functions";
import { askForSummary } from "../../photos/summary";
import { Button, ErrorLine, TextArea } from "../kit";
import { CategoryChips, ItemList } from "./ContentsList";

function reasonOf(results: readonly PromiseSettledResult<unknown>[]): string | null {
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (!failed) return null;
  return failed.reason instanceof Error ? failed.reason.message : String(failed.reason);
}

/**
 * The frame both states share, so the ask control on box detail is this
 * panel with different contents rather than a second component that drifts.
 */
function Panel({
  heading,
  lead,
  error,
  children,
}: {
  heading: string;
  lead: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-700 p-4">
      <p className="text-sm text-slate-400">{heading}</p>
      <p className="mt-1 text-xs text-slate-500">{lead}</p>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
      <ErrorLine message={error} />
    </div>
  );
}

/**
 * The suggestion, and the four things a person can do with it.
 *
 * Doc 07's rule is that AI suggests and the person confirms, so nothing here
 * happens on its own. The heading follows doc 09: this is not confirmed text
 * until someone accepts it, and the screen says so rather than implying it.
 *
 * The suggestion is a list of items, shown one per line and edited one per
 * line. A box from before items has only a string, which `aiItemsOf` splits
 * when it is read; nothing here writes that split back unless the person
 * answers the suggestion.
 *
 * With no suggestion, and `offerAsk` set, the same panel offers to write one
 * for contents photos that uploaded and never got a list: a call that failed,
 * or a photo taken before the feature was turned on.
 */
export function AiSummary({
  moveId,
  container,
  zones,
  photos,
  uid,
  offerAsk = false,
  onAnswered,
}: {
  moveId: string;
  container: Container;
  zones: readonly Zone[];
  photos: readonly ContainerPhoto[];
  uid: string;
  /**
   * Box detail passes the move's setting. Add box does not: a photo there has
   * usually just uploaded and its own request is already on the way.
   */
  offerAsk?: boolean;
  /**
   * The box as it stands the moment a suggestion is answered or replaced, for
   * a screen that is also holding an edit of the same document.
   *
   * Every write here settles on server acknowledgment, so the subscription
   * delivers the answered box a moment after the tap rather than during it. Add
   * box saves the whole container, so a save landing inside that moment would
   * write the suggestion back over its own answer. Box detail passes nothing
   * and is unaffected: it has no save of its own that carries this field.
   */
  onAnswered?: (container: Container) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // Ask again settles seconds after the tap, and by then the subscription may
  // have delivered a newer copy of the box. The write is based on that one.
  const latest = useRef(container);
  latest.current = container;

  const items = aiItemsOf(container);
  // What the person is answering, as one string, so a copy of the box that
  // arrives while Ask again is out can be compared against it.
  const suggestion = joinItems(items);
  const categories = container.aiCategories ?? [];
  const contentsPhotos = photos.filter((p) => p.type === "contents");
  const now = Date.now();
  const unasked = offerAsk ? contentsPhotos.filter((p) => isUnaskedForSummary(p, now)) : [];
  /** Returns the written document, which is available before the server has it. */
  function run<T>(write: () => { value: T; written: Promise<unknown> }): T | null {
    setError(null);
    try {
      const { value, written } = write();
      writeInBackground(written, () =>
        setError("This change is saved on your phone. It has not reached the other phone yet.")
      );
      return value;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      return null;
    }
  }

  function accept(accepted: readonly string[]) {
    if (accepted.length === 0) return;
    setEditing(false);
    const answered = run(() => acceptAiSummary(moveId, container, zones, accepted, uid));
    if (answered) onAnswered?.(answered);
  }

  /**
   * Dismiss clears the suggestion and marks every contents photo of this box
   * `skipped`, which is what stops it coming back. Clearing the text alone
   * would leave the next upload free to regenerate it.
   */
  function dismiss() {
    const answered = run(() => dismissAiSummary(moveId, container, zones, uid));
    if (answered) onAnswered?.(answered);
    for (const photo of contentsPhotos) {
      run(() => updatePhotoRecord(moveId, { ...photo, summaryState: "skipped" }));
    }
  }

  /**
   * Asks every contents photo again, because the list accumulates across
   * layers and re-asking only the last photo would silently drop the earlier
   * ones. Nothing is cleared first. The function hands each answer back
   * instead of writing it, and the suggestion is replaced only once every
   * photo has replied, so a call that fails leaves the old text on screen with
   * the reason under it rather than an empty panel.
   */
  async function redo() {
    const asked = suggestion;
    setAsking(true);
    setError(null);
    const results = await Promise.allSettled(
      contentsPhotos.map((p) => askForSummary(moveId, p.id, { redo: true, returnOnly: true }))
    );
    setAsking(false);

    const reason = reasonOf(results);
    if (reason !== null) {
      setError(`Could not ask again, so the list above is unchanged. ${reason}`);
      return;
    }
    // Answered while the calls were out. The person's answer stands.
    if (joinItems(aiItemsOf(latest.current)) !== asked) return;

    // A function deployed before items answers with `summary` alone, and that
    // string is split the way a stored one would be.
    const answers = results.map((r) => (r as PromiseFulfilledResult<SummarizeResponse>).value);
    const found = answers.reduce<string[]>(
      (list, a) => mergeItems(list, a.items ?? splitSummary(a.summary)),
      []
    );
    const kinds = [...new Set(answers.flatMap((a) => a.categories ?? []))];
    const replaced = run(() => replaceAiSummary(moveId, latest.current, zones, found, kinds, uid));
    if (replaced) onAnswered?.(replaced);
    if (found.length === 0) setNotice("Nothing in these photos was worth listing.");
  }

  /**
   * The ask control. Ordinary calls, not redo: the function appends each
   * answer to the box itself, exactly as it does after an upload, and skips
   * any photo it has already read.
   */
  async function writeList() {
    setAsking(true);
    setError(null);
    setNotice(null);
    const results = await Promise.allSettled(unasked.map((p) => askForSummary(moveId, p.id)));
    setAsking(false);

    const reason = reasonOf(results);
    if (reason !== null) {
      setError(`Could not write the list for every photo. ${reason}`);
      return;
    }
    const wrote = results.some(
      (r) =>
        r.status === "fulfilled" &&
        ((r.value as SummarizeResponse).items !== undefined ||
          (r.value as SummarizeResponse).summary !== undefined)
    );
    if (!wrote) setNotice("Nothing in these photos was worth listing.");
  }

  if (items.length === 0) {
    // Kept on screen while it is asking or has something to say, because the
    // photos stop counting as unasked the moment they are marked requested.
    if (unasked.length === 0 && !asking && error === null && notice === null) return null;
    const count = unasked.length;
    return (
      <Panel
        heading="Contents list"
        lead="No list has been written from these photos yet. A list is a suggestion until you accept it."
        error={error}
      >
        {notice ? <p className="text-sm text-slate-300">{notice}</p> : null}
        {count > 0 || asking ? (
          <>
            <Button onClick={() => void writeList()} disabled={asking || count === 0} tone="quiet">
              {asking ? "Writing" : "Write a contents list"}
            </Button>
            <p className="text-xs text-slate-500">
              It reads {count} photo{count === 1 ? "" : "s"} and costs a call for each.
            </p>
          </>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel
      heading="Suggested contents"
      lead="Written from the photos. Nobody has confirmed it yet, so it is not part of this box until you accept it."
      error={error}
    >
      {editing ? (
        <>
          <TextArea label="Contents, one per line" value={draft} onChange={setDraft} rows={6} />
          <Button onClick={() => accept(parseItemLines(draft))} disabled={parseItemLines(draft).length === 0}>
            Save and accept
          </Button>
          <Button onClick={() => setEditing(false)} tone="quiet">
            Cancel
          </Button>
        </>
      ) : (
        <>
          <ItemList items={items} />
          <CategoryChips categories={categories} />
          <Button onClick={() => accept(items)}>Accept</Button>
          <Button
            onClick={() => {
              setDraft(items.join("\n"));
              setEditing(true);
            }}
            tone="quiet"
          >
            Edit
          </Button>
          <Button onClick={dismiss} tone="quiet">
            Dismiss
          </Button>
          <Button onClick={() => void redo()} disabled={asking || contentsPhotos.length === 0} tone="quiet">
            {asking
              ? "Asking"
              : `Ask again, ${contentsPhotos.length} photo${contentsPhotos.length === 1 ? "" : "s"}`}
          </Button>
          <p className="text-xs text-slate-500">
            Asking again reads the photos once more and replaces this list once every photo has
            answered. It costs another call for each photo.
          </p>
        </>
      )}
    </Panel>
  );
}
