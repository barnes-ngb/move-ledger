Read AGENTS.md, CLAUDE.md, docs/09-glossary.md, and
docs/04-screen-specifications.md first.

Save this brief verbatim as plans/APPLY-10-navigation-and-polish.md, then
execute it. Branch: feat/navigation-and-polish.

Not compiled before delivery. Fix compile errors in place and report what
changed.

=== THE PROBLEM ===

Navigation grew screen by screen across five plans and was never designed as
one thing. Confirmed holes:

- No way home. From Add box, Find, the box list, or box detail, nothing
  returns to the home screen except completing the flow or the browser back
  button, which a standalone PWA does not show.
- Add box cannot be left without saving. Backing out is how drafts strand,
  and there is no back-out control at all.
- Exit labels are inconsistent: "Done" on box detail means "go back", "Done"
  on setup means "finish setup". Same word, different promises.

=== STEP 1: one navigation pattern ===

Make the "Move Ledger" title in the header a home button on every screen
except sign-in. Keep it looking like a title; tapping it goes home. This is
the standard PWA pattern and costs no layout.

Add a consistent back affordance to every screen that is not home: a left
chevron or "Back" at the top left, above the scroll area, at least 44px
square. It returns to wherever the screen was opened from — the existing
origin-tracking from APPLY-08 governs, so detail from the list goes back to
the list with the filter intact.

On Add box, back means abandoning the draft. Do not silently strand it:
offer to delete the draft or keep it, in the glossary's words. Keeping it is
fine because drafts are now visible in the list; the offer is what matters.

Relabel exits so the word matches the action: "Back" when it returns, "Done"
only when it completes something.

=== STEP 2: audit against doc 04, fix what fails ===

Doc 04 carries the rules this app was designed under: 56px minimum touch
targets, the keyboard never covering the primary action, no unsynced data
presented as provisional, the number readable at arm's length.

Walk every screen against those rules and fix what fails. List each fix in
the PR description with the doc 04 rule it satisfies. Do not restyle for
taste — every change must trace to a rule or to one of these named items:

- The box list rows: room color and name are invisible when a box has no
  room, which is currently every box. When a box has no room, make that
  state visually distinct enough to prompt fixing it, not just grey text.
- The photo strip + tile and thumbnails meet 56px.
- Buttons disabled during a write show why (the existing busy patterns), not
  just a dimmed button.
- Safe-area insets on every screen, not only App.tsx — check the photo
  viewer and confirmation sheets.

=== STEP 3: the export ===

toCsv and toJson have been built and tested since APPLY-01 and are reachable
from nowhere. Add an "Export" action on the Rooms and members screen:

- Download the CSV, named with the move name and date.
- Download the JSON the same way.
- Client-side only: build the string from the existing subscriptions, make a
  Blob, trigger a download. No new dependencies, no server.

The CSV puts conditions in their own columns for an insurance conversation;
that is the value here.

=== STEP 4 ===

npm run verify, npm run build. Do NOT deploy — CI ships from main.

=== STEP 5: docs ===

- plans/README.md: APPLY-10 row.
- plans/STATUS.md: this plan; close the export drift entry; record the
  navigation pattern as settled so future screens follow it.
- docs/04-screen-specifications.md: the navigation pattern, the export, and
  each audit fix.

Commit, push, open the pull request. Do not merge. Report the PR URL, the
full list of audit findings with what you fixed and what you judged already
compliant, and where you exercised judgment.
