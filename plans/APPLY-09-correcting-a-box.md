Read AGENTS.md, CLAUDE.md, docs/09-glossary.md,
decisions/0003-status-versus-condition.md, and
docs/06-photo-upload-queue.md first.

Save this brief verbatim as plans/APPLY-09-correcting-a-box.md before starting.
Then execute it. Branch: feat/correcting-a-box.

Not compiled before delivery. Fix compile errors in place and report what
changed.

=== STEP 0: READ FIRST, IT IS THE REASON FOR THE DESIGN ===

nextSequenceNumber returns the highest number already used, plus one. Its
comment says a gap from a deleted box is never refilled. That is true for a
gap in the middle and FALSE at the top of the range: delete the
highest-numbered box and the next box reissues that number. If it is already
written on cardboard, two physical boxes wear it. That is the collision the
disjoint ranges exist to prevent and nothing can repair it afterward.

So deletion is safe only for a box that was never written. labelConfirmedAt is
set when a box is saved from Add box, and is exactly that distinction.

  labelConfirmedAt absent AND status "filling"  -> DELETE. Number is free.
  anything else                                 -> VOID. Document stays, so
                                                   the number stays retired.

Add a test to numbers.test.ts pinning the reissue behaviour explicitly.

A VOIDED BOX MUST NEVER LEAVE THE SUBSCRIPTION. reserveContainer reads
knownContainers to pick the next number; filtering voided boxes at the hook or
repository level breaks numbering in exactly the way this step prevents. Filter
at the display level only, in components, with a comment where someone would be
tempted to do otherwise.

No rules change is needed. firestore.rules already allows delete on containers
and photos for members, and Storage `write` covers delete. If you find yourself
editing a rules file, stop and report.

=== STEP 1: DOMAIN ===

containerSchema gains:
  voidedAt: isoString.optional(),
  voidedBy: z.string().min(1).optional(),

activityEventSchema type enum gains: container_voided, container_unvoided,
photo_deleted, title_changed.

Add, where it fits the existing layout:

  /**
   * A box never written on cardboard can be deleted, because its number is
   * genuinely free. Any other box is voided instead: the document stays so
   * nextSequenceNumber keeps counting past it, which stops a retired number
   * being reissued to a second physical box.
   */
  export function canDelete(container: Container): boolean {
    return container.status === "filling" && container.labelConfirmedAt === undefined;
  }

  export function isVoided(container: Container): boolean {
    return container.voidedAt !== undefined;
  }

Tests for both, including a packed box with no labelConfirmedAt (not
deletable) and a filling box that has one (not deletable).

=== STEP 2: REPOSITORIES ===

containers.ts gains, following the existing { value, written } shape:
  voidContainer(moveId, container, actorUid)   - stamps voidedAt/voidedBy,
                                                 logs container_voided
  unvoidContainer(moveId, container, actorUid) - clears both, logs
                                                 container_unvoided
  deleteContainer(moveId, containerId)         - plain delete, but THROW if
                                                 canDelete is false so no
                                                 caller bypasses the rule

Watch the conditional-spread hazard: clearing an optional field means building
the object without the key, never assigning undefined.

photos.ts gains deletePhoto(moveId, photo), in this order:
  1. Delete the Storage object if storagePath exists. Failures are logged and
     do not stop the rest — an orphaned object costs a fraction of a cent, a
     photo that will not go away costs trust.
  2. Delete the Firestore document. Queues offline like every other write.
  3. Delete the Dexie blob if one is held.

Also add retryUpload(moveId, photo): reset attempts to zero, clear lastError,
set uploadState back to pending, call kickUploader(). Doc 06 specifies exactly
this and it has never been built.

=== STEP 3: INTERFACE (requirements, not code — layout is your call) ===

BOX DETAIL

  Title. A text field saved the same way the note is. The schema has carried
  `title` since APPLY-01 and nothing has ever set it.

  Conditions. Two controls, missing and damaged, calling the existing
  reportContainerCondition and clearContainerCondition. Both can be set at
  once. Per ADR-0003 they sit alongside status and never replace it, so a
  damaged box still shows its status and still offers its status buttons. A
  box carrying a condition should be obvious at a glance on box detail and in
  the box list row.

  Void or delete. One control at the bottom, well clear of everything else,
  whose behaviour follows canDelete:
    Deletable: confirm, then delete. Say plainly that the number will be used
      again, because it will.
    Not deletable: confirm, then void. Say plainly that the number is retired
      and will not be reused.
  Neither happens without a confirmation step. This is the only irreversible
  action in the app.
  A voided box shows that it is voided, hides the actions that no longer make
  sense, and offers to undo the void.

BOX LIST

  Voided boxes hidden by default. A control reveals them, and they read as
  voided when shown. Display filter only — nothing above the component may
  filter them, or numbering breaks.

SEARCH

  Voided boxes excluded from results by default. Someone searching for a
  stapler does not want a box they retired last week.

PHOTOS

  Delete. Reachable from the photo viewer, where the person can see what they
  are deleting. Confirm first.

  Retry. PhotoStrip already marks a photo that has not sent. That marker
  becomes a control calling retryUpload.

  Library. PhotoStrip's file input carries capture="environment", which forces
  the camera on Android. Remove that attribute so the picker offers both
  camera and library. Keep accept="image/*".

=== STEP 4 ===

npm run verify, npm run build. Do NOT deploy — CI ships from main.

=== STEP 5: DOCS ===

  plans/README.md: APPLY-09 row and numbering line.
  plans/STATUS.md: this plan; close the Live drift entries for doc 06's
    missing retry action and the unwritten orphan sweep; record the accepted
    Storage orphan risk, including that offline deletion always orphans.
  docs/02-domain-model.md: already done in your earlier pass.
  docs/04-screen-specifications.md: the new controls.
  docs/06-photo-upload-queue.md: the retry action now exists; record what
    shipped, including clearBackoff.

  One NEW Live drift entry, recorded not solved: AddBox reserves a number on
  mount, so backing out without saving strands a draft. Those drafts are now
  visible and deletable, but nothing stops them accumulating during a session
  where someone opens Add box and changes their mind.

Also replace the cut-point marker in plans/APPLY-09-correcting-a-box.md with
this text, and record the two corrections above as amendments rather than
silently rewriting steps 1 and 2.

Commit, push, open the pull request. Do not merge. Report the PR URL and say
where you exercised judgment in step 3.

=== AMENDMENTS ===

The brief arrived in two parts. Steps 0 to 2 were built and pushed from the
first part, then the author sent two corrections with step 3. They are
recorded here rather than folded into the steps above, so the first shape and
the reason it changed both stay readable.

AMENDMENT 1, to step 2, deletePhoto. Do NOT await the Storage delete. Capture
storagePath first, then fire the Storage delete without awaiting, then delete
the Firestore document, then the Dexie blob.

  As first built, the Storage delete was awaited so that the ordering in step 2
  was literally sequential. Offline that leaves a deleted photo on screen for
  as long as the Storage SDK spends on its own retry window, roughly two
  minutes, because the Firestore delete sat behind the await. That contradicts
  the principle the app is built on: nothing waits on the network.

  Orphaned Storage objects accumulate when offline. That is accepted and goes
  in STATUS.

AMENDMENT 2, to step 2, deleteContainer. It must take the box's photos with
it: photo documents, Dexie blobs, and Storage objects for that container. The
Storage half gets the same fire-and-forget treatment as amendment 1.

  Capture writes photo documents before a box is saved, so a deletable draft
  can hold photos. Deleting only the container document strands them.
