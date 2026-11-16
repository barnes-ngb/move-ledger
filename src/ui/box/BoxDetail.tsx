import { useState } from "react";
import type { Container, Zone } from "../../domain";
import {
  STATUS_ORDER,
  canDelete,
  canTransition,
  contentsItemsOf,
  hasCondition,
  isFurniture,
  isVoided,
  nextStatuses,
  parseItemLines,
  statusLabel,
} from "../../domain";
import type { ConditionKey } from "../../domain/conditions";
import {
  clearContainerCondition,
  deleteContainer,
  reportContainerCondition,
  saveContainer,
  setContainerSize,
  setContainerUndecided,
  setContainerWeight,
  setContentsItems,
  setStatus,
  setTitle,
  unvoidContainer,
  voidContainer,
  writeInBackground,
} from "../../repositories";
import { usePhotos } from "../../hooks/usePhotos";
import { BackBar, Button, Confirm, ErrorLine, Field, TextArea } from "../kit";
import { AiSummary } from "./AiSummary";
import { CategoryChips, ItemList } from "./ContentsList";
import { PhotoStrip } from "./PhotoStrip";
import { RoomPicker } from "./RoomPicker";
import { NumberField, SizeChips } from "./SizeChips";
import { Check } from "./FurniturePicker";
import { VOLUME_HELP, WEIGHT_HELP, numberText, parseVolume, parseWeight } from "./numberInput";

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
  backLabel = "Back",
  contentsListOn = false,
  onBack,
}: {
  moveId: string;
  container: Container;
  zones: readonly Zone[];
  uid: string;
  /** The move's `aiEnabled`. Decides whether the panel offers to write a list for unasked photos. */
  contentsListOn?: boolean;
  /** Names where back goes, since this screen is opened from three places. */
  backLabel?: string;
  onBack: () => void;
}) {
  const [title, setTitleText] = useState(container.title ?? "");
  const [note, setNote] = useState(container.notes ?? "");
  // The confirmed items, and the same list as the edit field holds it: one
  // item per line.
  const storedItems = contentsItemsOf(container);
  const stored = storedItems.join("\n");
  const [contents, setContents] = useState(stored);
  const [editingContents, setEditingContents] = useState(false);
  // What the document said last time this rendered. Accepting a suggestion
  // writes the items while this screen is open, and the field below has to
  // show what the box now holds rather than the blank it started as. An edit
  // in progress is kept: only an untouched field takes the new value.
  const [lastStored, setLastStored] = useState(stored);
  if (stored !== lastStored) {
    setLastStored(stored);
    if (contents === lastStored) setContents(stored);
  }
  // Weight and a typed cu ft, held as text while they are typed and saved on
  // blur. Same shape as the contents field: a value written from elsewhere,
  // such as Weigh boxes on the other phone, replaces an untouched field.
  const storedWeight = numberText(container.weightLb);
  const [weight, setWeight] = useState(storedWeight);
  const [lastWeight, setLastWeight] = useState(storedWeight);
  if (storedWeight !== lastWeight) {
    setLastWeight(storedWeight);
    if (weight === lastWeight) setWeight(storedWeight);
  }
  const storedVolume = numberText(container.volumeCuFt);
  const [volume, setVolume] = useState(storedVolume);
  const [lastVolume, setLastVolume] = useState(storedVolume);
  if (storedVolume !== lastVolume) {
    setLastVolume(storedVolume);
    if (volume === lastVolume) setVolume(storedVolume);
  }
  const [editingRoom, setEditingRoom] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photos = usePhotos(moveId, container.id);

  const zone = zones.find((z) => z.id === container.destinationZoneId);
  const forward = nextStatuses(container.status);
  // Every other move `canTransition` allows, which is every backward one. A
  // mis-tap on Mark loaded used to be permanent, because only the forward
  // moves were offered. They stay behind a quiet control so the forward
  // buttons remain the obvious thing on the screen. Doc 04 section 6.
  const otherStatuses = STATUS_ORDER.filter((s) => canTransition(container.status, s) && !forward.includes(s));
  const voided = isVoided(container);
  const deletable = canDelete(container);

  // Accepted with the list and searched with it, so they are shown with it.
  // Emptying the list removes them; see `setContentsItems`.
  const categoriesLine = (
    <div className="mt-3">
      <CategoryChips categories={container.contentsCategories ?? []} />
    </div>
  );
  // A box with nothing listed opens straight on the field, since there is no
  // list to read and Edit would be one tap for nothing.
  const showEditor = editingContents || storedItems.length === 0;
  const edited = parseItemLines(contents).join("\n");

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

  function saveWeight() {
    const parsed = parseWeight(weight);
    if (parsed.kind === "invalid") {
      setError(WEIGHT_HELP);
      return;
    }
    const next = parsed.kind === "value" ? parsed.value : undefined;
    if (next === container.weightLb) return;
    run(() => setContainerWeight(moveId, container, next ?? null, zones, uid));
  }

  function saveVolume() {
    const parsed = parseVolume(volume);
    if (parsed.kind === "invalid") {
      setError(VOLUME_HELP);
      return;
    }
    const next = parsed.kind === "value" ? parsed.value : undefined;
    if (next === container.volumeCuFt) return;
    run(() => setContainerSize(moveId, container, "other", next, zones, uid));
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
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this box.");
    }
  }

  return (
    <div className="flex flex-col">
      <BackBar onBack={onBack} label={backLabel} />
      <div className="flex flex-col gap-6 p-6 pt-2">
        <div className="flex items-center gap-4">
          <span className="font-mono text-5xl font-bold text-slate-50">{container.displayCode}</span>
          {zone ? (
            <span className="flex items-center gap-2">
              <span className="size-6 rounded-full" style={{ backgroundColor: zone.colorValue }} />
              <span className="text-xl text-slate-200">{zone.name}</span>
            </span>
          ) : (
            // A box with no room has no color to write on it, which is a thing
            // to go and fix rather than a quiet blank. Same marker as the list.
            <span className="flex items-center gap-2">
              <span className="size-6 rounded-full border-2 border-dashed border-amber-400" />
              <span className="text-xl text-amber-300">No room</span>
            </span>
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

        {/* The contents list, which until now could be corrected only in the
            moment a suggestion was accepted. It is confirmed text like the
            title and the note, so it is edited the same way and on the same
            screen. A voided box shows it and cannot change it, like everything
            else here. */}
        {voided ? (
          storedItems.length > 0 ? (
            <div>
              <p className="text-sm text-slate-400">Contents</p>
              <div className="mt-1">
                <ItemList items={storedItems} />
              </div>
              {categoriesLine}
            </div>
          ) : null
        ) : showEditor ? (
          <div>
            <TextArea label="Contents, one per line" value={contents} onChange={setContents} rows={6} />
            {categoriesLine}
            <div className="mt-3 flex flex-col gap-2">
              <Button
                onClick={() => {
                  setEditingContents(false);
                  run(() => setContentsItems(moveId, container, parseItemLines(contents), zones, uid));
                }}
                disabled={edited === stored}
                tone="quiet"
              >
                Save contents
              </Button>
              {storedItems.length > 0 ? (
                <Button
                  onClick={() => {
                    setContents(stored);
                    setEditingContents(false);
                  }}
                  tone="quiet"
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-400">Contents</p>
            <div className="mt-1">
              <ItemList items={storedItems} />
            </div>
            {categoriesLine}
            <div className="mt-3">
              <Button
                onClick={() => {
                  setContents(stored);
                  setEditingContents(true);
                }}
                tone="quiet"
              >
                Edit contents
              </Button>
            </div>
          </div>
        )}

        <AiSummary
          moveId={moveId}
          container={container}
          zones={zones}
          photos={photos.map((v) => v.photo)}
          uid={uid}
          offerAsk={contentsListOn && !voided}
        />

        {/* A voided box keeps its photos and its number on screen, because those
            are what somebody came here to check. Everything that changes it is
            gone until the void is undone. */}
        {voided ? null : (
          <>
            <div>
              <p className="text-sm text-slate-400">Status</p>
              <p className="text-xl text-slate-100">{statusLabel(container.status)}</p>
              <div className="mt-3 flex flex-col gap-2">
                {forward.map((s) => (
                  <Button
                    key={s}
                    onClick={() => run(() => setStatus(moveId, container, s, uid))}
                    tone="quiet"
                  >
                    Mark {statusLabel(s)}
                  </Button>
                ))}
                {otherStatuses.length > 0 ? (
                  changingStatus ? (
                    <>
                      {otherStatuses.map((s) => (
                        <Button
                          key={s}
                          onClick={() => {
                            setChangingStatus(false);
                            run(() => setStatus(moveId, container, s, uid));
                          }}
                          tone="quiet"
                        >
                          Mark {statusLabel(s)}
                        </Button>
                      ))}
                      <button
                        onClick={() => setChangingStatus(false)}
                        className="min-h-14 text-slate-400 underline"
                      >
                        Keep this status
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setChangingStatus(true)}
                      className="min-h-14 text-slate-400 underline"
                    >
                      Change status
                    </button>
                  )
                ) : null}
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

            {/* Size and weight, for the Space and weight totals. Each saves on
                its own: a chip on the tap, a number when the field loses
                focus. ADR-0007. */}
            <div className="flex flex-col gap-3">
              <p className="text-sm text-slate-400">Size</p>
              <SizeChips
                selected={container.size}
                onSelect={(size) =>
                  run(() =>
                    setContainerSize(
                      moveId,
                      container,
                      size,
                      size === "other" ? parseVolumeOrUndefined(volume) : undefined,
                      zones,
                      uid
                    )
                  )
                }
              />
              {container.size === "other" ? (
                <NumberField
                  label="Size in cu ft"
                  unit="cu ft"
                  value={volume}
                  onChange={setVolume}
                  onCommit={saveVolume}
                />
              ) : null}
              <NumberField label="Weight" unit="lb" value={weight} onChange={setWeight} onCommit={saveWeight} />
              {/* Furniture does not go on a bathroom scale, so its weight can
                  be marked as a guess, and a piece can be marked not sure it
                  is going. ADR-0008. */}
              {isFurniture(container) || container.weightEstimated ? (
                <Check
                  label="Weight is a guess"
                  checked={container.weightEstimated === true}
                  onChange={(on) => {
                    // The field, not the stored copy: a weight typed and blurred
                    // a moment ago may not be back through the subscription yet,
                    // and resending the old one would undo it. Raised in review
                    // on pull request 33.
                    const typed = parseWeight(weight);
                    if (typed.kind === "invalid") setError(WEIGHT_HELP);
                    else if (typed.kind === "empty") setError("Type a weight first.");
                    else run(() => setContainerWeight(moveId, container, typed.value, zones, uid, on));
                  }}
                />
              ) : null}
              {isFurniture(container) || container.undecided ? (
                <Check
                  label="Not sure it's going"
                  checked={container.undecided === true}
                  onChange={(on) => run(() => setContainerUndecided(moveId, container, on, zones, uid))}
                />
              ) : null}
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
        {/* This screen completes nothing, so the word is Back rather than
            Done. It is repeated at the bottom because everything above it
            saves on its own control, and a thumb that has scrolled this far
            should not have to scroll back up to leave. */}
        <Button onClick={onBack}>{backLabel}</Button>

        {/* Kept below the way out and behind a rule, because a thumb reaching
            for the bottom of a scrolled screen must not land on this. */}
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
    </div>
  );
}

function parseVolumeOrUndefined(text: string): number | undefined {
  const parsed = parseVolume(text);
  return parsed.kind === "value" ? parsed.value : undefined;
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-amber-500/20 px-3 py-1 text-sm font-semibold text-amber-200">
      {children}
    </span>
  );
}
