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
- The color is carried by the color name set in the room's own color at large type, not by a swatch. In the room picker, where the color is one attribute of a chip rather than the subject, a 24px dot is enough.

### Naming

This section previously read "The color swatch is a background fill, not a small dot". Amended 2026-08-02 during the APPLY-05 run, and the code was judged better than the doc here. What a person copies onto cardboard is the word, so the word is what the screen sets in the room's color at large type. A background fill would put the color behind the number and cost contrast on the one mark that has to be read at arm's length. The dot on a room chip is a different job: it labels a choice rather than instructing a hand.

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

### What shipped

Amended 2026-08-15 during the APPLY-08 run. The keypad screen is unchanged and still opens the box the moment one number matches. The other two lines were answered by a second screen rather than by additions to this one.

**See all boxes** is a third action on the move overview, under Find a box. It lists every box with the newest number on top, and a text field at the top of it filters the same list as the person types. Recent boxes are therefore the first thing on it, and the last five are the first five rows, so a person who does not know a number has somewhere to go. A box opened from the list returns to the list with the filter text still in the field.

Two departures from the lines above, both deliberate:

- **Recent boxes are the whole list, newest first, rather than a fixed five.** A cut of five is a guess about how far back a person needs to look. The list costs nothing more, because it is the same local cache either way.
- **The route to text search is on the overview rather than inside Find box.** Find box is the ten-second lookup and it is used standing up with a number in hand. Putting a second destination on it invites a tap that is not the one the screen exists for. The two screens are siblings under the overview instead.

Search itself changed underneath both. It compares word to word rather than testing one substring per field, because the generated contents lists carry quotes, plus signs, and commas that nobody types. Real box 015 came back from the function reading `'Travel + Leisure' magazine`, and "travel leisure" found nothing against a substring test. A box now matches on any one word of the query, and answering more words moves it up the list. A word shorter than four letters has to match a whole word exactly, so "car" does not return every box holding cardboard. Accents are folded before words are compared, so "cafe" finds "café" and nobody has to reach for an accented key while standing in a garage.

Row contents are in section 5's amendment.

Amended again 2026-08-15 during the APPLY-09 run. The keypad screen shows voided boxes, where the box list hides them. That is not an oversight: a person typing a retired number is holding the cardboard it is written on, and an empty result would tell them nothing about why. The row reads "voided" in amber where the status sits.

## 5. Search

### Sources

`displayCode`, title, notes, confirmed contents summary, AI summary, destination zone name.

### Result card

- Box number and primary photo thumbnail
- Destination zone name with color fill
- Status, and any condition badge
- The matching text with the match highlighted
- A marker when the match came from `aiSummary`

### What shipped

Amended 2026-08-15 during the APPLY-08 run. The list row is not this card and was not built as one. A row carries the box number in mono, the room's color dot and name, the title when there is one, the status with `filling` read as draft, a photo count when the box has photos, and the `aiSummary` marker, which is the one line of this card that survived intact.

Three of the lines above are still owed and are worth having only if the list proves hard to read on a phone: the primary photo thumbnail, the color as a fill rather than a dot, and the matching text with the match highlighted. The highlight is the one with real value, since it answers "why did this box come back" without opening it. It was left out because a word match can land in any of six fields and picking the snippet to show is a design question this run did not have an answer to. The row says which field matched only in the `aiSummary` case, where it changes whether the text can be trusted.

Amended again 2026-08-15 during the APPLY-09 run. The condition badge exists now that something writes a condition. It is a line of small amber text in the row's right column, under the status, naming both conditions when a box carries both. Still text rather than a badge, for the same reason the color is a dot rather than a fill: the row is already carrying six things at 14px.

Voided boxes are not in this list by default, and not in these results by default. A control under the search field reveals them, counts them while it offers, and hides them again. Revealed, a row reads "voided" where its status would be. The filter is in the component on purpose, and the comment there says why: `reserveContainer` reads the same container list this screen does, so filtering voided boxes any higher up would hand a retired number to a second physical box.

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

### Photo gallery

Amended 2026-08-15 during the APPLY-08 run. Tapping a thumbnail opens the photo at the size of the screen, fitted whole rather than cropped, with previous and next moving through that box's photos in the order they were taken. The backdrop and a close control both dismiss it. It reads the local blob first and the download URL second, the same order the strip uses, so a photo taken a minute ago with no signal opens. A photo with neither says it has not finished uploading rather than showing a broken image.

### What shipped, APPLY-09

Amended 2026-08-15. This screen gained four things, and one of them is the only action in the app that cannot be undone.

**Title.** A text field saved on its own control, the same shape as the note. The schema had carried `title` since APPLY-01 with nothing setting it. Emptying it deletes the field rather than storing a blank string, so `searchText` stops carrying the old words.

**Conditions.** Two controls, missing and damaged. Both can be set at once and neither touches status, per ADR-0003, so a damaged box still shows `loaded` and still offers its status buttons. A box carrying either is marked twice: a badge under the number here, and a line of amber text in its list row. The report is written with no note and no photo ids. Asking for either at the moment somebody says a box is damaged is what stops them saying it at all, and the fields are on the record for a later screen to fill.

**Void or delete.** One control, below Done and behind a rule, because a thumb reaching the bottom of a scrolled screen must not land on it. Which one it is follows `canDelete`, and the screen only reports the answer:

- A box nobody has written on is deleted. The confirmation says its number goes back and will be given to the next box, and that its photos go with it.
- Every other box is voided. The confirmation says the number is retired and will never be given to another box, because it may already be written on one.

Neither happens on the first press. A voided box says so at the top, hides everything that edits it, keeps its photos and its number on screen because those are what somebody came to check, and offers **Put this box back**, which needs no confirmation because it takes nothing away.

**Photo delete and retry.** Delete is in the full-screen viewer rather than on the strip, because at 96px a person cannot tell which photo they are about to lose. It confirms first, and the viewer closes itself when the last photo goes. The strip's "not sent" marker is now the retry control, per doc 06. The file input no longer carries `capture="environment"`, which was forcing the camera on Android and hiding the library.

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

- Online
- Offline, changes saved here
- Uploading photos, n remaining
- Upload failed, tap to retry

### Rule

Never present local data that has not been copied to the server as lost, invalid, or provisional. It is real data that has not been copied yet.

### Naming

This section previously read "Synced" and "Offline, changes held locally". `docs/09-glossary.md` arbitrated on 2026-08-02 during the APPLY-03 run: sync is not a user-facing word, and the offline string is the one doc 09 already wrote. The online state also reports connectivity rather than write confirmation, because `useOnline` reads `navigator.onLine` and the Firestore SDK does not expose a sync state.
