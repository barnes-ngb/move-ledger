# APPLY-11: corrections from use

Delivered 2026-08-16. The brief is reproduced verbatim below, as it arrived.

---

Read AGENTS.md, CLAUDE.md, docs/09-glossary.md, and
docs/04-screen-specifications.md first.

Save this brief verbatim as plans/APPLY-11-corrections-from-use.md, then
execute it. Branch: feat/corrections-from-use.

Not compiled before delivery. Fix compile errors in place and report what
changed.

Four findings from real phone use. Two are regressions.

=== 1. BACK EXITS THE INSTALLED APP (regression, fix first) ===

The view state in Home.tsx and App.tsx is a useState switch with no History
API behind it. In an installed standalone PWA the system back gesture fires
popstate; with no history entries pushed, Android exits the app. The APPLY-10
back buttons work, but the gesture every Android user reaches for first does
not.

Fix: push a history entry on every view change and drive the view switch from
popstate, so the system gesture, the on-screen Back, and the header title all
travel the same path. From the home view, back may exit — that is correct.
Keep the existing origin-tracking (detail from the list returns to the list
with the filter intact). Test what can be tested in jsdom; say plainly what
only a phone can verify.

=== 2. CAMERA IS GONE FROM PHOTO CAPTURE (regression) ===

APPLY-09 removed capture="environment" so the picker would offer camera and
library. On Android it now offers only files. The attribute is a hint that
browsers interpret inconsistently, so stop relying on it: two explicit
controls in PhotoStrip —

  "Take a photo"    -> input with accept="image/*" capture="environment"
  "Choose a photo"  -> input with accept="image/*" and no capture

Both feed the existing capturePhoto path unchanged. Labels per the glossary,
targets at least 56px.

=== 3. THE GENERATED CONTENTS LIST IS UNEDITABLE AFTER THE FACT ===

Edit exists only inside the accept flow. Once accepted into contentsSummary,
or once past that screen, nothing edits it.

Fix: on box detail, the contents list (contentsSummary when present) is
editable like the note and the title — a text area with a save action. The
save MUST go through saveContainer so searchText is rebuilt; a direct field
write would make search drift from what is displayed. While an unaccepted
suggestion is showing, the existing accept/edit/dismiss flow is unchanged.

=== 4. ROOM COLORS MUST BE CHANGEABLE (new, sticker matching) ===

Rooms get their color assigned automatically at creation and it can never be
changed. The physical system is sticker labels, so the app must match the
stickers, not dictate to them.

On the Rooms screen (Rooms and members), each room row gains a way to change
its color, choosing from the existing named PALETTE. Constraint from doc 09:
colorName is handwritten on cardboard, so the choice is the fixed named
palette only — never a free color input. Two rooms may share a color if the
person chooses; warn gently, do not block (they may have two sticker sheets).
The change goes through updateZone. Zone color is displayed from live zone
data everywhere (list rows, room picker, box detail), so confirm nothing
caches it — report anywhere it does.

=== STEP 5 ===

npm run verify, npm run build. Do NOT deploy — CI ships from main.

Docs: plans/README.md row; plans/STATUS.md — record finding 1 and finding 2
as regressions with one line each on why they escaped (history was never
wired; capture attribute is a hint, not a contract); doc 04 gains the
navigation-history rule and the two-button capture pattern so they are not
reintroduced.

Commit, push, open the pull request. Do not merge. Report the PR URL and
where you exercised judgment.
