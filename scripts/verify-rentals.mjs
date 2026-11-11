import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

// A syntax error in inline rental-page JS makes the entire house board appear empty.
const html = readFileSync("public/rentals/index.html", "utf8");
const scriptBlocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert(scriptBlocks.length > 0, "Rental board must contain executable JavaScript");
for (let i = 0; i < scriptBlocks.length; i += 1) {
  new Script(scriptBlocks[i][1], { filename: `rentals/index.html:inline-script-${i + 1}` });
}
assert(html.includes('id="homes"'), "Missing rental house card mount point");
assert(html.includes('id="fitChart"'), "Missing price-vs-rating chart mount point");
assert(html.includes('id="dateChart"'), "Missing timeline chart mount point");
assert(html.includes("sync(false)"), "Rental board must load listings.json on startup");

const data = JSON.parse(readFileSync("public/rentals/listings.json", "utf8"));
assert(Array.isArray(data.homes) && data.homes.length > 0, "Rental listings must be populated");
const ids = data.homes.map((home) => home.id);
assert(new Set(ids).size === ids.length, "Duplicate rental house ids");
for (const home of data.homes) {
  assert(home.name && home.city && home.url, `Incomplete rental entry: ${home.id}`);
}
console.log(`Rental page JavaScript parses; ${data.homes.length} unique houses can be loaded.`);
