import { useState } from "react";
import type { Location, Move, MoveMember, Zone } from "../../domain";
import { exportFilename, toCsv, toJson } from "../../domain";
import { useExportBundle } from "../../hooks/useExportBundle";
import { downloadText } from "../../lib/download";
import { Button, ErrorLine } from "../kit";

/**
 * Product rule 10: the user must be able to export all data. `toCsv` and
 * `toJson` have been written and tested since APPLY-01 and nothing has ever
 * called them, which meant the rule was true of the domain layer and false of
 * the app.
 *
 * Two files rather than one, because they answer different questions. The CSV
 * is a box per row with the conditions in their own columns, which is the
 * shape an insurance conversation needs: filter to the damaged rows and the
 * list is the claim. The JSON is everything, including the activity history
 * and the photo records, which is what a person would need to rebuild the
 * move somewhere else.
 *
 * Nothing here waits on a server and nothing is sent to one. The text is
 * built from the local cache, so the export works in a garage with no signal.
 */
export function ExportPanel({
  move,
  members,
  zones,
  locations,
}: {
  move: Move;
  members: readonly MoveMember[];
  zones: readonly Zone[];
  locations: readonly Location[];
}) {
  const { containers, photos, activity, ready, failed } = useExportBundle(move.id, true);
  const [error, setError] = useState<string | null>(null);

  // The three listeners answer independently, and a file built while one of
  // them is still on its way is short without saying so. A CSV with a photo
  // count of zero against every box, or a data file with an empty history,
  // reads as a finished export of a move that has neither. So nothing is
  // offered until all three have answered, and nothing is offered at all once
  // one of them has stopped.
  if (!ready && !failed) return null;

  // Nothing to export. This is also what keeps the block off the screen
  // during first-run setup, where a person is three fields into a move and an
  // empty file helps nobody.
  if (ready && !failed && containers.length === 0) return null;

  function download(extension: "csv" | "json") {
    setError(null);
    try {
      const text =
        extension === "csv"
          ? toCsv({ containers, zones, photos })
          : toJson({ move, members, locations, zones, containers, photos, activity });
      downloadText(
        exportFilename(move.name, extension),
        extension === "csv" ? "text/csv" : "application/json",
        text
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the file.");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-700 p-4">
      <p className="text-slate-200">Export</p>
      <p className="mt-1 text-sm text-slate-400">
        {failed
          ? "Everything this phone holds about the move, as a spreadsheet or as a data file."
          : `${containers.length} box${containers.length === 1 ? "" : "es"} from this phone. The spreadsheet has a row per box, with missing and damaged in their own columns. The data file has everything, including the history.`}
      </p>
      {failed ? (
        <p className="mt-2 text-sm text-amber-300">
          Part of this move stopped loading, so a file made now would be short and would not say so.
          Go back and open this screen again.
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        <Button onClick={() => download("csv")} disabled={failed} tone="quiet">
          Download the spreadsheet
        </Button>
        <Button onClick={() => download("json")} disabled={failed} tone="quiet">
          Download the data file
        </Button>
      </div>
      <ErrorLine message={error} />
    </div>
  );
}
