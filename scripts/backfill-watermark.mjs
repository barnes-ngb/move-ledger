/**
 * One-off backfill for the number watermark (APPLY-13 step 2).
 *
 * Sets each member's `highestIssued` to the highest `sequenceNumber` inside
 * that member's range across ALL containers in the move, voided ones
 * included. A voided box keeps its number retired, so it counts. A member
 * whose stored watermark is already at or above the computed value is left
 * alone: the rules refuse a lower value and so does this script.
 *
 * Prints before and after for every member. Writes nothing without --write.
 *
 * Run from the desktop with a service account key for the project:
 *
 *   npm i --no-save firebase-admin
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\move-ledger-sa.json"
 *   node scripts/backfill-watermark.mjs                # dry run, every move
 *   node scripts/backfill-watermark.mjs --move <id>    # dry run, one move
 *   node scripts/backfill-watermark.mjs --write        # apply
 *
 * Order of operations for the rollout: run this first, then deploy the app
 * and the rules. The app copes without it, because an absent watermark reads
 * as 0 and the first reservation sets it, but until it has run the guard
 * against an empty containers list is the wait for the first snapshot alone.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const write = args.includes("--write");
const onlyMove = (() => {
  const i = args.indexOf("--move");
  return i === -1 ? undefined : args[i + 1];
})();

initializeApp({ credential: applicationDefault(), projectId: "move-ledger" });
const db = getFirestore();

const moves = onlyMove
  ? [await db.collection("moves").doc(onlyMove).get()].filter((m) => m.exists)
  : (await db.collection("moves").get()).docs;

if (moves.length === 0) {
  console.log(onlyMove ? `No move ${onlyMove}.` : "No moves.");
  process.exit(1);
}

console.log(write ? "WRITE MODE. Changes will be applied." : "Dry run. Nothing will be written; pass --write to apply.");

let planned = 0;
for (const move of moves) {
  console.log(`\nMove ${move.id}  ${move.get("name") ?? ""}`);
  const [members, containers] = await Promise.all([
    move.ref.collection("members").get(),
    move.ref.collection("containers").get(),
  ]);
  const numbers = containers.docs
    .map((c) => c.get("sequenceNumber"))
    .filter((n) => Number.isInteger(n));
  const voided = containers.docs.filter((c) => c.get("voidedAt") !== undefined).length;
  console.log(`  ${containers.size} containers, ${voided} of them voided, all counted.`);

  for (const member of members.docs) {
    const d = member.data();
    const start = d.numberRangeStart;
    const end = d.numberRangeEnd;
    const mine = numbers.filter((n) => n >= start && n <= end);
    const computed = mine.length === 0 ? 0 : Math.max(...mine);
    const before = Number.isInteger(d.highestIssued) ? d.highestIssued : undefined;
    const after = Math.max(before ?? 0, computed);
    const label = `${d.displayName} (${member.id}, range ${start}-${end})`;

    if (before === after) {
      console.log(`  ${label}: highestIssued ${before} already, unchanged.`);
      continue;
    }
    if (before !== undefined && before > computed) {
      console.log(`  ${label}: stored ${before} is above the containers' ${computed}; keeping ${before}.`);
      continue;
    }
    console.log(`  ${label}: highestIssued ${before ?? "(absent)"} -> ${after}`);
    planned += 1;
    if (write) {
      await member.ref.update({ highestIssued: after });
      console.log(`    written.`);
    }
  }
}

console.log(write ? `\nDone. ${planned} member document(s) written.` : `\n${planned} member document(s) would change. Re-run with --write to apply.`);
