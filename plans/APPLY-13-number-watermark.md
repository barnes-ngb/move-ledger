Read AGENTS.md, CLAUDE.md, docs/02-domain-model.md, decisions/0005, and
plans/APPLY-09-correcting-a-box.md step 0 first.

Save this as plans/APPLY-13-number-watermark.md. Branch: fix/number-watermark.

=== THE INCIDENT ===

Production has two containers with sequenceNumber 1 in the same move: one
voided (Kitchen), one packed with 2 photos (Office). The void guard from
APPLY-09 was supposed to make this impossible.

=== STEP 1: DIAGNOSE BEFORE FIXING. Report, then stop for my go. ===

Read the activity collection for this move (Admin SDK or the console
export — do not modify anything). Find both container_created events with
payload.sequenceNumber == 1 and any container_voided for the Kitchen one.
Report: occurredAt and actorId for each, in order, and the createdAt of both
container documents.

Then read the current code path from AddBox mount through reserveContainer
and answer three questions with file:line citations:
  a. What list reaches reserveContainer as knownContainers, and is anything
     between useContainers and that call filtering voided boxes?
  b. Does anything prevent AddBox reserving while useContainers has not yet
     delivered its first snapshot? (Look for the empty-array-while-loading
     window.)
  c. Is there any guard against the same member reserving on two devices?

State which of the three candidate causes the evidence supports, or that it
cannot distinguish them. Do not fix yet.

=== STEP 2: THE WATERMARK (after my go) ===

moveMemberSchema gains  highestIssued: z.number().int().nonnegative().optional()
Absent means 0.

reserveContainer:
  - next = nextSequenceNumber(member, [...known numbers,
    member.highestIssued ?? 0])  — so the watermark is simply one more
    "used" number and the domain function is unchanged.
  - Write the container AND update the member's highestIssued in ONE
    writeBatch. Batches queue offline like single writes. Never two
    separate writes; a crash between them is exactly the hole.
  - Keep the APPLY-06 in-session tracking of reserved numbers; the
    watermark from the subscription may lag within a tick.

Firestore rules: members already allow write for members. Add a rules test
that a member can update highestIssued and a non-member cannot, and that it
cannot go DOWN (unchanged-or-greater). Doc 10 first, then the rule, then
the test. Do not deploy rules; I will.

AddBox: do not reserve until useContainers has delivered at least one
snapshot. Expose that from the hook. If it has not, show the number as
pending rather than reserving against an empty list.

Backfill: a one-off script (scripts/backfill-watermark.mjs, Admin SDK, run
by me from the desktop) that sets each member's highestIssued to the max
sequenceNumber in their range across ALL containers including voided ones.
Print before/after, require a --write flag to actually write.

=== STEP 3: THE LIMIT NOBODY WROTE DOWN ===

docs/02-domain-model.md and decisions/0005: record that offline reservation
is safe for one member on ONE active device. Two devices as the same member
can collide while both are offline; the watermark narrows that to the
offline window rather than eliminating it. Add to STATUS as a known limit
with the recommendation: each person packs from one phone.

Tests for everything above. npm run verify, npm run build. No deploy.
Commit, push, open the PR. Report step 1 findings first and wait.
