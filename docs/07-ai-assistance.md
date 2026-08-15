# AI Assistance

## Position

AI is a Phase 3 addition to a system that already works without it. If Phase 3 never happens, nothing is broken.

Two features are in scope. Everything else from earlier drafts is cut.

## Rule

AI suggests. The person confirms. A suggestion never becomes canonical text without a tap.

## Feature 1: Contents summary from photo

### When

After the box is saved, in the background. Never in the packing path, which waits on nothing.

### Input

One contents photo, already resized, plus the destination zone name.

### Output

```json
{
  "summary": "Coffee maker, blender parts, measuring cups, food storage containers.",
  "categories": ["kitchen", "small appliances"],
  "confidence": 0.86
}
```

### Storage

Written to `container.aiSummary`. Included in `searchText`. Displayed with a suggestion marker.

A second contents photo appends its line to the same `aiSummary` rather than replacing it, per the accumulate amendment below. The write is one Firestore write per photo, not one per attempt, because every write fans out to both phones' subscriptions.

When the user taps Accept, the text moves to `contentsSummary` and `aiSummary` is cleared. When the user edits and accepts, the edited text goes to `contentsSummary`. When the user dismisses, `aiSummary` is cleared and a flag prevents regeneration for that photo.

## Feature 2: Search enrichment

No separate feature to build. It falls out of Feature 1 once `aiSummary` is in `searchText`. The only work is marking results whose match came from an unconfirmed summary.

## Cut

- Room suggestion. Picking a room is one tap and the user already knows the answer.
- OCR of product packaging and handwriting.
- Packing warnings.
- Unpacking plan generation. Sorting by `unpackPriority` is a query, not a model.
- Damage comparison.

Each of these was in the earlier draft. None of them beats the three success measures in `docs/00-product-brief.md` as a use of build time.

## Implementation

One Firebase callable function so the API key stays server-side. It reads the photo from Cloud Storage by path, calls the model, validates the response against a Zod schema, and writes `aiSummary` with Admin SDK credentials.

It is triggered on demand from the client rather than by a Storage trigger, so that cost stays under explicit control and a re-uploaded photo does not silently re-bill.

## Privacy

- Photos of a household interior are sent to a third party. Both members are told this once, in plain words, before the feature is enabled.
- Send the image and the zone name. Nothing else.
- Never send the destination address.
- A single setting disables the feature for the whole move.
- Deleting a move deletes derived AI text along with everything else.

## Cost control

- Never process the same photo twice. Key the cache on `storagePath`.
- Every contents photo gets one call, and the results append. Amended 2026-08-15; see below.
- Hard cap per move, checked in the function, not in the client.
- Doc 11 assumes 300 boxes at two photos each, so 600 calls. The cap is 800, which leaves room for a box photographed more than twice without leaving room for a runaway. Amended 2026-08-15; see below.

## Amendments

Both were made on 2026-08-15, before the APPLY-07 code, because this doc governs and the plan departed from it in two places.

**One photo per box became every contents photo.** The original rule summarized the first contents photo and no others. That was written when a box was one moment. Packing happens in layers: books, then linens, then a lamp on top. The first photo is the bottom of the box and the least representative thing in it, so the rule guaranteed that the least useful layer was the only one indexed. Every contents photo now gets one call and the summaries append, which is what makes a box whose list reads "books, linens, lamp" findable by any of the three. The rule this replaces was a cost measure, and the cap below is what now does that job.

**The cap rose from 400 to 800.** The original 400 was set against an estimate of one call per box at 300 boxes. With the accumulate rule, the ceiling is one call per contents photo, and doc 11 budgets 600 photos across 300 boxes. 800 covers that with headroom for boxes packed in more layers than average. The arithmetic: 300 boxes, 2 photos each, is 600 calls at the doc 11 estimate; 800 is that plus a third of it again. The cap stays enforced in the function rather than the client, which is unchanged and not negotiable.
