Read AGENTS.md, docs/09-glossary.md, docs/07-ai-assistance.md, ADR-0007,
ADR-0008, and decisions/0009-furniture-from-a-photo.md first.

=== WHY ===

The owner asked that a photo of a piece give its size and an estimated
weight, with a tape measure in one or more photos, and said he can take three
measurements. He approved amending the ADRs for furniture and wants both:
measurement fields and a photo estimate. The function deploys from his
desktop.

=== 1. Domain ===

containerSchema gains dimensionsIn?: {width, depth, height}, inches, > 0,
max 240. furniture.ts: cuFtOf(d) = w*d*h/1728 to a tenth; scaledWeight(preset,
cuFt) = preset.lb * clamp(cuFt/preset.cuFt, 0.5, 2), whole pounds.

=== 2. Function ===

estimateFurniture({moveId, containerId}) in functions/src/index.ts. Member and
aiEnabled checks as summarizePhoto. Up to three uploaded photos of the
container, newest first, no damage photos. Cap 200 per move in
moves/{moveId}/usage/furnitureEstimates, counted before the call. Reply JSON:
name, widthIn, depthIn, heightIn, weightLb, weightLowLb, weightHighLb, scale
tape|surroundings|none, note. Empty name means no furniture. Writes nothing;
returns { estimate } or { skipped }.

=== 3. Repositories ===

setContainerDimensions(container, dims | null): dims set size other and
volumeCuFt = cuFtOf; null deletes dimensionsIn and keeps cu ft.

=== 4. UI ===

PhotoEstimate component: needs an uploaded photo and a connection; shows the
estimate as a guess with Use these and Not this. Add furniture: the component
(when aiEnabled), three inch fields that set cu ft and scale the preset
weight until a weight is typed; partial sets refuse the save. Box detail on a
piece: the component and the fields, saved on blur once all three are in; Use
these is one saveContainer write with the weight marked as a guess.

=== 5. Export ===

Trailing column dimensions_in, "WxDxH".

=== 6. Verify ===

npm run verify, npm run build, functions typecheck. No rules change: the
usage doc is written by the function only, and the default deny covers it.
Deploy the function from the desktop: firebase deploy --only functions.
