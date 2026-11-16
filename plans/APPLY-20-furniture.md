Read AGENTS.md, docs/09-glossary.md, decisions/0007-size-and-weight.md, and
decisions/0008-furniture-and-estimated-weight.md first.

=== WHY ===

Boxes came to about 1,550 lb and 190 cu ft once 34 of 62 were weighed. The
second-container decision now turns on furniture, which is not in the app, and
furniture does not go on a bathroom scale. The owner chose: furniture numbered
like a box; a preset list of typical cu ft and lb, editable; a "Not sure it's
going" mark with the summary showing totals with and without.

=== 1. Domain ===

containerSchema gains weightEstimated?: boolean and undecided?: boolean.
New src/domain/furniture.ts: FURNITURE_PRESETS (id, label, group, type
furniture|appliance, cuFt, lb), FURNITURE_GROUPS, isFurniture(c) for type
furniture or appliance.
spaceAndWeight adds estimatedLb, furniture {count, volumeCuFt, weightLb},
undecided {same}. Undecided pieces stay in every main total. Estimated
weights are never part of the per-size average.

=== 2. Repositories ===

setContainerWeight takes an optional `estimated`; absent keeps the existing
mark; null weight clears the mark. setContainerUndecided(on|off), off as a
delete. No activity events.

=== 3. UI ===

Add box gains kind="furniture" (view addFurniture, reached from Space and
weight): "Write on tape on the piece", the preset picker in place of size
chips, cu ft and lb fields, "Weight is a guess" (on by default), "Not sure
it's going". Saves type from the preset, size "other", and the marks, in the
same packContainer batch. Title falls back to the preset label.
Box detail: the two checks on furniture, or on any box already carrying a mark.
Space and weight: "N lb of that is a guess", "Without the pieces you're not
sure about: X cu ft, Y lb.", a Furniture section listing pieces (tap opens box
detail), and "Add furniture".

=== 4. Export ===

Two trailing columns after weight_lb: weight_estimated, not_sure ("yes" or
blank).

=== 5. Verify ===

npm run verify, npm run build. No rules change. Docs 02, 04, glossary,
plans/README.md, plans/STATUS.md.
