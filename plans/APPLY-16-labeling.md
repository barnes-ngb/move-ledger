Read AGENTS.md, CLAUDE.md, docs/07-ai-assistance.md, docs/09-glossary.md,
and functions/src/index.ts first. Save this brief verbatim as
plans/APPLY-16-labeling.md, then execute it. Branch off main.

Not compiled before delivery. Fix compile errors in place and report what
changed. Amend doc 07 BEFORE code for items 1, 2 and 3; it is the arbiter.

=== WHY ===

Production evidence: a messaging-app screenshot attached to box 016 produced
"This is a screenshot of a messaging app conversation, not a photo of a
moving box. No packed items are visible to catalog." The function appended
that sentence to aiSummary AND searchText (functions/src/index.ts:170-176).
That box now matches searches for "screenshot", "app", "catalog". The model
had no way to say "nothing here": modelResponse requires summary.min(1).

Separately: categories are collected and discarded, failed calls are never
retried, and the one retry control destroys itself on failure.

=== 1. A way to say nothing is visible ===

functions/src/index.ts:
  - modelResponse: summary becomes z.string().max(400) (allow empty).
  - System prompt: add that if no household items are visible, or the image
    is a screen, a document, or not a box, return summary "" and empty
    categories. Never describe what the image is instead.
  - After readModelReply: if summary.trim() is empty, set photoRef
    summaryState "skipped", write NOTHING to the container, and return
    { skipped: "nothing visible" }. Do not add to searchText.

=== 2. Categories into search ===

Same transaction (index.ts:165-178): append categories, joined by spaces,
to searchText alongside the summary line. Store them on the container as
aiCategories: string[] (containerSchema gains it, optional) so client-side
buildSearchText rebuilds include them. Accept/dismiss paths in
src/repositories/containers.ts: when aiSummary is accepted, aiCategories
move with it into a confirmed field (contentsCategories) and are cleared
from the suggestion; when dismissed, cleared. buildSearchText
(src/domain/search.ts) includes both. Tests.

=== 3. Printed text rule ===

System prompt: brand names, titles, and labels printed ON OBJECTS are useful
and should be included (a magazine title, a product box). Text on
documents, paperwork, mail, screens, or anything that is itself a page of
writing must not be transcribed; name the object ("a stack of papers")
and stop. Record in doc 07 Privacy. This narrows the Live drift entry about
transcribed paperwork; update STATUS accordingly.

=== 4. Failures are retried; the retry control survives ===

a. Client writes summaryState "queued" before calling (src/photos/summary.ts
   requestSummary). On a thrown call, write "failed" with the error message
   in a new optional field summaryError (schema). Function already writes
   "done"/"skipped"/"failed".
b. src/ui/box/AiSummary.tsx redo (lines 98-112): do NOT dismiss first. Call
   the function with redo:true for every contents photo; only when ALL
   settle fulfilled, replace the suggestion. On any rejection, leave the
   old text in place and show the error inside the still-mounted panel.
   The function side must support this: with redo, it currently appends
   to existing aiSummary. Add a request field replace: true that makes the
   first successful redo in a batch overwrite rather than append. Simplest
   correct shape: client passes a batchId; function clears aiSummary when
   it sees a batchId it has not seen on that container (store
   lastSummaryBatch on the container). Explain what you chose.
c. A box whose contents photos are "failed" or absent-but-uploaded needs an
   ask control. On BoxDetail, when there is no suggestion and at least one
   contents photo has storagePath and summaryState in {absent,"failed"},
   show "Write a contents list" (verb label) that calls the function for
   those photos. Reuse AiSummary's panel chrome; do not fork.
d. The enabled race (src/photos/summary.ts:12-16, src/App.tsx:29): the
   uploader can confirm an upload before the move snapshot sets `enabled`,
   and that photo is never summarized. Fix: requestSummary must read
   aiEnabled from the move document (getDoc, cache-first) rather than a
   module flag, or the uploader must defer afterUpload until the flag has
   been set at least once. Choose the one that keeps the uploader free of
   React; explain.

=== 5. Confidence ===

Drop it from the response schema and prompt. It is written to an activity
payload and read nowhere. Record in doc 07 that it was removed and why.

=== 6. Verify ===

npm run verify, npm run build, npm --prefix functions run typecheck.
Do NOT deploy anything. Docs: plans/README.md row, STATUS (close the
screenshot-pollution finding, the retry gap, the enabled race; narrow the
paperwork item), doc 07 amendments. Commit, push, open the PR. Report where
you exercised judgment, and list exactly which commands I must run on the
desktop afterward (functions deploy, and whether the existing box 016
summary needs a one-off cleanup).
