# Claude Code Instructions

All operating rules for this repository live in [AGENTS.md](AGENTS.md). Read that file first.

## Environment

- Windows, PowerShell, VS Code.
- No Docker. No local administrator rights. Do not propose a solution that requires either.
- Node and npm are available. The Firebase CLI installs to the user profile via `npm i -g firebase-tools`.
- The Firebase Emulator Suite requires a JRE. If one is not present, use a portable JDK extracted to a user directory and set `JAVA_HOME` for the session. Do not propose an installer that prompts for elevation.

## Before writing code

1. Read `AGENTS.md`.
2. Read `docs/09-glossary.md`. Naming drift is the most common failure in this repo.
3. Check `decisions/` for a record covering the area you are about to change.

## Working discipline

- One logical change per branch and per pull request.
- Never commit to `main` directly.
- Lay out the approach and get confirmation before generating files.
- Update the relevant doc in the same PR when behavior or architecture changes.
