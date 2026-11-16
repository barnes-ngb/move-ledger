# ADR-0009: Furniture size and weight from a photo, and measured dimensions

Status: accepted
Date: 2026-11-15
Amends: ADR-0007 and ADR-0008, for furniture only

## Context

ADR-0007 ruled out a weight estimated from a photo, and ADR-0008 kept that rule when furniture came in: the figures came from a table a person wrote. The reason in ADR-0007 was a sealed tote. A photo of one says nothing about whether it holds books or pillows.

A piece of furniture is different. The photo shows the thing itself: what it is, what it is made of, and with a tape measure in the shot, how big it is. The household asked for the photo to give the size and a weight, and agreed to amend the record for furniture.

A preset is one size for every dresser. The household will lay a tape measure along the larger pieces and can take three measurements, which give the real space a piece takes up.

## Decision

A piece of furniture takes optional outside dimensions in inches. All three together set its cu ft. On Add furniture, measured dimensions also scale the weight of the piece picked from the list, between half and double, until somebody types a weight of their own. A scaled weight is still a guess.

Add furniture and box detail on a piece offer Estimate from photo. It sends up to three uploaded photos of that piece to the model and returns a name, the outside dimensions, and a weight with a low and a high, saying whether the size was read from a tape measure. The function writes nothing. The phone shows the estimate, and only "Use these" puts it into the fields, with the weight marked as a guess. A suggestion never becomes a figure in the totals without a tap.

The privacy rules of the contents list hold: the move has to have turned photo features on, the photos are the only thing sent, and text on documents or screens is never transcribed. The cap is 200 estimates per move, checked in the function.

## What stays as it was

A box is never weighed from a photo. ADR-0007 holds for everything that is not furniture or an appliance.

## Alternatives considered

**Dimensions only, no photo.** Cheaper and more accurate on size, and kept: the measurement fields work without the photo. The photo adds the weight judgment, solid wood against particleboard, which a tape measure cannot give.

**Writing the estimate straight to the piece.** Lost on the rule in doc 07 that a suggestion never becomes canonical without a tap.

## Consequences

Easy: one photo with a tape measure in it gets a piece close enough for the capacity question, and the summary still says how much of the weight is guessed.

Harder: the estimate needs a connection and a deployed function, so it is the one part of furniture that does not work offline. The measurement fields and the list do.
