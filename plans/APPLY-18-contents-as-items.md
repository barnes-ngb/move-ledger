Read AGENTS.md, docs/07-ai-assistance.md, docs/09-glossary.md, and
functions/src/index.ts first. Save this as plans/APPLY-18-contents-as-items.md.
Branch off main. Amend doc 07 before code.

=== WHY ===

The contents list is one prose sentence rendered as a paragraph. A person
scanning for "the stapler" reads a list far faster than a sentence, and an
item is the natural unit for editing and for search. Make items the shape
end to end.

=== 1. The model returns items ===

functions/src/index.ts: the reply schema becomes
  { items: string[] (max 40, each 1-80 chars), categories: string[] }
Prompt asks for one item per entry, plain noun phrases with the visible
color/material/size folded in as today, no sentences, no trailing
punctuation. Nothing visible: items []. Keep every existing rule
(objects' printed text yes, documents no; no guessing).

Accumulate per photo: append to aiItems (string[]) on the container, skip
exact duplicates case-insensitively. Keep writing aiSummary as the items
joined with ", " so search, export, and the old client stay compatible.
The APPLY-16 batch/replace behavior for Ask again applies to aiItems the
same way. Empty items writes nothing and marks the photo skipped, as now.

=== 2. Domain and repositories ===

containerSchema: aiItems and contentsItems, both string[] optional.
Accept moves aiItems -> contentsItems and clears aiItems; dismiss clears.
buildSearchText includes both arrays. Export: contents column stays the
joined string. Old boxes with aiSummary but no aiItems: derive items by
splitting on ", " at read time (one helper, tested), never rewrite stored
data on read.

=== 3. UI ===

AiSummary and the confirmed contents on BoxDetail render as a bulleted
list, one item per line, same type size as now. Edit mode is a textarea
with one item per line; save splits on newlines, trims, drops blanks.
The AddBox contents field (APPLY-11) follows the same one-per-line rule.
Categories render as small chips beneath, as APPLY-16 left them.
Glossary applies to every string.

=== 4. Verify ===

npm run verify, npm run build, npm --prefix functions run typecheck. No
deploy. Docs: doc 07, doc 04, plans/README.md, STATUS. Commit, push, open
the PR. Report where you exercised judgment, and confirm the old client /
new function and new client / old function cases both degrade cleanly.
