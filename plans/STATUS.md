# Move Ledger status

Living file. Edit in place. Git history is the version record, so this file never takes a version suffix.

Last updated: 2026-08-02, after the APPLY-05 run.

## What this is

A phone-first PWA for one household move, Kansas City to DFW. A personal tool, not a product. Two numbers measure it and nothing else does:

- Recording a box takes under 20 seconds.
- Finding a box takes under 10 seconds.

The primary user is Shelly. Nathan is remote and travels one week a month. Every scope and UX decision runs through "can she do this alone at 9pm."

## Dates

| Milestone | Date |
| --- | --- |
| Box flow deployed and installed on both phones | 2026-08-24 |
| Shelly solo-capable | early October |
| Packing begins | late October or November |

## Where it stands

The backend is finished. The app installs, signs in, holds a configured move, and now adds, finds, and edits a box. The box flow is deployed and unmeasured: the two numbers the August 24 gate turns on have not been timed on a phone.

Done:

- Phase 0 prototype validated. The 20-second loop holds.
- Firebase project created and configured. See `docs/12-firebase-project-setup.md`.
- Repository created, doc set committed.
- APPLY-01 run 2026-08-01. Scaffold plus the full domain layer. 47 tests across 6 files, `tsc --noEmit` clean under strict.
- APPLY-02 run 2026-08-01. Firebase init with the persistent local cache, Google sign-in, one repository per collection with schema-validated writes, both rules files copied verbatim from doc 10. ADR-0005 landed.
- Rules tests ran for the first time anywhere on 2026-08-01. 9 of 9 passed with no rule and no test weakened. The two missing doc 10 cases were found afterward and closed on 2026-08-02 by `tests/rules/storage.rules.test.ts`. The suite is now 20 of 20 across both files and `test:rules` runs `--only firestore,storage`.
- Firestore rules deployed 2026-08-01. That deploy created the default database.
- Storage set up in the console and storage rules deployed 2026-08-02 from the Windows machine. The deploy accepted the IAM role grant for cross-service rules, which is what lets `firestore.get` inside `storage.rules` resolve.
- APPLY-03 run 2026-08-02. Tailwind v4, service worker and manifest, the Google sign-in gate, the header indicator from doc 04 section 9, and the account screen that puts the signed-in uid on screen for ADR-0005. Deployed to `https://move-ledger.web.app`.
- APPLY-03 verified on hardware 2026-08-02. Nathan's Android phone installs to the home screen, runs standalone with no browser chrome, signs in through the Google popup inside standalone mode, keeps the session across installation, and loads the shell in airplane mode with the correct offline wording. Popup auth in a standalone PWA was the largest unknown in the plan and it holds, so ADR-0005 needs no revisiting.
- APPLY-04 run 2026-08-02. Move, member, place, and room subscriptions behind the auth gate. First-run flow creating the move, both places, and the owner's member record holding 1 to 499. Both halves of the ADR-0005 couch step are implemented: the waiting screen shows the second person her own id and the Members screen takes it. Hosting cache headers pinned and verified live.
- Both APPLY-03 and APPLY-04 were delivered without being compiled first and compiled clean on the first attempt.
- APPLY-05 run 2026-08-02. Add box with the number reserved on mount, the room chips, the note, and Save and next. Find by number on the local cache, opening the box the moment one match remains. Box detail with the legal forward transitions, note, and room change. The Firebase bundle split into three chunks and the first render environment, so components can be tested at all. Deployed to `https://move-ledger.web.app`.

Not done:

- Timing the box flow on a phone. The code is deployed but neither the 20-second loop nor the 10-second lookup has been measured since the prototype, and the offline number-climbing check has not been run against the real app. Until that happens the August 24 gate is not met.
- Shelly's phone. She has not installed the app, so her uid does not exist and the Members screen has never run end to end. Her device matters more than Nathan's, since she is the primary user.

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
3. APPLY-01, scaffold and domain core. Done.
4. APPLY-02, Firebase init, auth, repositories, rules, rules tests, both rules deploys. Done.
5. APPLY-03, Tailwind, PWA shell, auth gate, indicator, first deploy. Done, verified on hardware.
6. APPLY-04, first-run setup, subscriptions, member onboarding. Done.
7. APPLY-05, the box flow. Create a box, set room and status, save, find it by number. Code done and deployed 2026-08-02. Not yet installed on both phones and not yet timed, which is the half of this step that decides the gate. **Gate: August 24.**
8. APPLY-06, photo capture, client-side resize, upload queue to Storage.
9. APPLY-07, Cloud Function for the vision call, contents list written back to the box record.
10. Text search across notes and contents.
11. Shelly logs twenty real boxes without help. If that works, the app is done.

