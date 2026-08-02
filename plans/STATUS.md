# Move Ledger status

Living file. Edit in place. Git history is the version record, so this file never takes a version suffix and the old pickup summaries do not get carried into the repo.

Last updated: 2026-08-01.

## What this is

A phone-first PWA for one household move, Kansas City to DFW. A personal tool, not a product. Two numbers measure it and nothing else does:

- Recording a box takes under 20 seconds.
- Finding a box takes under 10 seconds.

The primary user is Shelly. Nathan is remote and travels one week a month. Every scope and UX decision runs through "can she do this alone at 9pm."

## Dates

| Milestone | Date |
| --- | --- |
| Vertical slice deployed to both phones | 2026-08-24 |
| Shelly solo-capable | early October |
| Packing begins | late October or November |

## Where it stands

Done:

- Phase 0 prototype validated. The 20-second loop holds.
- Domain core built and verified before delivery. 47 tests, tsc strict clean. Packaged as `plans/APPLY-01-domain-core.md`.
- APPLY-02 authored and packaged as `plans/APPLY-02-firebase-repositories.md`.
- Firebase project created and configured. See `docs/12-firebase-project-setup.md`.
- Repository created, doc set committed.
- Auth settled: Google sign-in, two accounts. ADR-0005 lands with APPLY-02.

Not done:

- Neither apply-file has executed anywhere. The repository holds no source yet.
- The rules tests in APPLY-02 have never run. They typecheck and encode the nine cases from doc 10, but their first execution will be on the build machine.
- The build machine has no Firebase CLI and no JRE. The emulator step and the deploy step both need them.

## Domain model, settled

Container and Zone in code. Box and Room in the UI. Seven statuses. Conditions sit alongside status rather than inside it, per ADR-0003. None of this gets re-litigated.

## Scope

In: box number, room, status, short note, photo, generated contents list (editable), text search across notes and lists, two accounts.

Out: object detection or any trained model. QR codes, barcodes, printed labels. Weight, dimensions, declared value. Anything shaped for a second household.

### The generated contents list

Photo of the open box, one vision call, returned text into an editable field that is indexed for search.

Accuracy does not matter here. This is recall, not inventory control. If the list reads "cables, books, a stapler, blue bin" and a search for stapler returns box 042, the feature has done its whole job.

Guardrails from doc 07, kept because recall tolerates wrong text while a budget does not tolerate a loop:

- Never process the same photo twice. Cache on `storagePath`.
- One photo per box gets summarized, the first contents photo.
- Hard cap per move, enforced inside the function rather than in the client.

## Sequence

Evenings and weekends. The Zahner separation sweep and household decision work both outrank this.

1. Firebase project created. Done.
2. Repository created, docs committed. Done.
3. Run APPLY-01. Scaffold and domain core.
4. Run APPLY-02. Firebase init, auth, repositories, rules, rules tests, rules deploy.
5. Vertical slice: create a box, set room and status, save, find it by number. Deployed to Hosting, installed on both phones. **Gate: August 24.**
6. Photo capture, client-side resize, upload queue to Storage.
7. Cloud Function for the vision call, contents list written back to the box record.
8. Text search across notes and contents.
9. Shelly logs twenty real boxes without help. If that works, the app is done.

Steps 6 through 8 can land through September and still beat early October. Stop at step 9. Anything past it is the builder solving a harder problem than the situation requires.

## Known drift

- Doc 05 names Firebase SDK v10. Resolved reality is v12, and the modular API is unchanged for everything this app uses. APPLY-02 fixes the version line in its own pull request.
- The build machine runs Node 24.18.1 and npm 11.16. Both apply-files were verified on Node 22.22 and npm 10.9. A failure traceable to that gap is a finding to report, not a thing to patch around.

## Open items

- Confirm the Firestore and Storage locations, then fill the two CONFIRM rows in doc 12.
- Restrict the browser API key by HTTP referrer once Hosting is live.
- Install the Firebase CLI and a portable JRE before APPLY-02.
