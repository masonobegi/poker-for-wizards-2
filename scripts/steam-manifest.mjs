/**
 * Emits the achievement definitions in the shapes Steamworks wants.
 *
 * The partner site takes them one at a time through a web form, which is a
 * transcription error waiting to happen across twenty entries. This prints
 * both a readable table to check against and a JSON file to paste from, all
 * generated from `shared/achievements.ts` so the game and the store can never
 * disagree about what an achievement is called.
 *
 * Run: npm run steam:manifest
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ACHIEVEMENTS, steamManifest } from '../shared/achievements.ts';

const out = path.resolve('steam');
mkdirSync(out, { recursive: true });

const manifest = steamManifest();
writeFileSync(path.join(out, 'achievements.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// Steam's stats editor also accepts a VDF-ish block; emit it for convenience.
const vdf = [
  '"stats"',
  '{',
  ...manifest.flatMap((a, i) => [
    `\t"${i + 1}"`,
    '\t{',
    '\t\t"bits"',
    '\t\t{',
    '\t\t\t"0"',
    '\t\t\t{',
    `\t\t\t\t"name"\t\t"${a.name}"`,
    `\t\t\t\t"display"`,
    '\t\t\t\t{',
    `\t\t\t\t\t"name"\t\t"${a.displayName}"`,
    `\t\t\t\t\t"desc"\t\t"${a.description.replace(/"/g, "'")}"`,
    `\t\t\t\t\t"hidden"\t"${a.hidden}"`,
    '\t\t\t\t}',
    '\t\t\t}',
    '\t\t}',
    '\t\t"type"\t\t"4"',
    '\t}',
  ]),
  '}',
].join('\n');
writeFileSync(path.join(out, 'achievements.vdf'), `${vdf}\n`);

console.log(`\n  ${manifest.length} achievements\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(`  ${pad('API NAME', 22)}${pad('DISPLAY', 26)}HIDDEN`);
console.log(`  ${'-'.repeat(60)}`);
for (const a of ACHIEVEMENTS) {
  console.log(`  ${pad(a.api, 22)}${pad(a.name, 26)}${a.hidden ? 'yes' : ''}`);
}
console.log(`\n  wrote steam/achievements.json and steam/achievements.vdf\n`);
