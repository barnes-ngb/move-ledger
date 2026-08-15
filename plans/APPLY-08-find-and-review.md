Read AGENTS.md, CLAUDE.md, docs/09-glossary.md, and
docs/04-screen-specifications.md first.

Save this brief verbatim as plans/APPLY-08-find-and-review.md before starting,
so the repo keeps the record. Then execute it. Branch: feat/find-and-review.

None of this was compiled before delivery. Fix compile errors in place and
report exactly what changed.

=== WHY ===

Real box 015 was summarized by the deployed function as:

  Magazines and brochures: 'Travel + Leisure' magazine, '2026 Kansas City
  World Soccer Preview' magazine, Subaru Forester Accessories 2026 brochure,
  and a Navarra brochure.

Against today's search, which is one substring test per field:
  "subaru"          finds it
  "soccer magazine" finds nothing  (text reads "soccer preview' magazine")
  "travel leisure"  finds nothing  (text reads "travel + leisure")

The summaries are good. Search cannot reach them. Also: box editing requires
already knowing a number, and photo thumbnails are 96px and ignore taps.

=== STEP 1: token search ===

Rewrite the matching half of src/domain/search.ts. Keep buildSearchText,
findByNumber, exactByNumber, and zoneNameFor exactly as they are. Keep the
search signature and the SearchHit shape.

Add:

  /**
   * Splits text into comparable words. Punctuation is dropped, because the
   * generated contents lists carry quotes, plus signs, and commas that nobody
   * types into a search box.
   */
  export function tokenize(text: string): string[] {
    return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
  }

  /** Below this length a token must match exactly, so "car" misses "cardboard". */
  const MIN_PREFIX = 4;

  /**
   * Loose enough to handle plurals both ways without a stemmer.
   * "magazine" finds "magazines"; "toys" finds "toy".
   */
  export function tokenMatches(query: string, text: string): boolean {
    if (query === text) return true;
    if (query.length >= MIN_PREFIX && text.startsWith(query)) return true;
    if (text.length >= MIN_PREFIX && query.startsWith(text)) return true;
    return false;
  }

Then rewrite search so that:
  - The query is tokenized; an empty query still returns nothing.
  - A container matches if ANY query token matches a token in any searchable
    field. Partial matches count.
  - Field priority is unchanged: number, title, notes, contentsSummary, zone,
    aiSummary. The reported field is the highest-priority one that produced a
    match.
  - suggestionOnly is true only when every match came from aiSummary.
  - An all-digit query token matches the box number, as today.
  - SearchHit gains matchedCount. Sort by matchedCount descending, then box
    number ascending.

EVERY EXISTING SEARCH TEST MUST PASS UNCHANGED. They encode decisions that
still hold. If one fails the rewrite is wrong — report it, do not edit it.

New tests:
  - "soccer magazine" and "travel leisure" both find a container whose
    aiSummary is the exact 015 string above.
  - A box matching two tokens sorts above one matching a single token.
  - Plurals resolve both directions.
  - "car" does not find text containing "cardboard".
  - "travel + leisure" behaves the same as "travel leisure".

=== STEP 2: box list ===

New screen src/ui/box/BoxList.tsx. Requirements, not code — the layout is
your call:

  - A text field at the top filters through search from step 1 as you type.
    Empty shows everything.
  - Unfiltered, boxes sort by number descending so the newest work is on top.
    Filtered, the step 1 ranking governs.
  - Each row: the number in the app's mono type, the room colour dot and room
    name, and the status. A filling box reads "draft" per the glossary.
  - Show a small count when a box has photos.
  - Mark a row whose match came only from an unconfirmed summary.
  - Tapping a row opens BoxDetail. Rows at least 56px tall.
  - With no boxes, say so plainly.

Home screen gets a third action under Find a box, wired as a new View variant
in src/ui/Home.tsx. BoxDetail should return to wherever it was opened from,
with the list's filter text intact.

=== STEP 3: full-screen photo ===

New overlay src/ui/box/PhotoViewer.tsx:

  - Opens on tapping a PhotoStrip thumbnail. The + tile keeps its behaviour.
  - Fills the screen, image fitted whole rather than cropped.
  - Previous and next move through that box's photos in the order taken.
  - A close control; tapping the backdrop also closes.
  - Sources like PhotoStrip does: local blob first, download URL otherwise, so
    a photo taken offline thirty seconds ago opens.
  - If neither exists, say it has not finished uploading rather than showing a
    broken image.
  - Controls clear of the safe-area insets, same pattern as App.tsx.

=== GLOSSARY ===

Box, Room, Place, member, box number. Never Container, Zone, Location, or
sequenceNumber in a string a person reads. `filling` is called a draft. The
word "inventory" is forbidden by name.

=== STEP 4 ===

npm run verify, npm run build. Do NOT deploy — CI ships from main.

=== STEP 5: docs ===

  - plans/README.md: the APPLY-08 row and numbering line.
  - plans/STATUS.md: this plan; close the drift entries for doc 04 section 4's
    missing recent boxes and text search route, and for box editing being
    unreachable without a number.
  - docs/04-screen-specifications.md section 4: record what shipped.
  - One NEW Live drift entry, recorded not solved: the vision model reads text
    visible in photographs, so a box of mail or tax paperwork photographed open
    puts those names into Firestore and sends them to Anthropic. Two-member
    private move so the stakes are low, but importantDocuments boxes are worth
    photographing closed, and nothing in the interface says so.

Commit, push, and open the pull request. Do not merge. Report the PR URL and
say where you exercised judgment in steps 2 and 3.
