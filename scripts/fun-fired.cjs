// Round 8: "a bought relic's rule visibly fired" with and without the new deal
// credits, and "a run owning a mythic", from a fun:batch parts folder.
// Run from the HEXHOLD repo: node --require tsx/cjs <this> <parts dir>
const { readFileSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { RELIC_BY_ID } = require(resolve('shared/relics.ts'));
const { COVENS } = require(resolve('shared/covens.ts'));
const dir = process.argv[2];
const runs = [];
for (const f of readdirSync(dir)) runs.push(...JSON.parse(readFileSync(join(dir, f), 'utf8')));
const covenRelic = new Set(COVENS.map((c) => c.relic).filter(Boolean));
const NEW = new Set(['gilt_edge', 'third_hand', 'unstable_isotope', 'wild_inheritance']);
const fired = (skip) => runs.filter((r) => Object.entries(r.fires ?? {}).some(([id, n]) =>
  n > 0 && !covenRelic.has(id) && !RELIC_BY_ID[id]?.coven && !skip.has(id))).length / runs.length;
const pct = (x) => `${Math.round(x * 100)}%`;
console.log(`runs ${runs.length}`);
console.log(`visibly fired: every line ${pct(fired(new Set()))}, without the round 8 deal credits ${pct(fired(NEW))}`);
const mythic = runs.filter((r) => (r.relics ?? []).some((id) => RELIC_BY_ID[id]?.rarity === 'mythic' && !RELIC_BY_ID[id]?.coven)).length;
console.log(`a run owning a mythic ${pct(mythic / runs.length)} (${mythic})`);
const notYours = runs.reduce((a, r) => {
  const t = r.time ?? {};
  const all = Object.values(t).reduce((x, y) => x + y, 0);
  const mine = (t['your turn'] ?? 0) + (t['market: you shopping'] ?? 0) + (t['your response window'] ?? 0);
  return a + (all ? 1 - mine / all : 0);
}, 0) / runs.length;
console.log(`share of the run that is not your decision ${pct(notYours)}`);
