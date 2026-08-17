# Screen Specifications

Every screen must define loading, empty, error, and offline behavior. Where this doc does not name one, the default is: show the last known local data and an offline indicator.

## 0. Navigation

Added 2026-08-15 during the APPLY-10 run. Navigation had grown a screen at a time across five plans and had never been designed as one thing, so a person could reach Add box, Find, the box list, or box detail and have no way back to the move except finishing the flow. An installed PWA runs standalone and shows no browser chrome, so there is no browser back button underneath any of this.

The pattern is two controls, and every screen built after this follows it.

**The title is the way home.** "Move Ledger" in the header is a button on every screen that has a home to go to. It still looks like a title: same words, same weight, nothing moves when it becomes a button. Four places have no home behind them and leave it as plain text rather than offering a button that does nothing:

- Sign-in, where there is no move yet.
- The first-run flow, for the same reason.
- The room setup a move with no rooms is held in, because a box with no room has no color to write on it.
- The contents list notice, which is the one gate with a home behind it and no way past it except answering. Raised in review on pull request 19 and decided there rather than treated as an oversight. Doc 07 requires that both members be told in plain words before a photo of their home goes to a third party, and both answers are one tap and lead straight to the move. A way past it that leaves the question unanswered would ask again on the next photo, which APPLY-07 already ruled out: that is not a question, it is nagging.

The header is rendered above every screen and the state that decides where home is lives in the screens below it, so a screen offers the header a way home while it is on screen and the header uses whatever is currently offered. `src/ui/nav.tsx` holds that, and the reason it is worth a file is the handover: Add box takes the header from the move overview while it is open, so tapping the title there asks about the draft instead of stranding it.

**Back is top left, above the scroll area.** 56px square, the same minimum as every other target, and it does not move as a list scrolls under it. Back returns to wherever the screen was opened from rather than to a fixed screen, so a box opened from the list goes back to the list with the filter text still in the field, and the same box opened from the keypad goes back to the keypad. Box detail names its destination, because it is opened from three places.

**One word per promise.** "Back" returns. "Done" completes something. Before this run box detail said Done and meant go back, while setup said Done and meant finish setup. Done now appears on the two setup screens and nowhere else.

**Every view change pushes a history entry, and the pop is what changes the view.** Added 2026-08-16 during the APPLY-11 run, after the first real use of the installed app. The two controls above were built and worked, and the gesture every Android user reaches for first did not: a standalone PWA shows no browser chrome, the system back gesture fires `popstate`, and with no entry ever pushed there was nothing to pop but the app itself, so Android closed it and took the screen with it.

The rule for every screen built after this: a screen change calls `open` on the view slot, which pushes an entry. Nothing sets a view directly. The on-screen Back and the header title navigate through history too, so the three ways out cannot drift apart. `src/ui/history.ts` holds it, alongside `nav.tsx`, and there is still no router: the `View` union stays in the screen that owns it and only its storage moved.

Four things follow from that and are worth stating rather than rediscovering:

- **Back from the move overview leaves the app.** That is correct. The overview is the root and there is nothing behind it.
- **State that is not a screen change replaces the entry rather than pushing one.** The box list's filter text is the case: eight letters typed is one screen, not eight, and a person leaving the list presses back once.
- **An entry carries every slot's value at the moment it was pushed,** so returning to the list brings its filter text with it. That is the origin tracking APPLY-08 built, now kept by the browser rather than by a `from` field alone. `from` stays, because box detail still has to name where back goes.
- **A screen with a question to ask first refuses the gesture rather than obeying it.** Add box is the only one: the guard puts the entry back and asks about the draft, in the same words the other two exits use.

What a phone has to check is the half jsdom cannot: that the installed app no longer closes on the gesture, and that the gesture inside Add box asks rather than leaving.

