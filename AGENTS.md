# AI Development Instructions

This file defines the operating rules for coding agents working on Move Ledger.

## Product rules

1. A box's permanent identity is its Firestore document ID plus its move-scoped `sequenceNumber`.
2. A `sequenceNumber` must never be reused within the same move.
3. Zone names and zone colors are editable metadata and are never identifiers.
4. The physical labeling system must work with only a phone and a marker.
5. QR codes, printers, stickers, and barcode scanners are out of scope. Do not add them.
6. The fastest path through the app matters more than exhaustive data entry.
7. A photo and a short note are the default inventory method.
8. Human-confirmed data is canonical. AI output is a suggestion and must never silently overwrite it.
9. Offline operation is a first-class requirement.
10. The user must be able to export all data.
11. Status describes position in the pipeline. Conditions such as missing and damaged are separate and coexist with status. See `decisions/0003-status-versus-condition.md`.

## Engineering rules

- TypeScript in strict mode.
- Validate every persisted shape with a shared Zod schema in `src/domain/schemas`.
- Firestore security rules changes require a matching rules test.
- New features require acceptance criteria written before implementation. Use the ticket template.
- Every user-visible state must define loading, empty, error, and offline behavior.
- Do not add a dependency without recording why in the pull request description.
- Keep domain logic out of components. Number reservation, status transitions, and export formatting belong in `src/domain`.
- Record meaningful state changes as activity events.
- Never block box creation on a photo upload.
- Never delete a local photo blob before Cloud Storage confirms the upload.
- Do not write to Firestore from a component. Go through a repository function.

## Environment constraints

- PowerShell on Windows. Give PowerShell commands, not bash.
- No Docker. No administrator rights.
- These are hard constraints, not preferences. A proposal that requires either is rejected.

## Scope control

Do not add the following unless a decision record approves it:

- QR codes, printed labels, barcode scanning
- 3D truck packing or load optimization
- Floor-plan modeling or import
- Mover marketplace, bidding, or route planning
- Household budgeting, expense tracking, or insurance valuation
- Item-level records for every object
- Helper and viewer roles
- Real-time collaborative editing beyond what Firestore gives for free

## Copy rules

These apply to every user-facing string, every doc, and every commit message.

- No em dashes. Use periods, colons, semicolons, or spaced hyphens.
- No AI-tell vocabulary: leverage, seamless, streamline, robust, effortless, powerful, delightful.
- No three-part parallel constructions.
- Button labels are verbs. `Save and next`, not `Continue`.
- Say what the app did, not how it felt about it.

## Completion standard

A task is complete only when:

- The feature works in the intended user flow on a phone-sized viewport.
- Validation and error behavior are implemented.
- Offline behavior is implemented or explicitly documented as not applicable.
- Tests are added.
- The relevant doc is updated in the same pull request.
