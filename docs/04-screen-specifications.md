# Screen Specifications

Every screen must define loading, empty, error, and offline behavior. Where this doc does not name one, the default is: show the last known local data and an offline indicator.

## 1. Move overview

### Purpose

Show progress and the next useful action.

### Shows

- Total boxes, packed, loaded, unloaded, opened
- Open-first count
- Boxes by destination zone
- Pending photo uploads
- Recent activity, last ten events

### Actions

- Add box
- Find box
- Move Day

### Empty state

Explain the physical system in three lines and route to zone setup. Do not show zeroed counters to a user who has not started.

## 2. Add box

### Purpose

Record a box with the least possible effort.

### Required

- Reserved box number, assigned before any input
- Destination zone
- At least one contents photo

### Optional

- Title, note, owner, priority, handling flags, closed-box photo

### Primary action

`Save and next`

### Behavior

- The number appears before the user does anything. It never changes.
- Selecting a zone updates the label instruction with no intermediate screen.
- The label block is readable at arm's length while holding a marker. Minimum 72px for the number.
- The camera opens in place. It does not navigate away and lose the draft.
- The keyboard never covers `Save and next`.
- Backgrounding the app preserves the draft.

### Errors

- A failed photo upload never discards the captured image.
- A validation failure never clears entered text.
- A box with no photo can still be saved. It is flagged in the overview as incomplete.

## 3. Label instruction

Part of Add box, not a separate route. Shown as soon as a zone is selected.

```text
BOX 042

WRITE ON TWO SIDES

042
BLUE
```

Optional handling line, when flags are set:

```text
OPEN FIRST
FRAGILE
```

Rules:

- The user is not required to photograph the written label.
- Zone name may appear as small supporting text. Number and color are the required marks.
- The color swatch is a background fill, not a small dot.

## 4. Find box

### Default

- Large numeric input, focused on mount
- Numeric keypad
- Recent boxes, last five
- Link to text search

### Result

Open the exact box the moment one number matches. Do not require a submit tap.

### Offline

Searches the local cache. Identical behavior, no degraded mode.

## 5. Search

### Sources

`displayCode`, title, notes, confirmed contents summary, AI summary, destination zone name.

### Result card

- Box number and primary photo thumbnail
- Destination zone name with color fill
- Status, and any condition badge
- The matching text with the match highlighted
- A marker when the match came from `aiSummary`

## 6. Box detail

### Shows

- Number, zone, color
- Photo gallery
- Note and contents summary
- Priority and handling flags
- Condition reports with their photos
- Current location and status
- Activity history
- Photo upload state

### Actions

State-dependent. Only the legal next transitions appear as primary buttons. Everything else lives behind an overflow menu.

## 7. Rooms

### Shows

Room name, short code, color, box count, delivered count, unopened count.

### Actions

Add, edit, view boxes in room, open full-screen color chart.

## 8. Move Day

### Controls

```text
FIND BOX
LOAD BOX
UNLOAD BOX
REPORT DAMAGE
OPEN-FIRST BOXES
ROOM COLOR CHART
```

### Requirements

- Touch targets at least 64px
- High contrast, readable in a garage or in direct sun
- Minimal text entry
- No nested navigation
- Fully functional offline
- After each action, the previous mode stays active and the input refocuses

## 9. Sync state

Not a screen. A persistent indicator in the header.

### States

- Synced
- Offline, changes held locally
- Uploading photos, n remaining
- Upload failed, tap to retry

### Rule

Never present local unsynced data as lost, invalid, or provisional. It is real data that has not been copied yet.