**Leaving Add box asks about the draft.** The number is reserved on mount and is spent either way, so the only open question is whether the draft goes with it. Both exits, the back control and the title, ask the same question: delete the draft and the number goes back to the range, keep it and finish the box later from the list, or stay on the box. Keeping it is a real answer rather than a soft cancel, because drafts are visible in the list and can be finished or deleted from box detail. Deleting is safe here and only here, for the reason in section 6: nothing has been written on cardboard yet, which is what `canDelete` reads.

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

Built 2026-08-15 during the APPLY-10 run, having been specified since the doc was written. The screen had been showing "0 boxes, 0 of them yours" to a person who had not started, which is the sentence this section exists to forbid. The three lines are the number and the color, the marker, and the photo before the box is sealed. Rooms and members is the route to setup and was already on the screen.

The counters in **Shows** above are still owed. The overview names the move, counts the boxes, and offers the three actions. Progress by status, the open-first count, boxes by room, and pending photo uploads are not built.

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

### What shipped, APPLY-10

Amended 2026-08-15. Two of the rules above were true of the layout and false on a phone.

**The keyboard was covering `Save and next`.** Both buttons are pinned below the scroll area, which only helps if the layout gets shorter when the keyboard opens. The browser default is `interactive-widget=resizes-visual`: the layout viewport stays at full height and the keyboard slides over the bottom of it, pinned buttons included. `index.html` now asks for `resizes-content` in the viewport meta, which is the whole fix and applies to every screen with a field on it.

**Backgrounding the app preserves the draft, partly.** The reserved number and any photos are Firestore and Dexie records and survive anything. The room and the note are component state and do not survive the screen unmounting. Recorded rather than fixed, because the note is usually typed and saved in the same handful of seconds.

The last error line is still owed: a box saved with no photo is saved, and nothing in the overview flags it.

**The way out.** The back control and the leave question are in section 0.

### What shipped, APPLY-12

Amended 2026-08-17. **The suggestion block is on this screen now, below the photos.** It was built in APPLY-07 and mounted on box detail only, which was wrong about where a person is standing when a suggestion arrives. A summary is written in the background after the photo uploads, so it usually lands while the same box is still being packed, and this screen did not render `aiSummary` at all. The only way to read one was to save the box, leave, open the box list, find the number, and open it.

It is the same component box detail mounts, doing the same four things: accept, edit, dismiss, ask again. It renders nothing when there is no suggestion. Everything it writes goes through the repositories rather than through this screen, so accepting or dismissing cannot reach the room, the note, or the photos, and both save buttons behave exactly as they did.

Two things this required and are worth stating. **The screen now reads the live container** rather than the copy `reserveContainer` handed it on mount, which is what makes anything written to the box while the screen is open visible here at all. And **the save writes that live copy**, which is a fix rather than plumbing: `saveContainer` rebuilds `searchText` from what it is handed, so saving the stale copy took a summary's own words back out of the index and the box stopped answering for them.

A third copy exists for one window, and it is the answer to a defect the first two created. Saving spreads the whole container, and a write promise settles on server acknowledgment, so an answered suggestion returns through the subscription after the tap rather than during it. A save landing inside that window wrote the suggestion back over its own answer, which product rule 8 forbids. So `AiSummary` hands back the container accept and dismiss just wrote, and the screen outranks the subscription with it until the write lands.

**How long it is held is not a question about time.** Ordering the two copies by `updatedAt` was the first answer and it compares two clocks: the answer is stamped by the phone, the suggestion by the function. A phone running slow would discard the answer on the spot and the next save would write the suggestion back, which is the defect wearing a hat. The screen keeps the exact suggestion text that was answered instead, holds the answer while the subscription is still showing that text, and drops it the moment the subscription shows anything else. Dropping it matters as much: Ask again clears the text and asks for another, and an answer held past its own write would suppress every suggestion after it.

What a phone has to check is the shift. The block appears between the photos and the room picker, so a summary arriving while somebody is typing the note moves the field under their thumb. Nothing is lost and no focus changes, and whether the movement is worth answering is not a question jsdom can settle.

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

