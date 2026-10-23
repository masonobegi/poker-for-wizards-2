// Compare two fun:batch parts folders seed by seed, ignoring wall-clock and
// relic-firing counters. Usage: node samerun.cjs <dirA> <dirB>
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const load = (d) => {
  const m = new Map();
  for (const f of readdirSync(d)) for (const r of JSON.parse(readFileSync(join(d, f), 'utf8'))) m.set(r.seed, r);
  return m;
};
const a = load(process.argv[2]);
const b = load(process.argv[3]);
const IGNORE = new Set(['fires', 'stall', 'wallMs', 'engineMs']);
const strip = (r) => JSON.stringify(r, (k, v) => (IGNORE.has(k) ? undefined : v));
let same = 0;
const diff = [];
for (const [seed, r] of a) {
  const o = b.get(seed);
  if (o && strip(o) === strip(r)) same++;
  else diff.push(seed);
}
console.log(`${same} of ${a.size} runs identical; different: ${diff.join(', ') || 'none'}`);
if (diff.length) {
  const r = a.get(diff[0]); const o = b.get(diff[0]);
  for (const k of Object.keys(r)) if (JSON.stringify(r[k]) !== JSON.stringify(o?.[k]) && !IGNORE.has(k)) console.log(`  first difference in ${diff[0]}: ${k}`);
}
