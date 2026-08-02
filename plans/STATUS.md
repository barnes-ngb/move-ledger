# Move Ledger status

Living file. Edit in place. Git history is the version record, so this file never takes a version suffix and the old pickup summaries do not get carried into the repo.

Last updated: 2026-08-02.

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
- Domain core run in the repository on 2026-08-01 from `plans/APPLY-01-domain-core.md`. Scaffold plus schemas, number reservation, status transitions, conditions, search, export. 47 tests across 6 files, `tsc --noEmit` clean under strict.
- APPLY-02 run in the repository on 2026-08-01 from `plans/APPLY-02-firebase-repositories.md`. Firebase app init with the persistent local cache, Google sign-in, one repository per collection with schema-validated writes, and both rules files copied from doc 10. ADR-0005 landed.
- The rules tests ran for the first time anywhere on 2026-08-01. 9 of 9 passed. No rule was weakened and no test was weakened.
- The two missing doc 10 cases are closed. `tests/rules/storage.rules.test.ts` landed on 2026-08-02 with 11 tests: cases 8 and 9, plus the read and write authorization paths `storage.rules` defines. `test:rules` now runs `--only firestore,storage` per doc 10. `storage.rules` was not modified.
- `npm run test:rules` passes 20 of 20 across 2 files on the Windows build machine.
- Firebase Storage set up in the console on 2026-08-02. One bucket, `move-ledger.firebasestorage.app`, single region at `US-CENTRAL1`.
- Firestore rules deployed to the live project. The default Firestore database was created by that deploy. It is the only database on the project: `move-ledger-db` was created in error and has been deleted.
- `storage.rules` deployed to production on 2026-08-02. The deploy prompted for an IAM role grant for cross-service rules and it was accepted, which is what lets `firestore.get` inside `storage.rules` resolve.
- Both location rows in doc 12 are filled: Firestore `nam5`, Storage `US-CENTRAL1`.
- Firebase project created and configured. See `docs/12-firebase-project-setup.md`.
- Repository created, doc set committed.
- Auth settled: Google sign-in, two accounts. ADR-0005 lands with APPLY-02.

The backend is complete. Both rules files are deployed, both rules test suites pass on this machine, and the project configuration is recorded.

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
3. Run APPLY-01. Scaffold and domain core. Done.
4. Run APPLY-02. Firebase init, auth, repositories, rules, rules tests, rules deploy. Done. The rules tests cover all nine cases doc 10 requires and both rules files are deployed. The backend is complete.
5. Vertical slice: create a box, set room and status, save, find it by number. Deployed to Hosting, installed on both phones. **Gate: August 24.** This is next.
6. Photo capture, client-side resize, upload queue to Storage.
7. Cloud Function for the vision call, contents list written back to the box record.
8. Text search across notes and contents.
9. Shelly logs twenty real boxes without help. If that works, the app is done.

Steps 6 through 8 can land through September and still beat early October. Stop at step 9. Anything past it is the builder solving a harder problem than the situation requires.

## Known drift

- Doc 05 names Firebase SDK v10. Resolved reality is v12, and the modular API is unchanged for everything this app uses. APPLY-02 fixes the version line in its own pull request.
- The build machine runs Node 24.18.1 and npm 11.16. Both apply-files were verified on Node 22.22 and npm 10.9. A failure traceable to that gap is a finding to report, not a thing to patch around. Nothing in the APPLY-01 run traced back to it.
- `create-vite` resolved to 9.1.2, which ships vite 8, react 19.2, typescript `~6.0.2`, and an oxlint config. APPLY-01 claimed typescript 7.0.2, so the resolved compiler is a major version below the stated baseline. The `.oxlintrc.json` and the `oxlint` dependency came with the template rather than being added. They are untouched and unused.
- APPLY-01 step 2 was applied by scaffolding into an empty scratch directory and copying the result in. create-vite 9 offers no safe in-place answer for a non-empty directory: `--no-interactive` cancels and writes nothing, and `--overwrite` deletes the existing files.
- The `tsconfig.json` written by APPLY-01 step 4 omitted `jsx`, `allowImportingTsExtensions`, and `vite/client` while setting `"include": ["src"]`, so `tsc` walked into the template TSX and failed with 60 errors. Corrected on the APPLY-01 branch.
- `tsconfig.json` `include` must become `["src", "tests"]` during APPLY-02, or the rules tests will not be typechecked. Applied during the APPLY-02 run.
- Resolved 2026-08-02. `tests/rules/firestore.rules.test.ts` covered seven of the nine cases doc 10 lists as required. Cases 8 and 9, a Storage write above 2 MB and a Storage write with a non-image content type, had no test, so the 9 passing tests matched the doc's count by coincidence rather than by coverage. `tests/rules/storage.rules.test.ts` closes both, and the `test:rules` script now uses `--only firestore,storage`.
- The Storage emulator resolves a `firestore.get` inside `storage.rules` against the project the CLI is running as, taken from `GCLOUD_PROJECT`, not against the project id the test environment was created with. Membership seeded under a test-only project id is invisible to the rule and every member check reads null. `tests/rules/storage.rules.test.ts` reads `GCLOUD_PROJECT` for this reason. It is also why that file runs on a different project id than the Firestore test file, which clears Firestore in its own `beforeEach` while vitest runs both files in parallel.
- APPLY-02 was branched from `feat/domain-core` rather than `main`, because APPLY-01 is not merged. If APPLY-01 is squash-merged, this branch needs a rebase before its own merge.
- The emulator needs `java` on `PATH`, not only `JAVA_HOME`. `firebase emulators:exec` reports "Could not spawn `java -version`" when `JAVA_HOME` alone is set, so the session sets `$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"` first.
- VS Code's integrated terminal does not inherit a newly set user-scope `JAVA_HOME`. The variable is read at process start, so a terminal opened inside an already-running VS Code keeps the old environment no matter how many new terminals are spawned. Restart VS Code after setting it. This cost time twice.
- Resolved 2026-08-02. The Storage rules tests were written and first run in a cloud container, not on the Windows machine. Two things there did not apply locally. The Firebase CLI had no credentials, so `firebase deploy --only storage` exited with "Failed to authenticate, have you run firebase login?"; the deploy has since run from the Windows machine. The container also sets `HTTPS_PROXY`, and `firebase-tools` proxies every request without checking `NO_PROXY`, including the Storage rules runtime's own call to the Firestore emulator on 127.0.0.1. That call comes back 405 and the CLI swallows it as a missing document, which reads exactly like a membership failure. Clearing `HTTPS_PROXY` for the one command is the fix there. Neither affects a local run, and `npm run test:rules` now passes 20 of 20 locally.

## Open items

- Restrict the browser API key by HTTP referrer once Hosting is live.