Amended again 2026-08-15 during the APPLY-10 run. **A box with no room now reads as a thing to fix.** The row drew a colored dot and the room's name, and a box with no room got neither: no dot, and the words "No room" in the same grey the rest of the row uses. Every box in the move was in that state at the time, because a room is optional on Add box. The dot is now drawn as a dashed outline where the color would be, and the row reads "No room. Open it and pick one." in the amber the conditions use, which is the app's one color for a state worth acting on. The keypad screen carries the same marker, so a row does not read differently on two screens. It is on box detail too, above the Change room control that fixes it.

Amended again 2026-08-17 during the APPLY-12 run. **A row says when its box is carrying a suggestion nobody has answered, with nothing typed in the search field.** The marker above is a fact about the query: it fires only when `aiSummary` was the one field a word reached, so with no query typed a move with eleven unconfirmed suggestions looked exactly like a move with none, and reviewing one later was a memory test rather than a rhythm.

Both markers are the same line in the row's left column, so they cannot appear at once. Matched by a query and nothing else matched, it reads "Matched a suggestion nobody has confirmed", unchanged. Otherwise, carrying one, it reads "A suggestion nobody has confirmed". Doc 09 arbitrates the wording: this is not confirmed text, and the row says so in the words it already used rather than inventing a second phrase for the same state.

Accept and dismiss both clear `aiSummary`, so the field being present is the whole question and there is no flag to keep. A voided box is left unmarked, for the reason its row reads "voided" instead of a status: its number is retired and there is nothing to go and do about it. It keeps the search marker, which answers a different question.

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

**Contents.** Added 2026-08-16 during the APPLY-11 run, and it is a correction to what shipped rather than a new feature. The contents list could be edited in the one moment a suggestion was accepted and never again: accepted into `contentsSummary`, or reached from anywhere other than that panel, it was text on a screen with nothing to change it. It is now a text area with its own save control, the same shape as the title and the note, and it is where the read-only block used to be so the reading order of the screen does not change. A voided box shows it and cannot change it, like everything else here.

The save goes through `setContentsSummary`, which goes through `saveContainer`, because `searchText` is rebuilt there and a direct field write would leave search answering for words that are no longer on the screen. Emptying it removes the field with a `deleteField` sentinel for the reason the title does: a key left out of an update leaves the stored value, so a cleared list would keep matching searches. The suggestion panel is untouched. While an unaccepted suggestion is on screen, accept, edit, dismiss, and ask again behave exactly as APPLY-07 built them, and accepting one fills the field below it.

**Void or delete.** One control, below Done and behind a rule, because a thumb reaching the bottom of a scrolled screen must not land on it. Which one it is follows `canDelete`, and the screen only reports the answer:

- A box nobody has written on is deleted. The confirmation says its number goes back and will be given to the next box, and that its photos go with it.
- Every other box is voided. The confirmation says the number is retired and will never be given to another box, because it may already be written on one.

Neither happens on the first press. A voided box says so at the top, hides everything that edits it, keeps its photos and its number on screen because those are what somebody came to check, and offers **Put this box back**, which needs no confirmation because it takes nothing away.

**Photo delete and retry.** Delete is in the full-screen viewer rather than on the strip, because at 96px a person cannot tell which photo they are about to lose. It confirms first, and the viewer closes itself when the last photo goes. The strip's "not sent" marker is now the retry control, per doc 06. The file input no longer carries `capture="environment"`, which was forcing the camera on Android and hiding the library.

### Adding a photo: two controls, one path

Amended 2026-08-16 during the APPLY-11 run, and this is the settled pattern for anywhere a photo is added. The line above was half right and cost the camera. Removing `capture` did not make one input offer both the camera and the library; on the phone this app is built for, it made that input offer files only. `capture` is a hint, and a browser is free to read it as "camera only", "camera first", or to ignore it. Neither state of one attribute gets both.

So the strip stops asking one input for two jobs and asks the person instead:

