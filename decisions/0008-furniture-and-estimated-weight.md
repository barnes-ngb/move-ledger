# ADR-0008: Furniture in the totals, with estimated weight and a not-sure mark

Status: accepted
Date: 2026-11-15

## Context

APPLY-19 put size and weight on every box and a total against the container. By 2026-11-15 the household had weighed 34 of 62 boxes, and the boxes came to about 1,550 lb and 190 cu ft, far less than the photo estimate had assumed. The decision about a second container now turns on the furniture, which is not in the app at all, and a dresser does not go on a bathroom scale.

ADR-0007 said weight is typed by a person and never estimated by the model. It also said furniture tracked as a container takes a typed cu ft figure, but nothing in the app makes a piece of furniture quick to add, and nothing gives a weight for something that cannot be weighed.

Some pieces are not settled either. The household is selling several and has not decided about others, and the number the decision rests on is different with and without them.

## Decision

Add furniture the way a box is added: it reserves a number that goes on the piece on tape, and it takes a room and optional photos. The screen offers a list of common pieces, each with a typical cu ft and lb. Picking one fills both fields, and both stay editable.

A weight that came from that list, or that a person typed as a guess, is stored with a mark saying it is an estimate. The summary shows how much of the total is estimated rather than weighed. An estimated weight never feeds the average that fills in unweighed boxes, because a guess must not pass itself off as a measurement.

A piece can be marked "Not sure it's going". The summary keeps such pieces in the main total, which is the safe reading, and adds a line with the total without them.

The reference figures are a fixed table in the code, written by a person. Nothing is estimated by the model and nothing is read from a photo. The decision to keep or sell stays with the household: the app shows two totals and suggests nothing.

## Alternatives considered

**A separate furniture list with no numbers.** Faster to type, and lost because a piece without a number cannot be found on the other end, and the totals would come from two places.

**Blank fields with no reference list.** Most honest if every piece is measured, and lost on time: the decision is days away and most pieces will never be measured.

**Leaving undecided pieces out until decided.** Lost because the safe total for the capacity question includes them.

## Consequences

Easy: the summary covers the whole move, and the share that is guessed is visible next to it.

Harder: the reference table is a rule of thumb. The summary says the furniture weight is estimated, and the fields are editable so a measured figure replaces the guess.

Revisit if the summary is ever asked to say which pieces to leave behind. That is still load planning.
