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
- The two missing doc 10 cases are closed. `tests/rules/storage.rules.test.ts` landed on 2026-08-02 with 11 tests: cases 8 and 9, plus the read and write authorization paths `storage.rules` defines. `test:rules` now runs `--only firestore,storage` per doc 10. 20 of 20 pass. `storage.rules` was not modified.
- APPLY-03 run in the repository on 2026-08-02 from `plans/APPLY-03-pwa-shell.md`. Tailwind v4, a service worker and manifest, the Google sign-in gate, the header indicator from doc 04 section 9, and an account screen that puts the signed-in uid on screen for the ADR-0005 onboarding step. Deployed to `https://move-ledger.web.app`. First code delivered to this repository without being compiled first, and it compiled clean on the first attempt.
- Firebase Storage set up in the console on 2026-08-02.
- Firestore rules deployed to the live project. The default Firestore database was created by that deploy.
- Firebase project created and configured. See `docs/12-firebase-project-setup.md`.
- Repository created, doc set committed.
- Auth settled: Google sign-in, two accounts. ADR-0005 lands with APPLY-02.

Not done:

- Storage rules are not deployed. Storage is now set up on the project and the rules tests pass, so the only thing left is running the deploy from an authenticated machine. See "Known drift" for why the branch could not run it.

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
4. Run APPLY-02. Firebase init, auth, repositories, rules, rules tests, rules deploy. Done, except the Storage rules deploy. The rules tests now cover all nine cases doc 10 requires.
5. Run APPLY-03. Tailwind, PWA shell, auth gate, indicator, first deploy. Done.
6. Run APPLY-04. Create a box, set room and status, save, find it by number. First-run setup. Installed on both phones. **Gate: August 24.**
7. Run APPLY-05. Photo capture, client-side resize, upload queue to Storage.
8. Run APPLY-06. Cloud Function for the vision call, contents list written back to the box record.
9. Text search across notes and contents.
10. Shelly logs twenty real boxes without help. If that works, the app is done.

The vertical slice was one plan in the original sequence and is now two. APPLY-03 proves sign-in, install, and the offline shell on the real phones with no screens on top of them. APPLY-04 carries the box flow that the August 24 gate actually measures. Everything after the slice shifted by one: the photo pipeline is APPLY-05 and the Cloud Function is APPLY-06. `plans/README.md` holds the numbering table.

Steps 7 through 9 can land through September and still beat early October. Stop at step 10. Anything past it is the builder solving a harder problem than the situation requires.

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
- `watchMoves` subscribed to the whole `moves` collection with no `where` clause, under a comment claiming the security rules narrowed the result. Firestore rules are not filters. A list query is evaluated per document and the whole query fails the moment it touches a document the caller cannot read, so the function would have thrown for both members the first time a move existed that one of them was not on. It worked only because every move in the database belonged to the signed-in user, and because nothing called it yet. Fixed during the APPLY-03 run: the query filters on `memberUids` with `array-contains`, which needs no composite index, and the signature took a `uid` parameter. The query and `firestore.rules` now assert the same thing.
- The production bundle is a single 790 kB chunk, 238 kB gzipped, almost entirely the Firebase SDK. Vite warned about it on the APPLY-03 build. It is tolerable for a shell that loads once and then runs from the service worker cache, and it is not tolerable as a first load over cellular in a garage. Split it before APPLY-04 puts real screens on top of it.
- There are no component tests. `vitest.config.ts` runs in the `node` environment, so nothing can render. The 47 tests are all domain tests and the 20 rules tests run separately against the emulators. Adding jsdom and a render library is deferred to APPLY-04, where the box flow gives them behavior worth asserting. APPLY-03's UI is a sign-in gate and two static screens, and the real test of it is the phone.
- The Storage rules tests were written and run in a cloud container, not on the Windows machine. Two things there do not apply locally. The Firebase CLI had no credentials, so `firebase deploy --only storage` exited with "Failed to authenticate, have you run firebase login?" and the deploy is still owed. The container also sets `HTTPS_PROXY`, and `firebase-tools` proxies every request without checking `NO_PROXY`, including the Storage rules runtime's own call to the Firestore emulator on 127.0.0.1. That call comes back 405 and the CLI swallows it as a missing document, which reads exactly like a membership failure. Clearing `HTTPS_PROXY` for the one command is the fix there. Neither affects a local run.

## Open items

- Run `firebase deploy --only storage` from the Windows machine. Storage is set up and the rules tests pass, so this is the last step before photos in APPLY-05.
- Confirm the Storage location, then fill the CONFIRM rows in doc 12. The Firestore database was created during the APPLY-02 rules deploy, so its location is now fixed.
- Restrict the browser API key by HTTP referrer. Hosting went live on 2026-08-02 with the APPLY-03 deploy, so this is now actionable. The referrers are `move-ledger.web.app` and `move-ledger.firebaseapp.com`.
