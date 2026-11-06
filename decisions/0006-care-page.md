# ADR-0006: A care page inside the move

Status: accepted
Date: 2026-11-06

## Context

The move changes every doctor the household uses. One member is shortlisting Texas practices for the other, and the list has to be reviewed by the person who will sit in the rooms: two or three options per need, a line on each about who they are, which one the household is leaning toward, and whether anyone has called yet.

That list is health information. The public rentals board under `public/rentals/` carries a notice that medical information must not go on it, and the Vite bundle is served the same way, so neither `public/` nor a JSON module in `src/` can hold it. The app already has what the list needs: Google sign-in for two named people, Firestore rules that admit only members of the move, offline persistence, and a history-backed view stack. ADR-0002 scopes the app to one move for two people; the list is for the same two people and the same move, and it expires with the move.

Non-negotiable constraints: no provider name, phone, or note about a person's health is committed to this repository; the page reads nothing that is not behind sign-in; the page works offline; the data is exportable; the fastest path for the reviewer is a glance and a tap.

## Decision

Add a `care` subcollection under the move, one document per need, each holding its options, readable and writable by members only, and a `Care team` screen under the move overview that shows one card per need. The list is entered and edited inside the app, including a paste-import for the first fill. Nothing about any provider lives in the repository.

## Alternatives considered

**A static page under `public/care/` like the rentals board.** Lost because it is a public URL. Even a names-only list discloses which specialties a person is seeing.

**A JSON module in `src/` behind the signed-in route.** Lost because the bundle is a public asset; sign-in gates the screen, not the file.

**A separate app or a shared document outside Move Ledger.** Lost because the decision is being made in the same two weeks, by the same two people, in the app they already open for the move, and a separate place is one more place to forget.

**Expanding the domain model into a full care record (visits, results, medications).** Lost under ADR-0002. A need and its options are enough to choose a doctor; everything after the choice belongs to the clinic's own portal.

## Consequences

Easy: a member sees the shortlist on a phone, marks an option as called or booked, and the other member sees it. The list survives the move being offline. The repository stays free of health information.

Hard: filling the list means typing or pasting it; there is no sync from anywhere. A need with no options is shown as empty rather than hidden, so a missing specialty is visible.

Impossible without a new record: anyone but a move member reading the list; the app suggesting a provider; storing anything about a visit beyond "booked".

The export rule is met on the page itself (Copy as text) rather than in the move export bundle, because the bundle is the box record and this list is not part of it.

## Revisit when

The household wants the list after the move is marked complete, which would mean it belongs with the people and not with the move.
