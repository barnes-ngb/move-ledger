Findings from a full code review before packing starts. File:line refer to
current main. Not compiled before delivery; fix compile errors in place and
report. No rules change is expected; stop and report if one is needed.

=== A. Data loss or lockout ===

A1. src/repositories/moves.ts:28-30 updateMove spreads the whole move into
    updateDoc, so Rooms.tsx:239 (contents-list toggle) and
    ContentsListNotice.tsx:32 rewrite memberUids from this phone's stale
    copy. A queued offline toggle replaying after a member add/remove
    reverts memberUids and locks the helper out with no UI repair path.
    Fix: updateMove must never write memberUids. Add setAiEnabled and
    setMoveNames that update only their fields. memberUids is written only
    by arrayUnion/arrayRemove in members.ts. Test that no caller can send
    memberUids through updateMove.

A2. src/ui/box/AddBox.tsx:257-258 save is two writes (saveContainer sets
    labelConfirmedAt, then setStatus sets packed). Killed between them: a
    "filling" box with a confirmed label that cannot be deleted, cannot be
    resumed (resumable() at :189 refuses it), and Add box reserves a NEW
    number for a box already on cardboard. Fix: one batch for both
    documents plus the activity event, same shape as reserveContainer
    (containers.ts:114-118). Add a packContainer repository function that
    does exactly this; AddBox calls it.

A3. src/photos/uploader.ts:85-104. Offline, uploadBytes retries internally
    ~10 min then rejects; fail() counts it as an attempt, so an hour
    offline burns the five-rung ladder and healthy photos turn "failed"
    with "Send again" (doc 04 section 9 violation). After reconnect the
    600 s backoff still applies. Fix: (1) drainOnce skips every blob when
    navigator.onLine is false, counting nothing; (2) the online event
    clears nextTryById so reconnect retries immediately; (3) set
    maxUploadRetryTime on the Storage instance to ~30 s so a real failure
    surfaces fast. Also fail() must not await patchPhoto(...).written
    (:99,:124): use writeInBackground. Tests for (1) and (2) via drainOnce
    deps.

=== B. Shelly stops and asks ===

B1. Offline, uploaded photos render broken (PhotoStrip.tsx:85-86,
    PhotoViewer.tsx:94-105): blob deleted, download URL unreachable, no
    onError. Fix: vite.config.ts workbox runtimeCaching for
    firebasestorage.googleapis.com, CacheFirst, maxEntries ~600, so a
    photo viewed once stays viewable. Plus onError on both img elements
    falling back to a "Not available offline" tile, never a broken image.

B2. BoxDetail.tsx:69,207-215 offers only forward status moves. A mis-tap
    on "Mark loaded" is permanent. Fix: a quiet "Change status" control
    that reveals every transition canTransition allows, backward ones
    included. Doc 04 section 6 already specifies this.

B3. BoxDetail.tsx:205 and FindBox.tsx:69 render container.status raw, so a
    draft reads "filling". Add one statusLabel() in src/domain or ui and
    use it everywhere BoxList.tsx:182-185 already translates.

B4. Touch targets: PhotoStrip.tsx:97-103 "Send again" is ~24 px; make it a
    56 px control below the tile. App.tsx:80-82 "Someone else set up the
    move" needs min-h-14.

B5. AddBox.tsx:437 leave sheet says "Nothing on this box is saved yet" and
    "along with the N photos on it". Photos ARE saved. Reword honestly:
    the number is reserved and the photos are kept; leaving keeps it as a
    draft or deletes it.

B6. PhotoStrip.tsx:96-103 "Send again" shows for photos whose bytes are on
    the OTHER phone; tapping does nothing visible. Only offer it when a
    Dexie blob exists for that photoId on this device.

=== C. Smaller ===

C1. Home.tsx:116-123, :147; BoxList.tsx:158: gate "That box is gone", the
    empty overview, and "No boxes yet" on `loaded` (already available at
    Home.tsx:50). Show "Loading" until the first delivery.
C2. Home.tsx:137,154 overview count includes voided boxes; list excludes
    them. Count what the list shows.
C3. App.tsx:38 first-run leaves the Rooms screen the moment one room exists
    and never reaches Members. Setup stays open until its Done is tapped.
C4. history.ts:80-81: after a reload on Add box, "Stay on this box" rebuilds
    the entry from Home's views and drops the draftId. Rebuild from the
    entry being guarded, not the one popped to.
C5. AddBox.tsx:348,226-235: back guard is live during "Finding your next
    box number"; answering Leave can race the reserve effect and strand a
    draft. Do not reserve if the screen is unmounting; gate the effect on
    a mounted ref.

=== D. The work that never shipped (was APPLY-14) ===

D1. PhotoStrip.tsx:130-146 "Choose a photo" input gains `multiple`; onFile
    loops every file sequentially through capturePhoto. Give each capture
    a distinct createdAt (increment by 1 ms within a batch) so usePhotos
    and pendingBlobs order is stable. "Take a photo" stays single. Both
    buttons disabled while adding, with a count ("Adding 2 of 5").
D2. AddBox gets a Title field above the note, saved in the same batch as
    A2. Title is already in the schema and editable on BoxDetail.

=== E. Verify and docs ===

npm run verify, npm run build. No deploy. plans/README.md: APPLY-17 row,
and a line that APPLY-14 was never executed and its scope landed here.
STATUS: close every item above that was listed; add nothing new unless you
found it. doc 04: status label rule, change-status control, photo cache
rule. Commit, push, open the PR. Report where you exercised judgment and
anything from the list you declined, with the reason.
