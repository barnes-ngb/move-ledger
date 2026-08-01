# AI Assistance

## Position

AI is a Phase 3 addition to a system that already works without it. If Phase 3 never happens, nothing is broken.

Two features are in scope. Everything else from earlier drafts is cut.

## Rule

AI suggests. The person confirms. A suggestion never becomes canonical text without a tap.

## Feature 1: Contents summary from photo

### When

After the box is saved, in the background. Never in the 20-second path.

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

When the user taps Accept, the text moves to `contentsSummary` and `aiSummary` is cleared. When the user edits and accepts, the edited text goes to `contentsSummary`. When the user dismisses, `aiSummary` is cleared and a flag prevents regeneration for that photo.

## Feature 2: Search enrichment

No separate feature to build. It falls out of Feature 1 once `aiSummary` is in `searchText`. The only work is marking results whose match came from an unconfirmed summary.

## Cut

- Room suggestion. Picking a room is one tap and the user already knows the answer.
- OCR of product packaging and handwriting.
- Packing warnings.
- Unpacking plan generation. Sorting by `unpackPriority` is a query, not a model.
- Damage comparison.

Each of these was in the earlier draft. None of them beats the 20-second target as a use of build time.

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
- Summarize at most one photo per box, the first contents photo.
- Hard cap per move, checked in the function, not in the client.
- Estimated ceiling at 300 boxes: one image call each. Set the cap at 400 and forget about it.
