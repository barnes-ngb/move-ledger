import type { Container, Zone } from "../../domain";
import { search } from "../../domain";
import { Button } from "../kit";

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
  onClose,
}: {
  containers: readonly Container[];
  zones: readonly Zone[];
  photoCounts: Record<string, number>;
  query: string;
  onQueryChange: (v: string) => void;
  onOpen: (c: Container) => void;
  onClose: () => void;
}) {
  const filtering = query.trim().length > 0;

  // Unfiltered, the newest box is the one being worked on, so it goes on top.
  // Filtered, the ranking from the search decides and this order is discarded.
  const rows = filtering
    ? search(containers, query, zones).map((h) => ({ container: h.container, suggestionOnly: h.suggestionOnly }))
    : [...containers]
        .sort((a, b) => b.sequenceNumber - a.sequenceNumber)
        .map((container) => ({ container, suggestionOnly: false }));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-2 p-6 pb-3">
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
            ? `${rows.length} of ${containers.length} box${containers.length === 1 ? "" : "es"}`
            : `${containers.length} box${containers.length === 1 ? "" : "es"}`}
        </p>
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
                {zone ? (
                  <span
                    className="size-5 shrink-0 rounded-full"
                    style={{ backgroundColor: zone.colorValue }}
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-300">{zone?.name ?? "No room"}</span>
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

      <div className="border-t border-slate-800 p-4">
        <Button onClick={onClose} tone="quiet">
          Done
        </Button>
      </div>
    </div>
  );
}

/** Per docs/09-glossary.md, `filling` is a draft everywhere a person can read it. */
function statusWord(container: Container): string {
  return container.status === "filling" ? "draft" : container.status;
}
