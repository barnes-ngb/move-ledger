# ADR-0007: Size and weight on a box, and a total against the container

Status: accepted, amended for furniture by ADR-0009
Date: 2026-11-14

## Context

The move ships in a 16 foot PODS container with about 710 cubic feet of usable space and a 4,200 lb contents limit, confirmed with PODS on 2026-11-14. A photo walkthrough on the same day put the household at roughly 840 cubic feet and 5,200 lb, which is over on both counts. The household has to decide within days whether to add a second container, and the estimate behind that decision rests on two guesses: what each box weighs, and how many of the 58 logged boxes are large totes rather than cardboard.

Both numbers can be measured. A bathroom scale gives the weight of a box in seconds, and the size of a box is visible on sight. What is missing is a place to record them and a total to read them against.

AGENTS.md lists "3D truck packing or load optimization" as out of scope without a decision record. A running total of size and weight sits next to that line, so it needs this record.

Non-negotiable constraints: weight is typed by a person and never estimated by the model; the totals work offline; the fields are optional so a box can still be saved with a photo and a note; the data is in the export.

## Decision

Add an optional size and an optional weight to every container, a screen for weighing boxes one after another, and a summary that totals cubic feet and pounds against a capacity the household sets on the move. The summary shows how many boxes have no weight yet rather than filling the gap silently.

This record approves totals only. It does not approve a loading order, a layout inside the container, a packing suggestion, or any estimate of how items fit together. Those stay out of scope.

## Alternatives considered

**A spreadsheet beside the app.** Lost because every box and its room already live in the app, and copying 58 rows by hand is the error the app exists to prevent.

**A weight estimated by the vision model from the photo.** Lost on accuracy. A photo of a sealed tote says nothing about whether it holds books or pillows, and the decision this supports has a hard limit with no margin. The household asked for this to be left out.

**Weight only, no size.** Lost because volume is half of the problem and the size of a box is the cheaper of the two numbers to record.

## Consequences

Easy: a person weighs each box once and the app shows the real total against the limit, by room, with the gap in unweighed boxes stated. Furniture already tracked as a container takes a typed cubic foot figure.

Harder: the summary is only as good as the share of boxes weighed, and the screen must say so plainly. A second container changes the capacity, so the capacity is editable rather than fixed.

Revisit if anyone asks the summary to suggest what goes where. That is load planning and needs its own record.
