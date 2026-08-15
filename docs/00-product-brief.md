# Product Brief

## Working name

Move Ledger

## Problem

A household move creates a temporary information problem.

People pack objects into many similar boxes, move those boxes through staging areas and vehicles, then try to find specific belongings while tired and under time pressure. Handwritten labels are fast but hold almost nothing. Full inventory systems hold more but cost more effort than anyone will spend at 11pm with a roll of tape.

Move Ledger pairs a fast physical labeling method with a richer digital record.

## Core concept

Each box receives a permanent move-scoped number from the app.

The user writes the number and the destination zone color on at least two sides of the physical box.

```text
042
BLUE
```

The app stores contents photos, a short note, the destination zone, current location, handling flags, unpacking priority, status history, and the household member who packed it.

The physical box only needs enough marking to connect it to the app.

## Users

Two adults packing at the same time on two phones. That is the whole user model. There are no helper accounts, no viewer accounts, and no sharing beyond the household.

## Product principles

1. Box-centric, not item-entry-centric.
2. A photo beats a form.
3. Writing a number is enough to connect a box to the system.
4. Scanning and printing are not part of the system.
5. The app works with poor or absent connectivity.
6. AI proposes. The person confirms.
7. Move-day actions require very few taps.
8. The physical system stays understandable without opening the app.
9. The app reduces work rather than adding a second job.

## Success measures

Three things decide whether this was worth building:

1. Packing a box, photos included, never waits on the app. No spinner, no network wait, no lost work, including with no signal at all.
2. A box can be found by its number in a few taps.
3. Shelly packs twenty real boxes without asking for help.

These replace two numbers that stood here until 2026-08-15: a box recorded in under 20 seconds and a known box opened in under 10. Those numbers were proxies for low enough friction that the tool does not get abandoned in week three. With a photo in the flow the stopwatch measures the wrong thing, because the time is now spent on the physical box rather than on the app. What matters is that none of it is spent waiting.

Supporting measures:

- Two people pack at the same time without duplicate numbers.
- Packing continues with no connectivity in a basement or a truck.
- Every box is findable by a contents search.
- All move data exports to JSON and CSV.

## Non-goals

- Replacing professional mover logistics software
- Valuing household objects
- Modeling truck geometry
- Printed labels or QR codes
- Tracking every individual object
- Financial planning for the move
