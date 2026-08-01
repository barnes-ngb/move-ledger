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

## Revisit when

A third household member appears, which for this move means never.
