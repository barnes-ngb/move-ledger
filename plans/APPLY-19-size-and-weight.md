Read AGENTS.md, docs/09-glossary.md, docs/02-domain-model.md,
docs/04-screen-specifications.md, and decisions/0007-size-and-weight.md first.
Save this as plans/APPLY-19-size-and-weight.md. Branch off main. Amend doc 02,
doc 04, and the glossary before code.

=== WHY ===

The move ships in one 16 ft PODS: about 710 cu ft usable and a 4,200 lb
contents limit (confirmed with PODS 2026-11-14). A photo estimate puts the
household near 840 cu ft and 5,200 lb. Whether to add a second container
turns on two numbers nobody has measured: the weight of each box and how
many boxes are large totes. The owner will weigh every box on a bathroom
scale. Give him a place to record size and weight fast, and a total to read
against the limit. ADR-0007 approves totals only. No loading order, no
layout, no fit suggestions, no weight estimated from a photo.

=== 1. Domain ===

containerSchema gains, all optional:
  size: z.enum(["bin_large", "bin_medium", "box_large", "box_medium",
                "box_small", "other"])
  volumeCuFt: number > 0, max 200. Used only when size is "other".
  weightLb: number > 0, max 500, at most one decimal place.

Size is independent of `type`. Do not change `type` when size changes.

New src/domain/space.ts (not "load": that word belongs to the loaded status):
  SIZE_VOLUME_CU_FT = {
    bin_large: 5.4,    // 27 gal Greenmade tote, measured 30 x 20 x 15.5 in
    bin_medium: 3.5,
    box_large: 4.5,
    box_medium: 3.0,
    box_small: 1.5,
  }
  volumeOf(container): number | undefined
    size in the table -> the table value; "other" -> volumeCuFt; else undefined.
  spaceAndWeight(containers, zones, capacity) -> {
    counted,            // non-voided containers
    volumeCuFt,         // sum of volumeOf where defined
    noSize,             // count with no volume
    weightLb,           // sum of weightLb where set
    notWeighed,         // count with no weightLb
    estimatedWeightLb,  // weightLb + for each unweighed box with a size,
                        //   the average weight of weighed boxes of that size;
                        //   undefined for a size with no weighed boxes yet
    capacity: { cuFt, lb },
    byZone: [{ zoneId | null, name, colorName, count, volumeCuFt, weightLb,
               notWeighed }],   // grouped by destinationZoneId, the same
                                // zone the box list shows; null = "No room"
    bySize: [{ size, count, volumeCuFt, weightLb }],
  }
  Voided containers are excluded everywhere. Every status is counted: the
  question is what goes in the container, and a loaded box is still in it.

Move gains optional capacityCuFt (number > 0) and capacityLb (number > 0).
Absent means the defaults 710 and 4200, applied in spaceAndWeight, never
written on read. Add both to moveFieldsSchema's pick in
src/repositories/moves.ts so updateMove accepts them. No rules change is
needed for either collection; confirm and say so in the PR.

Repositories: setContainerSize(container, size, volumeCuFt?) and
setContainerWeight(container, weightLb | null) through saveContainer, so
searchText and updatedBy behave as every other field. null clears the
weight. setMoveCapacity(moveId, { capacityCuFt, capacityLb }).

Size and weight edits are metadata, not pipeline state, so they do not write
activity events. Say so in the PR; if you disagree, argue it there.

=== 2. UI ===

Glossary applies to every string. User-facing words:
  bin_large "Large tote", bin_medium "Medium tote", box_large "Large box",
  box_medium "Medium box", box_small "Small box", other "Other".
  The summary screen is "Space and weight". The repeat screen is
  "Weigh boxes". Weight shows as "lb", volume as "cu ft".

Add box: a size row of chips under the room picker, optional, one tap.
Picking Other reveals a cu ft number field. No weight on Add box: boxes are
weighed after they are sealed, on the next screen. Saving never waits on
either field.

Box detail: size chips and a weight field (numeric keypad, inputmode
decimal, "lb" suffix), each saved on change through the repositories.
Clearing the weight field clears the stored weight.

Weigh boxes (new, opened from Space and weight): the non-voided boxes with
no weight, lowest number first. One box at a time: number large, room color
and name, first photo thumbnail if one exists, size chips, weight field
focused. "Save and next" writes and advances. "Skip" advances without
writing. A count line, "14 left". When the list is empty: "Every box has a
weight." with a button back to the summary. Works offline the same way as
every other write in the app: the write is local first and the screen does
not wait for the server.

Space and weight (new, a fourth quiet button on the overview under
"See all boxes"):
  - Two bars: cu ft against capacity, lb against capacity, each with the
    number and the percent. Over capacity turns the bar and number red and
    says by how much: "130 cu ft over".
  - A plain line under the weight bar when any box is unweighed:
    "12 boxes not weighed yet. Estimate with them: 4,610 lb." Omit the
    estimate clause when it is undefined.
  - A line when any box has no size: "9 boxes have no size."
  - By room: one row per room in sortOrder, then "No room", each with
    count, cu ft, lb, and a not-weighed count when nonzero.
  - By size: one row per size present.
  - Capacity: two number fields, cu ft and lb, prefilled from the move or
    the defaults, saved on blur through setMoveCapacity. A one-line note:
    "16 ft PODS: 710 cu ft usable, 4,200 lb."
  - "Weigh boxes" button at the top when notWeighed > 0.
  Every state: loading, empty (no boxes yet), error, offline (show the
  totals from cache and the app's usual offline line).

=== 3. Export ===

toCsv appends three columns at the end, after the existing last column, so
any existing reader keeps its column positions: size, volume_cu_ft,
weight_lb. Size writes the code value. volume_cu_ft is volumeOf, blank when
undefined. The JSON export carries the new fields as they are stored.

=== 4. Tests ===

space.ts: volume per size, other with and without volumeCuFt, voided
excluded, unweighed count, the estimate (including a size with no weighed
boxes), byZone with a null room, capacity defaults. Schema: weight bounds
and one decimal. Repositories: clearing a weight. UI: Weigh boxes advances
on Save and next, skips without a write, shows the empty state; Space and
weight renders over-capacity text and the unweighed line; Box detail saves
size and weight. Export: the three trailing columns and an untouched
existing column order.

=== 5. Verify ===

npm run verify, npm run build. No rules change, so no rules suite run is
required; state that in the PR. No deploy. Docs: doc 02 (fields and the
Move capacity), doc 04 (both new screens and the two changed ones),
glossary (Size, Weight, Capacity, Space and weight, Weigh boxes),
plans/README.md table, plans/STATUS.md. Commit, push, open the PR. Report
where you exercised judgment.
