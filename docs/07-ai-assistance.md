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
  "items": ["coffee maker", "blender parts", "measuring cups", "food storage containers"],
  "categories": ["kitchen", "small appliances"]
}
```

One entry per thing seen, a plain noun phrase that carries what can be seen of it, such as its color or what it is made of. No sentences and no trailing punctuation. At most 40 items, each 1 to 80 characters. Changed from a single `summary` string on 2026-10-17; see the APPLY-18 amendment below.

No confidence score. Removed 2026-10-17; see the amendments below.

An empty `items` list is a valid reply and means nothing worth listing is visible: a screen, a document, or a photo that is not of a box. The function writes nothing to the box for it and marks the photo `skipped`. The model is told never to describe what the image is instead.

### Storage

Written to `container.aiItems`, with the categories in `container.aiCategories`. `aiSummary` is written beside them as the items joined with ", ", so the export and an older copy of the app keep working. All three are included in `searchText` and matched by search. Displayed as a list with a suggestion marker; the categories show under it so that accepting accepts what is on screen.

A second contents photo appends its items to the same `aiItems` rather than replacing them, per the accumulate amendment below. An item already on the list, compared without regard to case, is not added twice. The write is one Firestore write per photo, not one per attempt, because every write fans out to every member's subscription.

When the user taps Accept, the items move to `contentsItems` with `contentsSummary` written as their joined string, and the categories go to `contentsCategories`. The suggestion fields are cleared. When the user edits and accepts, the edited items go there instead, one per line of the edit field. When the user dismisses, the suggestion fields are cleared and a flag prevents regeneration for that photo. Emptying the confirmed contents list later removes `contentsCategories` with it, because they describe that list.

A box written before items existed has a string and no list. Its items are derived when it is read, by splitting the string on ", ", and the stored data is not rewritten to match. The list is trusted only while it still joins to the string beside it; when the two disagree, the string wins, because an older copy of the app edits the string and cannot see the list.

Asking again reads every contents photo once more and replaces the suggested items only when every call succeeds. Until then the old text stays on screen, and a failure leaves it there with the error under it. A photo whose call failed, or that uploaded before the feature was on, is offered again from box detail with "Write a contents list".

## Feature 2: Search enrichment

No separate feature to build. It falls out of Feature 1 once `aiSummary` and `aiItems` are in `searchText`. The only work is marking results whose match came from an unconfirmed summary.

## Cut

- Room suggestion. Picking a room is one tap and the user already knows the answer.
- OCR of product packaging and handwriting, as a feature of its own. Amended 2026-10-17: a brand name or title the model can read on an object in a contents photo is part of naming that object and is kept. See Privacy.
- Packing warnings.
- Unpacking plan generation. Sorting by `unpackPriority` is a query, not a model.
- Damage comparison.

Each of these was in the earlier draft. None of them beats the three success measures in `docs/00-product-brief.md` as a use of build time.

## Implementation

One Firebase callable function so the API key stays server-side. It reads the photo from Cloud Storage by path, calls the model, validates the response against a Zod schema, and writes `aiItems` and `aiSummary` with Admin SDK credentials.

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

### 2026-10-17, APPLY-18

Made before the APPLY-18 code.

**The contents list is a list of items.** It was one prose sentence shown as a paragraph. A person scanning a box for the stapler reads a list faster than a sentence, and one item is the unit somebody corrects. The model now returns `items`, one noun phrase each, and the box stores them as `aiItems` and, once accepted, `contentsItems`. Every earlier rule stands: the printed text rule, no guessing at what cannot be seen, an empty reply for nothing visible, one call per contents photo, the cap.

**The joined string stays.** `aiSummary` and `contentsSummary` are still written, as the items joined with ", ". The export's contents column reads the string, so it does not change. A phone still running the previous build reads the string and never sees the list, so the two copies of the app can share a move while one of them catches up.

**This is not item-level records.** `AGENTS.md` puts a record for every object out of scope. An item here is a line of text on the box, with no id and no history of its own; it can be found only through the box it is written on. If an item ever needs any of those, that is the scope change and it needs a decision record.

### 2026-10-17, APPLY-16

Made before the APPLY-16 code, for the same reason as the two below.

**The model can say nothing is visible.** A screenshot of a messaging app attached to box 016 came back as a sentence describing the screenshot, and the function appended that sentence to `aiSummary` and `searchText`, so the box matched searches for "screenshot" and "app". The reply schema required a non-empty summary, which left the model no honest answer. An empty summary is now valid, and it writes nothing to the box.

**Categories are searched.** They were asked for on every call, written to an activity event, and never read. They are now stored on the box, carried through accept and dismiss beside the text, and matched by search, because "kitchen" is a word somebody types when they cannot remember the item.

**Printed text is split by what it is printed on.** The paperwork entry in `plans/STATUS.md` recorded that the model transcribes any text it can see. Names on objects help a search and are kept. Writing on a page is the private part and is not transcribed. This narrows that entry rather than closing it: the photo itself still goes to Anthropic.

**Confidence was removed.** It was requested on every call, written to the `summary_generated` activity payload, and read nowhere: no screen, no threshold, no export column. A number nobody acts on is output tokens and a schema field that can fail a parse. If a threshold is ever wanted it comes back with its consumer.

**A failed call is visible and can be asked again.** The client stamps `summaryRequestedAt` before calling and writes `failed` with the message if the call throws, unless the photo has settled meanwhile. It never writes `queued` into `summaryState`: that field is what the function reads to refuse paying for an image twice, and a second phone writing a transient value over `done` or `skipped` would take the refusal down. A request mark older than two minutes, from a page closed before its call settled, no longer holds the photo back. Asking again no longer clears the old suggestion first, so a failure no longer destroys the text it was meant to replace.

### 2026-08-15, APPLY-07

Both were made on 2026-08-15, before the APPLY-07 code, because this doc governs and the plan departed from it in two places.

**One photo per box became every contents photo.** The original rule summarized the first contents photo and no others. That was written when a box was one moment. Packing happens in layers: books, then linens, then a lamp on top. The first photo is the bottom of the box and the least representative thing in it, so the rule guaranteed that the least useful layer was the only one indexed. Every contents photo now gets one call and the summaries append, which is what makes a box whose list reads "books, linens, lamp" findable by any of the three. The rule this replaces was a cost measure, and the cap below is what now does that job.

**The cap rose from 400 to 800.** The original 400 was set against an estimate of one call per box at 300 boxes. With the accumulate rule, the ceiling is one call per contents photo, and doc 11 budgets 600 photos across 300 boxes. 800 covers that with headroom for boxes packed in more layers than average. The arithmetic: 300 boxes, 2 photos each, is 600 calls at the doc 11 estimate; 800 is that plus a third of it again. The cap stays enforced in the function rather than the client, which is unchanged and not negotiable.
