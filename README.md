# Move Ledger

Move Ledger is a phone-first tool for organizing one household move.

Scope note: this is a personal tool, not a product. It is built for the Barnes household move from Kansas City to Dallas-Fort Worth. Decisions favor finishing over generality. See `decisions/0002-personal-tool-scope.md`.

The core system is intentionally simple:

- The app assigns each box a permanent number.
- The user writes that number and a room color on the box.
- The user photographs the contents and adds a short note.
- The app tracks where the box is, where it is going, and whether it has been packed, loaded, unloaded, or opened.
- A printer, QR code, barcode, or special label is not required.

Example physical label:

```text
042
BLUE
OPEN FIRST
```

The full record for Box 042 lives in the app.

## Product goal

Make recording a box take less than 20 seconds and finding a box take less than 10 seconds.

These two numbers are the only success criteria that matter. Every scope decision is judged against them.

## Stack

Installable PWA. React, TypeScript, Vite. Firebase for auth, Firestore, Cloud Storage, and Hosting. No Docker required at any point.

## Documentation

Read in order. Docs 00 through 04 describe the product. Docs 05 through 08 describe the build. Docs 09 through 11 are reference.

- [Product Brief](docs/00-product-brief.md)
- [MVP Scope](docs/01-mvp-scope.md)
- [Domain Model](docs/02-domain-model.md)
- [User Flows](docs/03-user-flows.md)
- [Screen Specifications](docs/04-screen-specifications.md)
- [System Architecture](docs/05-system-architecture.md)
- [Photo Upload Queue](docs/06-photo-upload-queue.md)
- [AI Assistance](docs/07-ai-assistance.md)
- [Development Plan](docs/08-development-plan.md)
- [Glossary](docs/09-glossary.md)
- [Security Rules](docs/10-security-rules.md)
- [Budget and Limits](docs/11-budget-and-limits.md)

## Decisions

Architectural decisions live in `decisions/`. Any change to a committed decision requires a new record, not an edit to the old one.

- [0001 Firebase over Supabase](decisions/0001-firebase-over-supabase.md)
- [0002 Personal tool scope](decisions/0002-personal-tool-scope.md)
- [0003 Status versus condition](decisions/0003-status-versus-condition.md)
- [0004 Photo upload queue](decisions/0004-photo-upload-queue.md)

## Agent instructions

Coding agents read [AGENTS.md](AGENTS.md). Claude Code reads [CLAUDE.md](CLAUDE.md), which points at the same file.
