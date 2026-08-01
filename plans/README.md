# plans

Single-use build instructions. An agent reads one of these top to bottom, runs it, and the file is spent.

They are not specification, so they do not belong in `docs/`. They are not decisions, so they do not belong in `decisions/`. They live here because they record how the code got its shape, which is worth keeping after the run.

Two rules:

- Do not re-run a spent plan.
- Do not edit a plan to work around a problem found while running it. A failure during a run is a finding. Report it, decide, then fix the code through a normal branch and pull request.

| Plan | Status | Notes |
| --- | --- | --- |
| `APPLY-01-domain-core.md` | Run 2026-08-01 | Verified on Node 22.22 before delivery. Build machine is Node 24. The plan's flat `tsconfig.json` omitted `jsx`, `allowImportingTsExtensions`, and `vite/client`, so `tsc` failed on the template files it had pulled into `include`. Corrected during the run. |
| `APPLY-02-firebase-repositories.md` | Run 2026-08-01 | Rules tests passed on first execution anywhere: 9 of 9, no rule or test changed. Branched from `feat/domain-core` because APPLY-01 was not merged. Firestore rules are deployed. Storage rules are not, because Firebase Storage is not set up on the project. |

Update the status column in the same pull request as the run.
