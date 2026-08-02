# plans

Single-use build instructions. An agent reads one of these top to bottom, runs it, and the file is spent.

They are not specification, so they do not belong in `docs/`. They are not decisions, so they do not belong in `decisions/`. They live here because they record how the code got its shape, which is worth keeping after the run.

Two rules:

- Do not re-run a spent plan.
- Do not edit a plan to work around a problem found while running it. A failure during a run is a finding. Report it, decide, then fix the code through a normal branch and pull request.

| Plan | Status | Notes |
| --- | --- | --- |
| `APPLY-01-domain-core.md` | Run 2026-08-01 | Verified on Node 22.22 before delivery. Build machine is Node 24. The plan's flat `tsconfig.json` omitted `jsx`, `allowImportingTsExtensions`, and `vite/client`, so `tsc` failed on the template files it had pulled into `include`. Corrected during the run. |
| `APPLY-02-firebase-repositories.md` | Run 2026-08-01 | Rules tests passed on first execution anywhere: 9 of 9, no rule or test changed. Branched from `feat/domain-core` because APPLY-01 was not merged. Firestore rules are deployed. Storage rules are not, because Firebase Storage is not set up on the project. Defect found after the run: those 9 tests were 7 of the 9 cases doc 10 requires plus 2 extra Firestore cases. Closed on 2026-08-02 by `tests/rules/storage.rules.test.ts`, which is not a re-run of the plan. |
| `APPLY-03-pwa-shell.md` | Run 2026-08-02 | The first plan delivered without being compiled first. It compiled anyway: `tsc` clean and `vite build` clean on the first attempt, tests steady at 47, nothing in `src/domain` touched. Deployed to `https://move-ledger.web.app`. Two corrections were made during the run and neither came from a compile error. `.gitignore` gained `tsconfig.tsbuildinfo` and `.firebase`, which step 8's `git add -A` would otherwise have committed. The sync indicator strings were wrong in the plan and in doc 04 both: doc 09 arbitrated to "Online" and "Offline, changes saved here", and doc 04 section 9 was amended to match. |

Update the status column in the same pull request as the run.

## Numbering

The vertical slice was one plan when APPLY-02 was written. It is now two, so everything after it shifted by one. APPLY-02's comments still use the old numbers. That file is spent and is left alone, because a spent plan is a record rather than a document to maintain. This table is the current numbering.

| Number | Scope |
| --- | --- |
| APPLY-03 | Tailwind, PWA shell, auth gate, sync indicator, first deploy. Run. |
| APPLY-04 | Add box, Find, box detail, first-run setup. |
| APPLY-05 | Photo capture, client-side resize, upload queue to Storage. Called APPLY-04 in APPLY-02's comments. |
| APPLY-06 | Cloud Function for the vision call. Called APPLY-05 in APPLY-02's comments. |