- **Take a photo.** `accept="image/*"` with `capture="environment"`.
- **Choose a photo.** `accept="image/*"` and no `capture`.

Both 56px, both feeding the same `capturePhoto` call, so nothing downstream knows or cares which one was pressed. The control that was pressed says "Adding" while the photo is resized and written, and the other is disabled meanwhile. The `+` tile is gone: two labelled controls say what the tile only implied, and the thumbnails are the strip now.

A test can prove which input asks for what. It cannot prove what Android offers in answer, which is the half that has to be checked on a phone.

## 7. Rooms

### Shows

Room name, short code, color, box count, delivered count, unopened count.

### Actions

Add, edit, view boxes in room, open full-screen color chart.

### Export

Added 2026-08-15 during the APPLY-10 run. Product rule 10 says the user must be able to export all data, and `toCsv` and `toJson` had been written and tested since APPLY-01 with nothing calling them. The rule was true of the domain layer and false of the app.

Two files, offered on this screen because it is the one a person reaches from the move when they are not packing.

- **The spreadsheet.** A row per box, with missing and damaged in their own columns. That shape is the point: filter to the damaged rows and the list is the insurance conversation.
- **The data file.** The whole move, including the members, the places, the photo records, and the activity history. This is what somebody would need to rebuild the move somewhere else.

Both are named for the move and the day, `kc-to-dfw-2026-08-15.csv`, because two exports in one week are otherwise indistinguishable in a downloads folder. The name is run through the search tokenizer rather than a second punctuation rule, so accents fold and nothing lands in a file name that should not be there.

Client side and dependency free. The text is built from the local cache and handed to the browser as a Blob, so an export works with no signal and nothing about the household leaves the phone to produce it. The three collections it needs and the setup screen does not, containers, photos, and activity, are subscribed only while this screen is open, for the reason `usePhotoCounts` does the same: doc 11 counts reads.

The block is hidden until the move has a box, which also keeps it off the screen during first-run setup.

Nothing is offered until all three listeners have answered, and nothing is offered at all once one of them has stopped. Raised in review on pull request 19, and the reason it is a refusal rather than a warning is that the three answer independently: a file built while the photo listener is still on its way carries a photo count of zero against every box, and a file built while the activity listener is still on its way carries an empty history. Neither says it is short. The one reader this export has is somebody checking what was in a box that arrived crushed, and a confident wrong answer is worse for them than no file. A stopped listener says so on the block and the way back is to open the screen again, which opens fresh listeners.

### Changing a room's color

Added 2026-08-16 during the APPLY-11 run. A room was given a color at creation, the first one in `PALETTE` nobody had taken, and nothing could ever change it. That is the wrong way round. The physical system is sticker sheets somebody bought in a shop, so the app has to match what is on the roll rather than tell a person which color their kitchen is. Product rule 3 already said zone colors are editable metadata; nothing in the app had made that true.

The color on each room row is the control. Tapping it opens the eight named palette entries, each 56px, and choosing one writes `colorName` and `colorValue` together through `updateZone`.

Two things it deliberately does not do:

- **No free color input.** Doc 09 is the arbiter here: `colorName` is written on cardboard with a marker, so it is one legible uppercase word from the fixed palette. A picker would produce something nobody can write and nobody can read at arm's length.
- **No refusal when two rooms share a color.** A chip says which other room already wears it, and once two do, a line under the list says so in plain words. Somebody with two sheets of the same sticker is not making a mistake, and the number on the box is what tells two boxes apart anyway.

Nothing caches a color. Every screen that draws one reads it from the zone it was handed out of the live subscription: the list row, the keypad row, the room picker, box detail, the label instruction on Add box, and the CSV, which reads `colorName` at export time. `searchText` carries the room's name and not its color, so a color change needs no rebuild. A box already written in the old color shows the new one the moment the write lands, which is exactly what somebody re-labelling a room wants to see.

The other actions above are still owed. This screen adds a room, shows the list, and changes a color. Renaming a room, viewing the boxes in one, and the full-screen color chart are not built.

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

