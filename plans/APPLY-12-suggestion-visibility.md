# APPLY-12: Suggestion visibility

A correction from real use, in the same shape as APPLY-11. Nothing here is a
new feature. Every part of it is the generated contents list being invisible in
the two places a person actually stands.

## The finding

The suggestion block was built in APPLY-07 and mounted on box detail only.

A summary is written in the background, after the photo uploads, which means it
usually lands while the person is still on Add box packing the same box. Add box
never rendered `aiSummary`, so the suggestion arrived into a screen that did not
show it. The only way to see it was to save the box, leave, open the box list,
find the number, and open it.

And nothing anywhere said a suggestion was waiting. The box list marks a row
only when a search matched `aiSummary` and nothing else, which is a fact about
the query rather than about the box. With no query typed, a move with forty
boxes and eleven unconfirmed suggestions looks exactly like a move with none.

Together those two make "review it later" a memory test. Doc 07's rule is that
AI suggests and the person confirms, and a suggestion nobody can find is a
suggestion nobody confirms.

## Acceptance criteria

Written before implementation, per `AGENTS.md`.

1. On Add box, when the draft on screen has an `aiSummary`, the suggestion block
   appears below the photos with accept, edit, dismiss, and ask again, and all
   four behave exactly as they do on box detail.
2. It is the same component. `AiSummary.tsx` is not forked, copied, or
   parameterized for two callers.
3. Accepting on Add box does not clear the note, the room, or the photos, and
   the box saves afterward carrying the accepted contents list.
4. Dismissing on Add box removes the block and disturbs nothing else.
5. A box list row whose box carries an `aiSummary` nobody has accepted or
   dismissed shows a marker, with no query typed.
6. A row that came back for a search that only `aiSummary` matched keeps the
   wording it has today. The two markers do not stack.
7. `Save and next` and `Save and finish` behave identically whether or not a
   suggestion is showing.
8. Loading, empty, error, offline: nothing new. The block renders nothing when
   there is no suggestion, every write goes through `writeInBackground` like the
   rest of the screen, and the list row reads a field of the local cache.

## Step 1. Add box reads the live container

`AddBox` holds the reserved container in `useState` and never updates it. That
state is written once by `reserveContainer` and is the only copy the screen
looks at, so a summary arriving through the subscription cannot reach it.

The `containers` prop is the live subscription and already carries the draft.
So:

```ts
const live = container ? (containers.find((c) => c.id === container.id) ?? container) : null;
```

The fallback matters: between the reserve and the listener's first delivery
there is a window where the draft is in the local cache and not yet in the prop.

`save()` moves onto `live` as its base too, and that is a fix rather than
plumbing. It spreads the container it is saving into the write, and
`saveContainer` rebuilds `searchText` from what it is handed. Based on the stale
copy, a box saved after a suggestion arrived got a `searchText` computed without
it, so the summary was stored and unfindable until the next write to that box.
Accepting first made it worse: `contentsSummary` survives, because a key left
out of an update leaves the stored value, and `searchText` is rebuilt without
the words the box now holds.

## Step 2. Mount the existing block

`AiSummary` is imported and rendered directly below the photo strip, with
`live` as its container and `photos.map((v) => v.photo)` for its photos, which
is the same call box detail makes. It returns null with no suggestion, so
nothing appears until one exists.

`key={live.id}` resets its edit state at the box boundary. Save and next swaps
the container underneath a mounted component, and a half-typed edit of box 41's
suggestion must not be sitting in box 42's.

Nothing else on the screen changes. The room, the note, and the photo strip keep
their own state, and the block writes through the repositories rather than
through this screen, so accepting and dismissing cannot reach them.

## Step 3. The box list marker

A box has an unconfirmed suggestion exactly when `aiSummary` is present: accept
and dismiss both clear the field through `withoutAiSummary`, so there is no
third state to read and no flag to add.

