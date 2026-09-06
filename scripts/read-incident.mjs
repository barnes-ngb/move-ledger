/**
 * Read-only diagnosis for the duplicate box number incident (APPLY-13 step 1).
 *
 * Prints, for one move, every container_created event whose
 * payload.sequenceNumber matches, every container_voided for the same
 * number, and the container documents that carry it. Nothing is written.
 *
 * Run from the desktop with a service account key for the project:
 *
 *   npm i --no-save firebase-admin
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\move-ledger-sa.json"
 *   node scripts/read-incident.mjs --move <moveId> --number 1
 *
 * Omit --move to list every move with its id and name first.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

const moveId = flag("move");
const number = Number(flag("number") ?? "1");

initializeApp({ credential: applicationDefault(), projectId: "move-ledger" });
const db = getFirestore();

if (!moveId) {
  const moves = await db.collection("moves").get();
  console.log("Moves:");
  for (const m of moves.docs) console.log(`  ${m.id}  ${m.get("name")}`);
  console.log("\nRe-run with --move <moveId>.");
  process.exit(0);
}

const move = db.collection("moves").doc(moveId);

console.log(`\nMembers of ${moveId}:`);
const members = await move.collection("members").get();
for (const m of members.docs) {
  const d = m.data();
  console.log(
    `  ${m.id}  uid=${d.uid}  ${d.displayName}  range ${d.numberRangeStart}-${d.numberRangeEnd}` +
      `  highestIssued=${d.highestIssued ?? "(absent)"}`
  );
}

console.log(`\nContainers with sequenceNumber ${number}:`);
const containers = await move.collection("containers").where("sequenceNumber", "==", number).get();
for (const c of containers.docs) {
  const d = c.data();
  console.log(
    `  ${c.id}\n    createdAt=${d.createdAt}  createdBy=${d.createdBy}  status=${d.status}` +
      `  title=${d.title ?? ""}  destinationZoneId=${d.destinationZoneId ?? ""}` +
      `\n    labelConfirmedAt=${d.labelConfirmedAt ?? "(absent)"}  voidedAt=${d.voidedAt ?? "(absent)"}  voidedBy=${d.voidedBy ?? "(absent)"}`
  );
}
const ids = new Set(containers.docs.map((c) => c.id));

console.log(`\nActivity mentioning number ${number} or those containers, in occurredAt order:`);
const activity = await move.collection("activity").orderBy("occurredAt").get();
for (const e of activity.docs) {
  const d = e.data();
  const hit = d.payload?.sequenceNumber === number || (d.containerId && ids.has(d.containerId));
  if (!hit) continue;
  console.log(`  ${d.occurredAt}  ${d.type.padEnd(19)}  actor=${d.actorId}  container=${d.containerId ?? ""}`);
}

console.log(`\nAll container_created events, in occurredAt order (to see the sequence around it):`);
for (const e of activity.docs) {
  const d = e.data();
  if (d.type !== "container_created") continue;
  console.log(`  ${d.occurredAt}  #${d.payload?.sequenceNumber}  actor=${d.actorId}  container=${d.containerId}`);
}
