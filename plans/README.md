# plans

Single-use build instructions. An agent reads one of these top to bottom, runs it, and the file is spent.

They are not specification, so they do not belong in `docs/`. They are not decisions, so they do not belong in `decisions/`. They live here because they record how the code got its shape, which is worth keeping after the run.

Two rules:

- Do not re-run a spent plan.
- Do not edit a plan to work around a problem found while running it. A failure during a run is a finding. Report it, decide, then fix the code through a normal branch and pull request.

## Numbering

Settled 2026-08-02. The vertical slice was one plan when APPLY-02 was written, then two, and is now three, so everything after it shifted by two. APPLY-02's comments still carry the old numbers and `src/ui/Home.tsx` already names APPLY-05 correctly. Spent plans are records rather than documents to maintain, so APPLY-02 is left alone and this table is the current numbering.

| Number | Scope | State |
| --- | --- | --- |
| APPLY-01 | Scaffold and domain core | Run 2026-08-01 |
| APPLY-02 | Firebase init, auth, repositories, rules | Run 2026-08-01 |
| APPLY-03 | Tailwind, PWA shell, auth gate, indicator, first deploy | Run 2026-08-02 |
| APPLY-04 | Move subscriptions, first-run setup, member onboarding | Run 2026-08-02 |
| APPLY-05 | The box flow. Add box, Find, box detail | Not written. **August 24 gate.** |
| APPLY-06 | Photo capture, resize, upload queue to Storage | Not written |
| APPLY-07 | Cloud Function for the vision call | Not written |

The box flow took APPLY-05 because build order and file numbers should agree, and the box flow is unambiguously next. Photos and the Cloud Function each shifted up one.

## Runs

| Plan | Status | Notes |
| --- | --- | --- |
| `APPLY-01-domain-core.md` | Run 2026-08-01 | Verified on Node 22.22 before delivery against a Node 24 build machine. The flat `tsconfig.json` omitted `jsx`, `allowImportingTsExtensions`, and `vite/client`, so `tsc` failed on the template files it had pulled into `include`. Corrected during the run. |
| `APPLY-02-firebase-repositories.md` | Run 2026-08-01, fully applied | Rules tests passed on first execution anywhere: 9 of 9, no rule and no test weakened. Branched from `feat/domain-core` because APPLY-01 was unmerged at the time; both are merged now. Firestore rules deployed 2026-08-01, storage rules deployed 2026-08-02 once Storage was set up in the console. Defect found after the run: those 9 tests were 7 of doc 10's 9 required cases plus 2 extra Firestore cases. Closed 2026-08-02 by `tests/rules/storage.rules.test.ts`, which is a fix rather than a re-run. Nothing is owed from this plan. |
| `APPLY-03-pwa-shell.md` | Run 2026-08-02 | The first plan delivered without being compiled first. It compiled anyway: `tsc` clean, `vite build` clean, tests steady at 47, nothing in `src/domain` touched. Deployed to `https://move-ledger.web.app` and verified on an Android phone, including popup sign-in inside the installed standalone app. Two corrections during the run, neither from a compile error. `.gitignore` gained `tsconfig.tsbuildinfo` and `.firebase`. The sync indicator strings were wrong in the plan and in doc 04 both: doc 09 arbitrated to "Online" and "Offline, changes saved here", and doc 04 section 9 was amended to match. |
| `APPLY-04-first-run-setup.md` | Run 2026-08-02 | Move subscriptions, the first-run flow, and both halves of the ADR-0005 onboarding step. Delivered uncompiled and compiled clean on the first attempt: `tsc` clean, `vite build` clean, tests steady at 47, nothing in `src/domain` touched. Deployed with the cache headers verified live against the deployed site rather than trusted from the config. Deferred Add box, Find, and box detail to APPLY-05 by design. Left the Firebase bundle unsplit, which APPLY-03 had asked for before real screens landed, so that debt grew by 28 kB gzipped. |

Update the status column in the same pull request as the run.
