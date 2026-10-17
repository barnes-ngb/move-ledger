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
  "categories": ["kitchen", "small appliances"]
}
```

No confidence score. Removed 2026-10-17; see the amendments below.

An empty `summary` with empty `categories` is a valid reply and means nothing worth listing is visible: a screen, a document, or a photo that is not of a box. The function writes nothing to the box for it and marks the photo `skipped`. The model is told never to describe what the image is instead.

### Storage

Written to `container.aiSummary`, with the categories in `container.aiCategories`. Both are included in `searchText` and both are matched by search. Displayed with a suggestion marker; the categories show under the text so that accepting accepts what is on screen.

A second contents photo appends its line to the same `aiSummary` rather than replacing it, per the accumulate amendment below. The write is one Firestore write per photo, not one per attempt, because every write fans out to both phones' subscriptions.

When the user taps Accept, the text moves to `contentsSummary`, the categories move to `contentsCategories`, and both suggestion fields are cleared. When the user edits and accepts, the edited text goes to `contentsSummary` and the categories move the same way. When the user dismisses, both suggestion fields are cleared and a flag prevents regeneration for that photo. Emptying the confirmed contents list later removes `contentsCategories` with it, because they describe that list.

Asking again reads every contents photo once more and replaces the suggestion only when every call succeeds. Until then the old text stays on screen, and a failure leaves it there with the error under it. A photo whose call failed, or that uploaded before the feature was on, is offered again from box detail with "Write a contents list".

## Feature 2: Search enrichment

No separate feature to build. It falls out of Feature 1 once `aiSummary` is in `searchText`. The only work is marking results whose match came from an unconfirmed summary.

## Cut

- Room suggestion. Picking a room is one tap and the user already knows the answer.
- OCR of product packaging and handwriting, as a feature of its own. Amended 2026-10-17: a brand name or title the model can read on an object in a contents photo is part of naming that object and is kept. See Privacy.
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
- Printed text on objects is kept: a magazine title, a brand on a product box. Text on documents, paperwork, mail, screens, or anything that is itself a page of writing is never transcribed. The model names the object, "a stack of papers", and stops. Added 2026-10-17.
- A single setting disables the feature for the whole move.
- Deleting a move deletes derived AI text along with everything else.

## Cost control

- Never process the same photo twice. Key the cache on `storagePath`.
- Every contents photo gets one call, and the results append. Amended 2026-08-15; see below.
- Hard cap per move, checked in the function, not in the client.
- Doc 11 assumes 300 boxes at two photos each, so 600 calls. The cap is 800, which leaves room for a box photographed more than twice without leaving room for a runaway. Amended 2026-08-15; see below.

## Amendments

### 2026-10-17, APPLY-16

Made before the APPLY-16 code, for the same reason as the two below.

**The model can say nothing is visible.** A screenshot of a messaging app attached to box 016 came back as a sentence describing the screenshot, and the function appended that sentence to `aiSummary` and `searchText`, so the box matched searches for "screenshot" and "app". The reply schema required a non-empty summary, which left the model no honest answer. An empty summary is now valid, and it writes nothing to the box.

**Categories are searched.** They were asked for on every call, written to an activity event, and never read. They are now stored on the box, carried through accept and dismiss beside the text, and matched by search, because "kitchen" is a word somebody types when they cannot remember the item.

**Printed text is split by what it is printed on.** The paperwork entry in `plans/STATUS.md` recorded that the model transcribes any text it can see. Names on objects help a search and are kept. Writing on a page is the private part and is not transcribed. This narrows that entry rather than closing it: the photo itself still goes to Anthropic.

**Confidence was removed.** It was requested on every call, written to the `summary_generated` activity payload, and read nowhere: no screen, no threshold, no export column. A number nobody acts on is output tokens and a schema field that can fail a parse. If a threshold is ever wanted it comes back with its consumer.

**A failed call is visible and can be asked again.** The client marks a photo `queued` before calling and `failed` with the message if the call throws. Asking again no longer clears the old suggestion first, so a failure no longer destroys the text it was meant to replace.

### 2026-08-15, APPLY-07

Both were made on 2026-08-15, before the APPLY-07 code, because this doc governs and the plan departed from it in two places.

**One photo per box became every contents photo.** The original rule summarized the first contents photo and no others. That was written when a box was one moment. Packing happens in layers: books, then linens, then a lamp on top. The first photo is the bottom of the box and the least representative thing in it, so the rule guaranteed that the least useful layer was the only one indexed. Every contents photo now gets one call and the summaries append, which is what makes a box whose list reads "books, linens, lamp" findable by any of the three. The rule this replaces was a cost measure, and the cap below is what now does that job.

**The cap rose from 400 to 800.** The original 400 was set against an estimate of one call per box at 300 boxes. With the accumulate rule, the ceiling is one call per contents photo, and doc 11 budgets 600 photos across 300 boxes. 800 covers that with headroom for boxes packed in more layers than average. The arithmetic: 300 boxes, 2 photos each, is 600 calls at the doc 11 estimate; 800 is that plus a third of it again. The cap stays enforced in the function rather than the client, which is unchanged and not negotiable.
