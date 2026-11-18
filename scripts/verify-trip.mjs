import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const html = readFileSync("public/trip/index.html", "utf8");
const scriptBlocks = [...html.matchAll(/<script(\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)]
  .filter((match) => !match[1]?.includes("application/json"));
assert(scriptBlocks.length > 0, "Trip page needs executable JavaScript");
for (const [index, match] of scriptBlocks.entries()) {
  new Script(match[2], { filename: "trip/index.html:inline-script-" + (index + 1) });
}

for (const token of [
  'id="view-drive"',
  'id="view-pack"',
  'id="view-ready"',
  'id="departSegments"',
  'id="branch"',
  'id="fullRoute"',
  "Buc-ee",
  "15901 N Freeway, Fort Worth, TX 76177",
  "11661 E 13th St N",
  "Chick-fil-A",
  "gluten-free",
  "move-ledger.web.app/trip/",
  "dep+690",
  "dep+615",
  "navigator.clipboard.writeText",
  'name="robots"',
]) {
  assert(html.includes(token), "Trip page is missing: " + token);
}
assert(!html.includes("1801 W Lake Shore Dr"), "Public page must omit the private destination address");
assert(!html.includes("Shelly.Barnes7@gmail.com"), "Public page must omit private contact details");
assert(!html.includes("firebase/auth") && !html.includes("firestore"),
  "Public page must not require Firebase auth or reach Firestore");

const viteConfig = readFileSync("vite.config.ts", "utf8");
assert(viteConfig.includes('/^\\/trip(?:\\/|$)/'),
  "Service-worker navigation fallback must exclude the public trip route");
assert(viteConfig.includes('/^\\/rentals(?:\\/|$)/'),
  "Service-worker navigation fallback must preserve the existing public rentals route");

console.log("Public trip page parses, displays both food stops, and stays outside auth routing.");