Amended 2026-08-15 during the APPLY-10 run. The rule reaches further than the header. A photo the other phone took, whose bytes have not arrived here, drew as an empty grey square on the photo strip, which reads as broken rather than as pending. That tile now says "Not on this phone yet". The full-screen viewer already said it and the strip did not.

### Naming

This section previously read "Synced" and "Offline, changes held locally". `docs/09-glossary.md` arbitrated on 2026-08-02 during the APPLY-03 run: sync is not a user-facing word, and the offline string is the one doc 09 already wrote. The online state also reports connectivity rather than write confirmation, because `useOnline` reads `navigator.onLine` and the Firestore SDK does not expose a sync state.

## 10. The APPLY-10 audit

Every screen was walked against this doc on 2026-08-15. Recorded here because the next person to add a screen needs the list of rules that were actually checked, and because half of these were already right and should not be re-argued.

### Touch targets, 56px

The floor is 56px for anything a thumb lands on, `min-h-14` in the shared kit, and 64px on Move Day per section 8. Written down here for the first time in this run: the kit had been citing this doc for a number this doc never carried.

Fixed: four controls at 48px. The route to Rooms and members on the move overview, the show and hide voided boxes control on the box list, and both controls on the account screen. Back and the title in the header are new and are 56px and 44px, the title being a title first.

Already compliant: every `Button` in the kit, the keypad, the box list rows, the room chips, the photo strip tiles and the add tile, which are 96px. Section 8's Move Day controls do not exist yet and are not a finding.

### The keyboard never covers the primary action

Fixed: the viewport meta, in section 2's amendment. This was failing on every screen with a field, not only Add box, and the pinned footer that was supposed to answer it could not.

Already compliant: the pinning itself on Add box.

### No unsynced data presented as provisional

Fixed: the blank photo tile, in section 9.

Already compliant: the header indicator, every "saved on this phone" error line, the box list, which never waits on the network and says so in a comment, and the offline case of the full-screen photo.

### The number readable at arm's length

Already compliant: 72px on Add box, raised to that in 2026-08-02 and unchanged. Nothing else on a screen is the mark a person copies onto cardboard, so nothing else is held to it.

### Named items

- **Box list rows with no room.** Fixed, in section 5.
- **The photo strip meets 56px.** Already compliant at 96px, both the thumbnails and the add tile.
- **Buttons disabled during a write say why.** Fixed on the photo strip's add tile, which is the one write on that screen long enough to see and which dimmed with no explanation. It now reads "Adding". Already compliant on sign-in, on the first-run flow, and on the contents list, all of which change their own label. Two disabled buttons were judged not to be this: Save title and Save note are disabled when nothing has changed, which the field above them shows, and no button in the app is disabled while a background write is in flight, on purpose, because a Firestore write promise settles on server acknowledgment and disabling anything on it would hang the screen offline.
- **Safe-area insets everywhere, not only App.tsx.** Fixed: horizontal insets, which nothing carried, on the app frame, the full-screen photo, and the confirmation sheets. Already compliant: the top and bottom insets on the app frame and the photo viewer, and the bottom inset on the sheets.

### Found and not fixed

Each of these is a feature rather than a polish, and is recorded in `plans/STATUS.md`.

- The move overview shows none of the counters in section 1. The empty state was the failing rule and is fixed; the counters are owed.
- A box saved with no photo is not flagged anywhere, per section 2.
- The room and the note on Add box do not survive the screen unmounting, per section 2.
- Three lines of section 5's result card are still owed, unchanged since APPLY-08 recorded them.
- Section 7's edit, view boxes in room, and color chart are not built. Half of the first one closed on 2026-08-16: a room's color can be changed, its name still cannot.
- `src/ui/Account.tsx` is reachable from nowhere. It was APPLY-03's screen for reading a uid and the waiting screen took that job. Its targets were raised with the rest and it is still dead code.