The vertical slice was one plan in the original sequence, then two, and is now three. APPLY-03 proved sign-in, install, and the offline shell on real hardware with no screens on top of them. APPLY-04 proved a configured move reaches the app. APPLY-05 built the part the gate measures. What is left between here and August 24 is running it on two phones with a timer.

Steps 8 through 10 can land through September and still beat early October. Stop at step 11. Anything past it is the builder solving a harder problem than the situation requires.

## Live drift

Things that are still true and still owed.

**The undefined write hazard.** Writing an optional field as an explicit `undefined` throws at runtime and `tsc` will not catch it. `updateValidated` and `createValidated` pass the parsed object straight to `updateDoc` and `setDoc`, and Firestore is initialized without `ignoreUndefinedProperties`. Zod does not save you: verified 2026-08-02 against the pinned Zod 4 that a missing optional key is absent from the parsed output, while a key supplied as an explicit `undefined` is preserved as one. So `{ ...move, destinationLocationId: maybeUndefined }` compiles, parses, then fails at the write. `moveSchema` has two optional fields and `containerSchema` has eight, so APPLY-05 is where this bites. Build objects with a conditional spread: `{ ...move, ...(id ? { originLocationId: id } : {}) }`.

**Find has no recent boxes and no link to text search.** Doc 04 section 4 asks for both and Find shows matches only. Belongs with step 10, which is when text search exists and there is something for the link to point at. Until then a person who does not know the number has nothing to open, which is the gap to watch during the first real packing session.

**Deploys ship the working tree, not `main`.** `firebase deploy --only hosting` uploads whatever `dist/` was last built locally, so production has run code before its pull request merged. Harmless while one person deploys, and the strongest argument for the deploy workflow.

**Toolchain versions differ from the plans' baselines.** Build machine is Node 24.18.1 and npm 11.16 against plans verified on Node 22.22 and npm 10.9. `create-vite` resolved to 9.1.2, shipping vite 8, react 19.2, and typescript `~6.0.2` where APPLY-01 claimed 7.0.2. Nothing has traced back to any of it so far. A failure that does is a finding to report rather than a thing to patch around.

**The emulator needs `java` on `PATH`,** not only `JAVA_HOME`. `firebase emulators:exec` reports "Could not spawn `java -version`" otherwise. VS Code's integrated terminal does not inherit a newly set user-scope `JAVA_HOME` until VS Code restarts, which cost time twice.

**The Storage emulator resolves cross-service `firestore.get` against `GCLOUD_PROJECT`,** the project the CLI runs as, rather than the project id the test environment was created with. Membership seeded under a test-only project is invisible to the rule and every member check reads null. `tests/rules/storage.rules.test.ts` reads `GCLOUD_PROJECT` for this reason, and runs on a different project id than the Firestore test file because vitest runs both in parallel while that file clears Firestore in its own `beforeEach`.

**`oxlint` came with the template** rather than being added. `.oxlintrc.json` and the dependency are untouched and unused.

**Component tests cover two files.** The render environment exists now, but only `keypad.ts`, `label.ts`, and `FindBox.tsx` have tests. `AddBox.tsx` is the screen the 20-second number turns on and nothing covers it but a phone, because reserving a number touches Firestore and there is no fake for it yet. The first-run flow is still uncovered too.

**Testing Library needs `globals: true`.** It registers its own `cleanup` only when a global `afterEach` exists. Without it a second `render` in one file stacks on the first and every query finds two of everything, which reads as a component bug rather than a harness one. Set during the APPLY-05 run. `tsconfig.json` had listed `vitest/globals` in `types` since APPLY-01, so the types had been claiming this all along.

