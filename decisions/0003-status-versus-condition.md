# ADR-0003: Status and condition are separate axes

Status: accepted
Date: 2026-07-25

## Context

The earlier domain model listed eleven container statuses in a single enum, including `missing` and `damaged`. The user flow document then required that reporting damage must not lose the box's other status history.

Those two statements contradict each other. A single-valued enum cannot hold both `loaded` and `damaged`.

The physical situation is unambiguous. A box that gets crushed in the truck is still in the truck. Damage does not replace position, it accompanies it. The same is true of a box reported missing: it had a last known position and that position is the most useful thing to know about it.

## Decision

Two independent axes.

Status is position in the pipeline. Exactly one value.

```text
filling -> packed -> staged -> loaded -> unloaded -> opened -> emptied
```

Conditions are optional reports that coexist with any status.

```ts
conditions: {
  missing?: ConditionReport;
  damaged?: ConditionReport;
}
```

A `ConditionReport` carries `reportedAt`, `reportedBy`, an optional note, and photo IDs.

## Alternatives considered

**Keep the flat enum and store a previous status alongside.** Lost because it makes every consumer of status branch on whether the current value is a real position or a condition wearing a position's clothes.

**Model conditions as activity events only.** Lost because "show me every damaged box" then requires scanning the activity collection. Damage needs to be queryable on the container.

**A boolean pair with no report body.** Lost because the damage record needs photos and a timestamp to be worth anything at export time for an insurance conversation.

## Consequences

- The status enum shrinks from eleven values to seven. I had estimated six when proposing this. `filling` is the seventh and it is necessary, because a container document is written the moment its number is reserved, before the photo exists.
- `in_transit` is removed. For a household move, `loaded` and `in_transit` are the same fact.
- The status transition function in `src/domain/status.ts` becomes a simple linear graph with allowed reversals.
- Filters gain a condition dimension. "All boxes, damaged" and "unloaded boxes, damaged" are both meaningful and both easy.
- Export includes conditions as separate columns, which is the shape an insurance claim wants.

## Revisit when

A third condition appears that is not a report of a problem. At that point the conditions object may want to become a subcollection.
