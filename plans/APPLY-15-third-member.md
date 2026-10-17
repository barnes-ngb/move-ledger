Read AGENTS.md, CLAUDE.md, docs/09-glossary.md, and
decisions/0005-google-sign-in-two-accounts.md. Save this as
plans/APPLY-15-third-member.md. Branch off main.

A helper will pack on their own phone in parallel with Shelly, then should
lose access after the move. ADR-0005 says a third member "for this move
means never." Amend it first: the data layer always supported N members;
the Members screen did not.

=== 1. Members screen generalizes ===

Currently hardcodes one second person ("her", 500-999). Make it take any
number of members:
  - Name and account id fields, wording per the glossary, no gendered
    pronouns ("their account id").
  - Range auto-assigned: the next free block of 500 above the highest
    existing numberRangeEnd. Nathan 1-499, Shelly 500-999, so the helper
    gets 1000-1499. Show the assigned range before confirming. Keep the
    existing overlap refusal in addMember.
  - Note in doc 02 that four-digit numbers now exist; toDisplayCode widens
    and the keypad's MAX_DIGITS already allows four. Confirm nothing else
    assumes three digits (search, CSV sort, label text) and report.
  - The adding flow is unchanged: memberUids first, then the member record.

=== 2. Removing a member ===

moveMemberSchema gains removedAt: isoString.optional().

removeMember(moveId, member, move, actorUid):
  - Remove their uid from move.memberUids. Rules already permit this (update
    by a member with createdAt unchanged). Their listeners will be denied
    and the existing SubscriptionFailed path handles it on their device.
  - Stamp removedAt on the member record. NEVER delete the record: it holds
    numberRangeStart/End and highestIssued, so deleting it would make their
    numbers reissuable — the exact collision APPLY-13 closed. Their boxes
    keep ownerMemberId and stay in the move.
  - Refuse to remove yourself, and refuse to remove a member with role
    "owner". Confirm before removing; say plainly they lose access at once
    and their boxes stay.
  - Removed members show in the list as removed, with their range, and are
    excluded from the range-assignment "highest end" only if you decide
    reuse is safe — it is NOT, so include them. Their range stays retired.

Rules: add a test that a member can update memberUids to remove another
uid, and that the removed uid can then no longer read the move. Doc 10
first, then the test. No rules change expected; report if one is needed.

=== 3. Docs ===

ADR-0005 amended (Revisit section). Doc 02 for removedAt and four-digit
numbers. Doc 04 for the screen. STATUS: note the one-phone-per-person rule
now applies to three people, and that a helper needs a Google account.

Tests, verify, build. No deploy. Commit, push, open the PR.
