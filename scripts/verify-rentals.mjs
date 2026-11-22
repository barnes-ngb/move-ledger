import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

// Syntax and required mounts: a malformed inline script can make the board disappear.
const html = readFileSync("public/rentals/index.html", "utf8");
const scriptBlocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert(scriptBlocks.length > 0, "Rental board must contain executable JavaScript");
for (let i = 0; i < scriptBlocks.length; i += 1) {
  new Script(scriptBlocks[i][1], { filename: "rentals/index.html:inline-script-" + (i + 1) });
}
for (const id of ["homes", "fitChart", "filterMode", "sortMode", "filterSearch", "onlyShelly", "poolOrigin", "news", "greenCount"]) {
  assert(html.includes('id="' + id + '"'), "Missing rental decision mount point: " + id);
}
assert(html.includes("sync(false)"), "Rental board must load listings.json on startup");
assert(html.includes('fetch("./travel.json'), "Rental board must load published driving baseline data");
assert(html.includes('scrollIntoView('), "Plot dots must jump to matching house cards");
assert(html.includes('href:"#house-"+h.id'), "Plot dots must target house card anchors");
assert(html.includes('function isGreen(h)'), "Green zone needs one explicit eligibility rule");
assert(!html.includes('id="dateChart"'), "Retired timeline chart should not clutter the streamlined board");

const data = JSON.parse(readFileSync("public/rentals/listings.json", "utf8"));
assert(Array.isArray(data.homes) && data.homes.length > 0, "Rental listings must be populated");
const ids = data.homes.map((home) => home.id);
assert(new Set(ids).size === ids.length, "Duplicate rental house IDs");
for (const home of data.homes) {
  assert(home.name && home.city && home.url, "Incomplete rental entry: " + home.id);
}

const matrix = JSON.parse(readFileSync("public/rentals/travel.json", "utf8"));
assert(matrix.destinations?.work?.address && matrix.destinations?.parents?.address,
  "Road comparison needs work and parents' destination addresses");
assert(matrix.destinations?.brick?.address, "Pool comparison needs a pool destination");
assert(matrix.method.toLowerCase().includes("no live traffic"),
  "Travel baseline must explicitly say it excludes live traffic");
for (const [id, routes] of Object.entries(matrix.homes || {})) {
  const home = data.homes.find((h) => h.id === id);
  assert(home, "Unknown house in travel baselines: " + id);
  assert(Number(home.rating) >= 4.2 && Number(home.rent) <= 2300,
    "Travel research should cover only green-zone rating/budget homes: " + id);
  assert(!home.petBlocked &&
    !["dog", "cat", "availability"].some((k) => home.readiness?.[k]?.status === "no"),
    "Known hard exclusion must not receive travel research: " + id);
  for (const destination of ["work", "parents"]) {
    assert(routes[destination]?.minutes > 0 && routes[destination]?.miles > 0,
      id + " missing " + destination + " car-route estimate");
  }
  assert(Array.isArray(routes.pools) && routes.pools.length > 0,
    id + " needs at least one indoor-pool candidate");
  for (const pool of routes.pools) {
    assert(matrix.destinations[pool.id]?.address, id + " unknown pool destination: " + pool.id);
    assert(pool.minutes > 0 && pool.miles > 0, id + " invalid pool-route estimate");
  }
}

const tourData = JSON.parse(readFileSync("public/rentals/tours.json", "utf8"));
const tours = (tourData.groups || []).flatMap((group) => group.entries || []);
assert(tours.length >= 6, "Tour tracker should include the current viewing leads");
assert(new Set(tours.map((t) => t.id)).size === tours.length, "Duplicate tour entry IDs");
assert(tours.filter((t) => t.status === "confirmed").length === 1,
  "Only the provider-confirmed Clarks Mill appointment should be marked confirmed");
assert(tours.find((t) => t.id === "clarks")?.status === "confirmed", "Clarks Mill must stay confirmed");
assert(tours.find((t) => t.id === "mcpherson")?.status === "code-received",
  "McPherson code receipt is not a provider-confirmed appointment");
assert(tours.find((t) => t.id === "bridgetown")?.status === "login",
  "Bridgetown booking needs login and provider confirmation");
assert(html.includes('id="tour-board"') && html.includes('href="#tour-board"'),
  "Tour tracker section and navigation link are required");
assert(html.includes('fetch("./tours.json'), "Rental board must load tours.json");
assert(!Object.keys(tourData).some((key) => /password|lockbox|licen[sc]e.*number/i.test(key)),
  "No personal secrets in tour data keys");
for (const t of tours) {
  assert(t.name && t.next && Array.isArray(t.actions), "Incomplete tour entry: " + t.id);
  assert(!t.accessCode && !t.password && !t.licenseNumber && !t.licensePhoto,
    "Private access data must not appear on the publicly shared rental board");
  for (const link of t.actions) {
    assert(/^(https:\/\/|mailto:|tel:|sms:)/.test(link.url), "Invalid tour action link for " + t.id);
  }
}

console.log("Rental board parses; " + data.homes.length + " unique houses and " +
  Object.keys(matrix.homes).length + " green-zone routing records checked.");