## Resolved drift

One line each, so a reader knows these were real and are closed.

- Doc 05 named Firebase SDK v10 against a resolved v12. Corrected during the APPLY-02 run.
- APPLY-01's flat `tsconfig.json` omitted `jsx`, `allowImportingTsExtensions`, and `vite/client` while including all of `src`, so `tsc` failed with 60 errors on the template files. Corrected during the APPLY-01 run.
- `tsconfig.json` `include` had to become `["src", "tests"]` or the rules tests were never typechecked. Applied during the APPLY-02 run.
- APPLY-01 step 2 could not answer the `create-vite` prompt safely, since `--no-interactive` cancels and `--overwrite` deletes existing files. Scaffolded into a scratch directory and copied in.
- `tests/rules/firestore.rules.test.ts` covered seven of doc 10's nine required cases plus two extra Firestore cases, so the count matched by coincidence. Closed 2026-08-02.
- `watchMoves` subscribed to the whole `moves` collection unfiltered under a comment claiming the rules narrowed the result. Rules are not filters and a list query fails outright the moment it touches an unreadable document. Fixed during the APPLY-03 run with an `array-contains` filter on `memberUids`.
- The bundle was one chunk of 895 kB, 266 kB gzipped. Split in APPLY-05 into `firebase` at 620.64 kB and 183.01 kB gzipped, `react` at 189.53 kB and 59.60 kB gzipped, and the application chunk at 93.58 kB and 25.99 kB gzipped, plus 13.65 kB of CSS at 3.73 kB gzipped. Total bytes went up slightly, which is what a split does. What it buys is three parallel fetches on a first load, and an app update that re-downloads 26 kB gzipped rather than 266 kB, because the Firebase chunk's hash does not move when application code changes. Vite still warns on the Firebase chunk and will keep warning; the number to watch is the application chunk.
- No component could be rendered in a test until APPLY-05, because `vitest.config.ts` ran in the `node` environment. Now jsdom plus Testing Library, with the first component test on `FindBox`.
- `Rooms.tsx` read "Next colour:" in a repo that writes "color" everywhere else. Fixed during the APPLY-05 run.
- The number on Add box was `text-6xl`, 60px, under doc 04 section 2's 72px minimum. Raised to `text-7xl` on 2026-08-02.
- Doc 04 section 3 called for the color as a background fill rather than a small dot, which nothing implemented. Settled 2026-08-02 in the code's favor: the color name is set in the room's own color at large type, because the word is what gets copied onto cardboard and a fill behind the number costs contrast. Doc 04 section 3 was amended to match and says why.
- Hosting cache headers were unset until APPLY-04. Now `immutable` for `/assets/**` and `no-cache` for the four entry files. Verified live.
- APPLY-02 was branched from `feat/domain-core` rather than `main`. Both merged.
- A second Firestore database, `move-ledger-db` in us-central1, was created in the console alongside the `(default)` database the rules deploy created. The app resolves to `(default)`. The extra one was deleted 2026-08-02.
- The Storage rules tests were first written in a cloud container where `firebase-tools` proxies every request without checking `NO_PROXY`, including the rules runtime's own loopback call to the Firestore emulator. That returns 405 and the CLI swallows it as a missing document, which reads exactly like a membership failure. Does not affect a local run. The tests have since passed 20 of 20 on Windows.

## Open items

- Measure the box flow. Add ten boxes with a timer and record seconds per box, target under 20. Find three by number, target under 10 seconds each. Then airplane mode, add three more, confirm the numbers keep climbing without repeating, and confirm they reach the other phone once the network is back. The offline check is the one that would hurt to get wrong, because a repeated number cannot be undone after a marker has touched cardboard.
- Shelly installs the app and reads her account id, then Nathan adds her on the Members screen. This is the ADR-0005 couch step and it needs both people present.
- Restrict the browser API key by HTTP referrer to `move-ledger.web.app` and `move-ledger.firebaseapp.com`. Actionable since Hosting went live on 2026-08-02.
- Deploy on merge to `main` through GitHub Actions, with preview channels on pull requests. Wanted mostly for the preview URLs, so a change can be opened on a phone before it reaches the installed app.
