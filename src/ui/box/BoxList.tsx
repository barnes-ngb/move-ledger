import { useState } from "react";
import type { Container, Zone } from "../../domain";
import { hasCondition, isVoided, search } from "../../domain";
import { BackBar, Button } from "../kit";

/**
 * Every box, and a text field over it. The number keypad answers "where is
 * box 042". This screen answers the other question, which is the one a person
 * has when they are looking at a wall of sealed cardboard: which box has the
 * kettle in it.
 *
 * Nothing here waits on the network. The list is the local cache, so it is the
 * same list with no signal, which is why there is no loading state to write.
 */
export function BoxList({
  containers,
  zones,
  photoCounts,
  query,
  onQueryChange,
  onOpen,
  onBack,
}: {
  containers: readonly Container[];
  zones: readonly Zone[];
  photoCounts: Record<string, number>;
  query: string;
  onQueryChange: (v: string) => void;
  onOpen: (c: Container) => void;
  onBack: () => void;
}) {
  const [showVoided, setShowVoided] = useState(false);
  const filtering = query.trim().length > 0;

  /**
   * The voided filter lives here, in the component, and must not move up.
   *
   * `reserveContainer` picks the next number from the highest one in use, and
   * it reads the same subscription this screen does. A voided box is what
   * holds a retired number above that high-water mark. Filtering voided boxes
   * out of the hook or the repository would hand a number that is already
   * written on cardboard to a second physical box, which is the one mistake in
   * this app that nothing can repair. Hiding them from a list is safe. Hiding
   * them from the count is not.
   *
   * Search reads from the same filtered list, so somebody looking for a
   * stapler does not get back a box they retired last week.
   */
  const voidedCount = containers.filter(isVoided).length;
  const visible = showVoided ? containers : containers.filter((c) => !isVoided(c));

  // Unfiltered, the newest box is the one being worked on, so it goes on top.
  // Filtered, the ranking from the search decides and this order is discarded.
  const rows = filtering
    ? search(visible, query, zones).map((h) => ({ container: h.container, suggestionOnly: h.suggestionOnly }))
    : [...visible]
        .sort((a, b) => b.sequenceNumber - a.sequenceNumber)
        .map((container) => ({ container, suggestionOnly: false }));

  return (
    <div className="flex min-h-full flex-col">
      <BackBar onBack={onBack} />
      <div className="flex flex-col gap-2 p-6 pt-2 pb-3">
        <label className="block">
          <span className="text-sm text-slate-400">Search</span>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="A word from a note or a contents list"
            className="mt-1 min-h-14 w-full rounded-xl bg-slate-800 px-4 text-lg text-slate-100 placeholder:text-slate-500"
          />
        </label>
        <p className="text-sm text-slate-400">
          {filtering
            ? `${rows.length} of ${visible.length} box${visible.length === 1 ? "" : "es"}`
            : `${visible.length} box${visible.length === 1 ? "" : "es"}`}
        </p>
        {voidedCount > 0 ? (
          <button
            onClick={() => setShowVoided((v) => !v)}
            className="min-h-14 self-start text-sm text-slate-400 underline"
          >
            {showVoided
              ? "Hide voided boxes"
              : `Show ${voidedCount} voided box${voidedCount === 1 ? "" : "es"}`}
          </button>
        ) : null}
      </div>

      <ul className="flex-1 overflow-y-auto px-6">
        {rows.map(({ container, suggestionOnly }) => {
          const zone = zones.find((z) => z.id === container.destinationZoneId);
          const photos = photoCounts[container.id] ?? 0;
          return (
            <li key={container.id}>
              <button
                onClick={() => onOpen(container)}
                className="flex min-h-14 w-full items-center gap-3 border-b border-slate-800 py-2 text-left"
              >
                <span className="font-mono text-2xl text-slate-100">{container.displayCode}</span>
                {/* A box with no room has no color to write on it and no
                    destination when it arrives, which is a thing to fix
                    rather than a blank. The dot is drawn as an empty outline
                    and the words say what to do, in the same amber the
                    conditions use for the other state worth acting on. */}
                {zone ? (
                  <span
                    className="size-5 shrink-0 rounded-full"
                    style={{ backgroundColor: zone.colorValue }}
                  />
                ) : (
                  <span className="size-5 shrink-0 rounded-full border-2 border-dashed border-amber-400" />
                )}
                <span className="min-w-0 flex-1">
                  {zone ? (
                    <span className="block truncate text-slate-300">{zone.name}</span>
                  ) : (
                    <span className="block truncate font-medium text-amber-300">
                      No room. Open it and pick one.
                    </span>
                  )}
                  {container.title ? (
                    <span className="block truncate text-sm text-slate-500">{container.title}</span>
                  ) : null}
                  {suggestionOnly ? (
                    <span className="block text-sm text-amber-300">
                      Matched a suggestion nobody has confirmed
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm text-slate-400">{statusWord(container)}</span>
                  {conditionWord(container) ? (
                    <span className="block text-xs text-amber-300">{conditionWord(container)}</span>
                  ) : null}
                  {photos > 0 ? (
                    <span className="block text-xs text-slate-500">
                      {photos} photo{photos === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}

        {rows.length === 0 ? (
          <p className="py-6 text-slate-400">
            {containers.length === 0
              ? "No boxes yet. Add one and it appears here."
              : "No box matches that. Try one word instead of a phrase."}
          </p>
        ) : null}
      </ul>

      {/* Back rather than Done: this screen completes nothing, and the word
          has to mean the same thing here as it does everywhere else. */}
      <div className="border-t border-slate-800 p-4">
        <Button onClick={onBack} tone="quiet">
          Back
        </Button>
      </div>
    </div>
  );
}

/**
 * Per docs/09-glossary.md, `filling` is a draft everywhere a person can read
 * it. A voided box reads as voided instead of its status, because what a
 * person needs from this row is that the box is out of use, not where it got
 * to before that.
 */
function statusWord(container: Container): string {
  if (isVoided(container)) return "voided";
  return container.status === "filling" ? "draft" : container.status;
}

/** Both can be true at once, per ADR-0003, so both are named. */
function conditionWord(container: Container): string {
  return [
    hasCondition(container, "missing") ? "missing" : null,
    hasCondition(container, "damaged") ? "damaged" : null,
  ]
    .filter((w): w is string => w !== null)
    .join(", ");
}
