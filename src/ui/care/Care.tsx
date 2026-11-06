import { useState } from "react";
import {
  CARE_STATUS_LABEL,
  careToText,
  nextStatus,
  parseCareImport,
  putProvider,
  removeProvider,
  setProviderStatus,
  sortNeeds,
  sortProviders,
  type CareNeed,
  type CareProvider,
  type CareStatus,
} from "../../domain";
import { removeCareNeed, saveCareNeed, writeInBackground } from "../../repositories";
import { newId, nowIso } from "../../repositories/shared";
import { Button, Confirm, ErrorLine, Field, Screen, SubscriptionFailed, TextArea } from "../kit";

/**
 * The care team: one card per need, the options under it, and where each
 * option stands. Built to be read in a glance by the person who will sit in
 * the rooms, and to take a tap when a call has been made.
 *
 * Everything written here goes through `saveCareNeed` with the whole card, so
 * the card on screen and the card in Firestore are the same object. Offline
 * the write lands in the local cache and the listener redraws from it, the
 * same as a box. See decisions/0006-care-page.md.
 */
export function Care({
  moveId,
  uid,
  needs,
  loaded,
  failed,
  retry,
  onBack,
}: {
  moveId: string;
  uid: string;
  needs: CareNeed[];
  loaded: boolean;
  failed: boolean;
  retry: () => void;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState<{ need: CareNeed; provider: CareProvider | null } | null>(null);
  const [editingNeed, setEditingNeed] = useState<CareNeed | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [line, setLine] = useState<string | null>(null);

  if (failed) return <SubscriptionFailed title="Cannot load the care team" onRetry={retry} />;

  const sorted = sortNeeds(needs);

  const save = (need: CareNeed) => {
    setLine(null);
    const write = saveCareNeed(need, uid);
    writeInBackground(write.written, () => setLine("That change did not reach the server. It is saved on this phone."));
  };

  const markNext = (need: CareNeed, p: CareProvider) => save(setProviderStatus(need, p.id, nextStatus(p.status)));

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(careToText(sorted));
      setLine("Copied the list.");
    } catch {
      setLine("Could not copy on this phone. Use Share from the browser instead.");
    }
  };

  return (
    <Screen title="Care team" onBack={onBack}>
      {!loaded ? (
        <p className="text-slate-400">Loading</p>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col gap-1 text-slate-400">
          <p>Nothing here yet.</p>
          <p>Add a need, or paste a list that was typed up elsewhere.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {sorted.map((need) => (
            <NeedCard
              key={need.id}
              need={need}
              onMark={(p) => markNext(need, p)}
              onEditProvider={(p) => setEditing({ need, provider: p })}
              onAddProvider={() => setEditing({ need, provider: null })}
              onEditNeed={() => setEditingNeed(need)}
            />
          ))}
        </div>
      )}

      <ErrorLine message={line} />

      <div className="flex flex-col gap-3">
        <Button onClick={() => setEditingNeed("new")}>Add a need</Button>
        <Button onClick={() => setImporting(true)} tone="quiet">
          Paste a list
        </Button>
        {sorted.length > 0 ? (
          <Button onClick={() => void copyText()} tone="quiet">
            Copy as text
          </Button>
        ) : null}
      </div>

      {editing ? (
        <ProviderForm
          initial={editing.provider}
          onSave={(p) => {
            save(putProvider(editing.need, p));
            setEditing(null);
          }}
          onRemove={
            editing.provider
              ? () => {
                  save(removeProvider(editing.need, editing.provider!.id));
                  setEditing(null);
                }
              : null
          }
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {editingNeed ? (
        <NeedForm
          initial={editingNeed === "new" ? null : editingNeed}
          onSave={(title, note) => {
            if (editingNeed === "new") {
              const order = (sorted.at(-1)?.order ?? -1) + 1;
              save({
                id: newId(),
                moveId,
                title,
                note: note || undefined,
                order,
                providers: [],
                updatedAt: nowIso(),
                updatedBy: uid,
              });
            } else {
              save({ ...editingNeed, title, note: note || undefined });
            }
            setEditingNeed(null);
          }}
          onRemove={
            editingNeed === "new"
              ? null
              : () => {
                  writeInBackground(removeCareNeed(moveId, editingNeed.id), () =>
                    setLine("That change did not reach the server. It is saved on this phone.")
                  );
                  setEditingNeed(null);
                }
          }
          onCancel={() => setEditingNeed(null)}
        />
      ) : null}

      {importing ? (
        <ImportPanel
          onImport={(text) => {
            const firstOrder = (sorted.at(-1)?.order ?? -1) + 1;
            const result = parseCareImport(text, { moveId, uid, now: nowIso(), newId, firstOrder });
            if (!result.ok) {
              console.error("Care import refused", result.detail);
              return result.message;
            }
            for (const need of result.needs) save(need);
            setImporting(false);
            setLine(`Added ${result.needs.length} card${result.needs.length === 1 ? "" : "s"}.`);
            return null;
          }}
          onCancel={() => setImporting(false)}
        />
      ) : null}
    </Screen>
  );
}

function NeedCard({
  need,
  onMark,
  onEditProvider,
  onAddProvider,
  onEditNeed,
}: {
  need: CareNeed;
  onMark: (p: CareProvider) => void;
  onEditProvider: (p: CareProvider) => void;
  onAddProvider: () => void;
  onEditNeed: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-slate-800 p-4" aria-label={need.title}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-slate-100">{need.title}</h3>
          {need.note ? <p className="text-slate-400">{need.note}</p> : null}
        </div>
        <button onClick={onEditNeed} className="min-h-11 shrink-0 px-2 text-slate-400 underline">
          Edit
        </button>
      </div>
      {need.providers.length === 0 ? (
        <p className="text-slate-500">No options yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sortProviders(need.providers).map((p) => (
            <li key={p.id} className="flex flex-col gap-1 rounded-xl bg-slate-900/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-100">
                    {p.name}
                    {p.lean ? <span className="ml-2 rounded-full bg-sky-500/20 px-2 text-sm text-sky-300">Leaning here</span> : null}
                  </p>
                  {p.practice ? <p className="text-sm text-slate-400">{p.practice}</p> : null}
                </div>
                <button onClick={() => onEditProvider(p)} className="min-h-11 shrink-0 px-2 text-slate-400 underline">
                  Edit
                </button>
              </div>
              {p.why ? <p className="text-slate-300">{p.why}</p> : null}
              {p.phone ? (
                <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="text-sky-300 underline">
                  {p.phone}
                </a>
              ) : null}
              {p.address ? <p className="text-sm text-slate-400">{p.address}</p> : null}
              {p.note ? <p className="text-sm text-slate-300">{p.note}</p> : null}
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-sm text-slate-400">{CARE_STATUS_LABEL[p.status]}</span>
                {p.status === "passed" ? null : (
                  <button
                    onClick={() => onMark(p)}
                    className="min-h-11 rounded-xl bg-slate-700 px-3 text-sm font-semibold text-slate-100"
                  >
                    {markLabel(p.status)}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <button onClick={onAddProvider} className="min-h-11 self-start text-slate-400 underline">
        Add an option
      </button>
    </section>
  );
}

/** What the one-tap button offers next. `passed` is set only from the form. */
function markLabel(status: CareStatus): string {
  if (status === "not_called") return "Mark called";
  if (status === "called") return "Mark booked";
  return "Mark not called";
}

/**
 * Forms are full-screen panels rather than sheets: five fields do not fit at
 * the bottom of a phone, and nothing here is a yes-or-no question.
 */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900 p-6">
      <div className="flex flex-col gap-4">
        <h3 className="text-xl font-semibold text-slate-100">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ProviderForm({
  initial,
  onSave,
  onRemove,
  onCancel,
}: {
  initial: CareProvider | null;
  onSave: (p: CareProvider) => void;
  onRemove: (() => void) | null;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [practice, setPractice] = useState(initial?.practice ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [why, setWhy] = useState(initial?.why ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [status, setStatus] = useState<CareStatus>(initial?.status ?? "not_called");
  const [lean, setLean] = useState(initial?.lean === true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) {
      setError("A name is needed.");
      return;
    }
    const clean = (s: string) => (s.trim() ? s.trim() : undefined);
    onSave({
      id: initial?.id ?? newId(),
      name: name.trim(),
      practice: clean(practice),
      phone: clean(phone),
      address: clean(address),
      why: clean(why),
      note: clean(note),
      status,
      lean: lean ? true : undefined,
    });
  };

  return (
    <Panel title={initial ? "Edit option" : "Add an option"}>
      <Field label="Name" value={name} onChange={setName} autoFocus={!initial} />
      <Field label="Practice" value={practice} onChange={setPractice} />
      <Field label="Phone" value={phone} onChange={setPhone} />
      <Field label="Address" value={address} onChange={setAddress} />
      <TextArea label="Why this one" value={why} onChange={setWhy} rows={3} />
      <Field label="Note" value={note} onChange={setNote} placeholder="Booked for Jan 14, 9am" />
      <label className="block">
        <span className="text-sm text-slate-400">Status</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CareStatus)}
          className="mt-1 min-h-14 w-full rounded-xl bg-slate-800 px-4 text-lg text-slate-100"
        >
          {(Object.keys(CARE_STATUS_LABEL) as CareStatus[]).map((s) => (
            <option key={s} value={s}>
              {CARE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-14 items-center gap-3">
        <input type="checkbox" checked={lean} onChange={(e) => setLean(e.target.checked)} className="h-6 w-6" />
        <span className="text-lg text-slate-100">Leaning toward this one</span>
      </label>
      <ErrorLine message={error} />
      <Button onClick={submit}>Save option</Button>
      <Button onClick={onCancel} tone="quiet">
        Go back
      </Button>
      {onRemove ? (
        <button onClick={() => setConfirmRemove(true)} className="min-h-14 text-slate-400 underline">
          Remove this option
        </button>
      ) : null}
      {confirmRemove && onRemove ? (
        <Confirm
          title="Remove this option?"
          detail="It comes off the card. Nothing else changes."
          confirmLabel="Remove it"
          onConfirm={onRemove}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
    </Panel>
  );
}

function NeedForm({
  initial,
  onSave,
  onRemove,
  onCancel,
}: {
  initial: CareNeed | null;
  onSave: (title: string, note: string) => void;
  onRemove: (() => void) | null;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!title.trim()) {
      setError("A title is needed.");
      return;
    }
    onSave(title.trim(), note.trim());
  };

  return (
    <Panel title={initial ? "Edit card" : "Add a need"}>
      <Field label="Title" value={title} onChange={setTitle} placeholder="Everyday doctor" autoFocus={!initial} />
      <TextArea label="What this is for" value={note} onChange={setNote} rows={3} />
      <ErrorLine message={error} />
      <Button onClick={submit}>Save card</Button>
      <Button onClick={onCancel} tone="quiet">
        Go back
      </Button>
      {onRemove ? (
        <button onClick={() => setConfirmRemove(true)} className="min-h-14 text-slate-400 underline">
          Remove this card
        </button>
      ) : null}
      {confirmRemove && onRemove ? (
        <Confirm
          title="Remove this card?"
          detail="The card and every option on it go. This cannot be undone from the app."
          confirmLabel="Remove it"
          onConfirm={onRemove}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
    </Panel>
  );
}

function ImportPanel({
  onImport,
  onCancel,
}: {
  /** Returns a sentence when the text was refused, null when it was taken. */
  onImport: (text: string) => string | null;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Panel title="Paste a list">
      <p className="text-slate-400">
        A list typed up elsewhere, in the app's list format. Each card becomes a need with its options. Nothing already here
        is changed.
      </p>
      <TextArea label="List" value={text} onChange={setText} rows={10} />
      <ErrorLine message={error} />
      <Button onClick={() => setError(onImport(text))} disabled={!text.trim()}>
        Add these cards
      </Button>
      <Button onClick={onCancel} tone="quiet">
        Go back
      </Button>
    </Panel>
  );
}
