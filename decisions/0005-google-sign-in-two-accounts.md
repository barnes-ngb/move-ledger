# ADR-0005: Google sign-in and two accounts

Status: accepted
Date: 2026-08-01

## Context

The move timeline tightened. Shelly must be able to run the app alone by early October while Nathan is remote and traveling one week a month. Two questions had been left open: one account or two, and which sign-in method.

## Decision

Two Google accounts, one per household member. Google sign-in only. No email/password, no phone auth.

## Alternatives considered

**Shared single account.** Faster to ship on paper. Lost because it is not actually available: offline number reservation queries the local cache for the highest number in the signed-in member's range, so two phones on one account are one member, and both offline is the documented duplicate-number failure mode from `docs/02-domain-model.md`. Shared breaks the one hard concurrency requirement the app has.

**Email and password.** Lost on build surface. It requires a registration screen, a password reset flow, and password management for a user whose success criterion is logging boxes at 9pm without help. Google sign-in is one tap and both members already have accounts.

**Phone auth.** Lost immediately. It bills per SMS and adds nothing.

## Consequences

- The auth module is roughly forty lines. Popup flow, no redirect handling.
- The Firestore rules authorize on `memberUids` containing the caller's uid, exactly as written in `docs/10-security-rules.md`.
- Onboarding Shelly is: install the PWA, tap sign in, Nathan adds her uid to the move. That last step is a one-time action that can happen while both phones are on the same couch.
- Each member gets a disjoint number range at setup: 1 to 499 and 500 to 999.

## Amended 2026-09-07: one member, one active device

The shared-account alternative above lost because two phones on one account are one member, and both offline is the duplicate-number failure mode. Two accounts do not remove that failure mode; they make it a rule of use rather than an architecture. The rule was never written down, and APPLY-13 writes it down.

Offline number reservation is safe for one member on **one active device**. The same Google account signed in on two devices is still one member with one range, and while both are offline each counts from what it can see, which is its own cache and its own copy of the member document. The number watermark `highestIssued` on the member document, added in APPLY-13, narrows the collision to the offline window: once either device syncs, the other's next reservation counts past everything both have issued. It does not eliminate it, and nothing short of a server transaction could, which would need the signal the app is built not to require.

So each person packs from one phone. A second signed-in device may look at the app but should not reserve a box while the first is offline. Recorded as a known limit in `plans/STATUS.md` and in `docs/02-domain-model.md` under Number reservation.

## Amended 2026-10-17: a third member, and taking one off

The Revisit line below said a third member would never appear. One has: a helper will pack on their own phone alongside Shelly, and should lose access once the move is done. The decision above stands. One Google account per person, Google sign-in only, and each person packs from one phone.

What the line got wrong was where the limit lived. The data layer never had one. `memberUids` is an array, the rules authorize on membership in it whatever its length, ranges are checked for overlap against every existing member, and number reservation reads the signed-in member's own range. The two-person limit was the Members screen, which hardcoded a single second person at 500 to 999. APPLY-15 generalizes that screen and adds the one thing a helper needs and the household did not: a way off the move.

- **Ranges are assigned, not typed.** The next whole block of 500 above the highest `numberRangeEnd` any member has ever held. Nathan 1 to 499, Shelly 500 to 999, the helper 1000 to 1499. Box numbers reach four digits.
- **Removing a member takes their uid out of `memberUids` and stamps `removedAt` on their member record.** The record is never deleted. It holds their range and their watermark, and deleting it would let the next range assignment hand their numbers out again, which is the duplicate-number collision APPLY-13 closed. Their boxes keep `ownerMemberId` and stay in the move. A removed member's range is retired for the life of the move.
- **The owner cannot be removed, and nobody can remove themselves.** The app refuses both. The rules do not, for the reason recorded in `docs/10-security-rules.md`.
- **The helper is a member, not a role.** `AGENTS.md` keeps helper and viewer roles out of scope, and this does not add one: the helper has exactly the permissions Shelly has, for as long as they are on the move. A role would be a second authorization model, and the household does not need one to hand somebody a box of tape for a month.

The one-phone rule above now applies to three people instead of two, and a helper needs a Google account of their own to be added at all.

## Revisit when

A member needs less than full access to the move, such as somebody who should see the boxes but not add them. That is a role, which this decision does not cover and `AGENTS.md` keeps out of scope.