The row already has one line for this, in the left column under the title, and
the new marker goes in the same place so the two cannot appear at once:

- Matched by a query and nothing else matched: "Matched a suggestion nobody has
  confirmed", unchanged.
- Otherwise, carrying one: "A suggestion nobody has confirmed".

Same amber the row uses for every other state worth acting on, at 14px, in the
column that already carries the room and the title.

A voided box does not get the second marker. Its number is retired and the row
already reads "voided" instead of a status for the same reason: the row is
telling a person what to do about the box, and there is nothing to do about that
one. It keeps the first marker, which explains why a search returned it.

## Step 4. Tests

`AddBox.test.tsx` gains the repository and callable stubs `AiSummary` needs,
then:

- The block does not render for a draft with no summary.
- It renders when the container in the prop carries one.
- Accepting calls `acceptAiSummary` and leaves the typed note and the picked
  room on screen.
- `Save and next` with a suggestion showing saves and reserves, unchanged.

`BoxList.test.tsx`:

- A box carrying a summary is marked with no query typed.
- A box with no summary is not.
- A search that only the summary matched keeps the old wording and does not
  show both.
- A voided box carrying a summary is not marked when voided boxes are revealed.

## Step 5. Docs

- `docs/04-screen-specifications.md` section 2, what Add box now shows, and
  section 5, the row marker.
- `plans/README.md`, a row in both tables.
- `plans/STATUS.md`, an APPLY-12 entry.

## Out of scope

- The header count of pending photo uploads. Still owed, still doc 06's, and
  unrelated to whether a suggestion is visible.
- A count of unconfirmed suggestions on the move overview. Section 1's counters
  are owed as a group and belong in one run.
- Changing when a summary is generated, what it says, or what it costs. Doc 07
  governs all three and none of them is wrong here.
- The note-clearing defect on box detail, recorded under Live drift. Adjacent
  code, different field, not this run.

## Judgment calls to record in the pull request

- Where the block sits on Add box, and what it costs. Below the photos is
  where it was asked for and where it reads, since it is written from them. The
  cost is that it appears between the photos and the room picker, so a summary
  arriving while somebody is typing the note moves the field they are typing in.
  Nothing is lost and no focus changes. It is a shift under a thumb and only a
  phone can say whether it matters.
- Suppressing the marker on a voided row.
- Basing `save()` on the live container, which fixes a `searchText` defect this
  run was not sent to find.

## Amendment, found in review

Recorded here rather than folded into the steps above, the way APPLY-09 did it,
because the plan is a record of how the code got its shape and this is part of
that shape.

Step 1 as written introduced a defect of its own, raised on pull request 21 and
confirmed by reading the code. Saving spreads the whole container into the
write, so basing it on the live copy means that answering a suggestion and
tapping save inside the same moment writes the suggestion back over the answer.
The window is the one between the tap and the subscription redelivering the
box, which every write has because a Firestore write promise settles on server
acknowledgment. Dismissed, the suggestion returns from the dead. Accepted after
an edit, `contentsSummary` survives and `searchText` is rebuilt from the old
suggestion instead, so the accepted wording is unsearchable and the row goes on
saying nobody has confirmed it. Product rule 8 forbids both.

The fix is a third copy of the box on this screen. `AiSummary` takes an optional
`onAnswered` and hands back the container accept and dismiss just wrote, which
is available immediately because validation and the local write are both
synchronous. `liveContainer` picks between the three: the subscription is the
authority, the reserve-time copy covers the window before its first delivery,
and an answer given here wins over both while it is strictly newer. Every writer
stamps `updatedAt`, the function included, so the prop takes over the moment the
answer lands. That last part is what keeps Ask again working: it clears the text
and the function writes a new suggestion, stamped later, and the screen must not
go on showing the blank.

Box detail passes no `onAnswered` and is unchanged. It has no save of its own
that carries this field.

Three tests, and all three fail with the callback unwired.
