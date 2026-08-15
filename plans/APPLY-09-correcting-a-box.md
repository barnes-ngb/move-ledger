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
  Title: a

[BRIEF TRUNCATED IN TRANSIT AT THIS POINT. Steps 0 to 2 above are complete as
received. Step 3 onward was cut off mid-sentence and has been requested from
the author. Do not treat the interface work as specified until the remainder
is pasted in and this file is updated.]
