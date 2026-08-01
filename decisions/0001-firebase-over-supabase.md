# ADR-0001: Firebase over Supabase

Status: accepted
Date: 2026-07-25

## Context

An earlier draft of the specification committed to Supabase, PostgreSQL, row-level security, and Edge Functions, with a hand-written offline sync queue described across a full document.

Two constraints were not represented in that draft:

1. The development machine has no Docker and no local administrator rights. Supabase local development runs on Docker. Without it, every migration and every RLS policy test either runs against a live hosted project or does not run.
2. This is a personal tool for one household move, not a product. Engineering time spent on infrastructure is time not spent on the two success measures.

## Decision

Build on Firebase. Auth, Firestore, Cloud Storage, and Hosting. No self-hosted server. Cloud Functions only if Phase 3 AI work happens.

## Alternatives considered

**Supabase as originally specified.** Lost on the Docker constraint. Local development would be unavailable, which removes the ability to test security rules and migrations before they reach production data. The offline sync queue would also be entirely hand-written.

**Local-only, no backend.** Genuinely tempting and would have been fastest. Lost because two people packing simultaneously on two phones is a hard requirement, and it is the requirement that a local-only tool cannot satisfy.

**PostgreSQL on a small VPS.** Lost on operational cost for a tool with a lifespan of a few months.

## Consequences

Easy now:

- Offline reads and writes with no code, including survival across app restarts
- Two-device concurrency with no conflict logic
- No local environment that needs Docker
- Emulators run on Node plus a JRE, both installable without admin

Hard now:

- No SQL. Reporting queries become client-side filtering over the local cache. Acceptable at a few hundred documents.
- Firestore security rules are a separate language with their own test harness.
- Cloud Storage does not queue uploads offline. That gap is handled in ADR-0004.
- Cloud Storage requires the Blaze plan, so a credit card is attached even at zero usage. Budget alerts are required. See `docs/11-budget-and-limits.md`.

Impossible without a new record: adding a self-hosted API layer, or moving photo storage off Cloud Storage.

## Revisit when

This tool is being turned into something other people use, or the document count passes a scale where client-side filtering stops being reasonable, roughly ten thousand containers.
