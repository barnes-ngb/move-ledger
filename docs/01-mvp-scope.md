# MVP Scope

## Release objective

Prove the complete box loop on two phones:

1. Configure destination zones
2. Create a numbered box
3. Photograph its contents
4. Write its number and zone color on the physical box
5. Mark it packed
6. Find it later
7. Load it, unload it, open it
8. Export the record

## In scope

### Move setup

- Create one move
- Create origin and destination locations
- Create destination zones with a name, short code, and color
- Add the second household member
- Assign each member a number range

### Box creation

- Assign the next number in the current member's range before any data entry
- Display the number in large type
- Display the destination zone color
- Show exactly what to write on the box
- Capture one or more contents photos
- Add a short title or note
- Select destination zone
- Set unpacking priority
- Set handling flags
- Confirm the label was written
- Mark packed
- Go straight into the next box

### Box lookup

- Numeric lookup by box number
- Text search across title, note, and contents summary
- Filter by zone, status, and priority
- Photo grid browse

### Status and conditions

Status values, in pipeline order:

```text
filling
packed
staged
loaded
unloaded
opened
emptied
```

Conditions, independent of status:

```text
missing
damaged
```

A box can be loaded and damaged at the same time. See `decisions/0003-status-versus-condition.md`.

### Move Day mode

- Large numeric entry
- Load box
- Unload box
- Report damage
- Report missing
- Open-first list
- Full-screen zone color chart

### Offline

- Create and edit boxes with no connectivity
- Capture photos with no connectivity
- Assign numbers with no connectivity and no duplicates
- Show a clear offline indicator
- Show pending photo uploads and let the user retry

### Export

- JSON export of moves, zones, containers, photos, and activity
- CSV export of a flat box list
- Delete the move and its data

## Out of scope

Cut for a personal tool. Each of these was in an earlier draft and is deliberately removed.

- Helper and viewer roles
- The `Item` entity and per-object records
- Conflict review UI
- AI packing warnings, unpacking plan generation, and damage comparison
- Server-side dynamic number block allocation
- `planned` and `in_transit` statuses
- Packing material tracking
- Move completion summary

## Acceptance criteria

The MVP is accepted when the household can:

- Configure five destination zones
- Create 100 boxes across two phones with no duplicate numbers
- Pack a box, photos included, without the app making anyone wait. No spinner, no network wait, no lost work, including with no signal at all
- Find a box by its number in a few taps
- Create boxes in a basement with airplane mode on, and see them reach the other phone afterward
- Find a box by searching a word from its note
- Track boxes through load, unload, and open
- Export the move to JSON and CSV
- Pack twenty real boxes, with Shelly working alone and asking for no help
