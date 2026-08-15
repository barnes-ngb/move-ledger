# Development Plan

Three phases plus a validation step. The move is three to six months out. The plan is sized so Phases 0 and 1 finish in a few sessions and Phase 2 finishes well before packing starts.

Time-boxing is deliberate. This project has no career surface and should not expand to fill the calendar.

## Phase 0: Validate the loop

No repository. No Firebase. One artifact prototype.

### Build

Add box, zone picker, note field, flags, label screen, `Save and next`, numeric find. In-memory state only. No camera, no photos, no backend.

### Test

Stopwatch. Twenty real boxes worth of taps against a physical cardboard box and a marker.

### Exit criteria

A box is recorded in under 20 seconds, or the interaction design changes until it is.

If the loop cannot get under 20 seconds without a photo in it, the premise is wrong and Phase 1 does not start. This is the cheapest possible place to learn that.

Phase 0 passed on that number and the number is kept here as the record of what it was held to. The project's success measures were rewritten on 2026-08-15, once photos were in the flow and a stopwatch had started measuring the wrong thing. See `docs/00-product-brief.md`.

## Phase 1: Vertical slice, one phone

### Build

1. Vite, React, TypeScript strict, PWA plugin.
2. Firebase project, Google auth, Firestore with persistent local cache.
3. Zod schemas for Move, MoveMember, Location, Zone, Container, ContainerPhoto, ActivityEvent.
4. Repository modules, one per collection.
5. `src/domain/numbers.ts` and unit tests.
6. `src/domain/status.ts` and unit tests.
7. Move creation and zone setup screens.
8. Add box screen with number reservation and the label instruction block.
9. Photo capture with client-side resize to 1600px and Dexie storage.
10. Photo upload queue with retry.
11. Box detail with status transitions.
12. Numeric find.
13. Firestore and Storage security rules with rules tests.
14. Playwright test covering create move, create box, find box, mark opened.

### Exit criteria

- The full loop works on one phone.
- Airplane mode: create five boxes with photos, close the tab, reopen, reconnect, all five arrive with images intact.
- Rules tests pass.
- Deployed to Firebase Hosting and installed on the home screen.

## Phase 2: Two phones and move day

### Build

1. Add the second member and assign number ranges.
2. `memberUids` maintenance and the rules that depend on it.
3. `searchText` construction and text search.
4. Filters by zone, status, priority.
5. Move overview counts.
6. Activity history on box detail.
7. Move Day mode: load, unload, damage, missing, open-first list, full-screen color chart.
8. Condition reporting with photos.
9. JSON and CSV export.

### Exit criteria

- Two phones create 20 boxes each with no duplicate numbers.
- Move Day processes ten consecutive boxes with no navigation between them.
- Export opens correctly in a spreadsheet.

Phase 2 is the last required phase. The tool is usable for the move at this point.

## Phase 3: Optional

Only if Phase 2 lands with time to spare.

- Callable function for photo summaries
- Suggestion accept, edit, dismiss flow
- Suggestion markers in search results

## First tickets

In order. Each one is a branch and a pull request.

1. Project scaffold, TypeScript strict, PWA plugin, ESLint
2. Firebase init, Google auth, Firestore with persistent cache
3. Zod schemas for all seven entities
4. Repository modules with validated writes
5. `domain/numbers.ts` plus tests
6. `domain/status.ts` plus tests
7. Move creation and zone setup
8. Add box screen with reserved number and label block
9. Camera capture with client-side resize
10. Dexie blob store
11. Upload queue with retry and back-off
12. Box detail with legal transitions
13. Numeric find
14. `firestore.rules` and `storage.rules` plus rules tests
15. Playwright vertical slice

## First demo

- A phone creates a move.
- The user configures a blue kitchen.
- The app assigns Box 001.
- The user photographs the contents.
- The screen shows `001 / BLUE`.
- The user confirms the label.
- The box is found by typing `1`.
- The box is loaded, unloaded, and opened.
- The activity history shows every step.
- All of it worked with the phone in airplane mode until the last minute.
