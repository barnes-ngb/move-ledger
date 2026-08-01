# ADR-0002: Personal tool, not a product

Status: accepted
Date: 2026-07-25

## Context

The earlier specification described a five-phase product with fifteen tickets, helper and viewer roles, an `Item` entity, seven AI features, and a conflict review interface. The actual requirement is a tool for one household move between Kansas City and Dallas-Fort Worth, three to six months out, used by two adults.

The gap between those two things is roughly a factor of ten in build time.

There is a second consideration. This project has no career surface. It should not expand to absorb time that belongs elsewhere.

## Decision

Build for two named users and one move. Cut everything whose value depends on a third user or a second move.

## Alternatives considered

**Build the product.** Lost because the move has a date and the product does not have a customer.

**Build the tool now and generalize later.** Rejected on the grounds that generalizing usually trades overfitting for underfitting. If a general version is ever wanted, the right move is to build it from what was learned, not to carry speculative structure through the version that has to work.

## Consequences

Cut from scope:

- Helper and viewer roles. Two people, both owners.
- The `Item` entity and per-object records.
- Conflict review UI. Two people editing the same field offline resolves last-write-wins, and that is fine.
- Server-side dynamic number block allocation. Two hardcoded ranges instead.
- AI packing warnings, unpacking plan generation, damage comparison, OCR, room suggestion.
- `planned` and `in_transit` statuses.
- Packing material tracking and move completion summary.
- Monorepo structure and package boundaries.

Kept because they earn their place in a two-person move:

- Location and Zone as separate entities, because truck-as-location is what makes move day work
- Activity events, because "who moved this and when" is the question asked at 9pm on move day
- Export, because the data should outlive the tool

The plan is three phases. Phase 2 completes a usable tool. Phase 3 is optional.

## Revisit when

Someone other than the two household members wants to use it, which would require a genuine authorization model rather than a membership array.
