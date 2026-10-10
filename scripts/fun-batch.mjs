#!/usr/bin/env node
/**
 * `npm run fun:batch -- [runs] [first-seed] [--out dir] [--jobs n] [fun.ts flags]`
 *
 * test/fun.ts plays whole solo runs on a simulated clock, one process at a
 * time, because the clock it mocks is process-wide. A useful sample is 70
 * runs or more (differences under ~5 points are noise below that), which is
 * too slow serially. This splits the seeds into chunks of 7 (one of each
 * coven, since covens rotate by seed), runs them in parallel, and prints the
 * merged report. Extra flags (--hex, --skill, --demo) go to every chunk.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const take = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const out = take('--out');
const jobs = Number(take('--jobs') ?? Math.max(1, cpus().length));
const positional = [];
while (args.length && !args[0].startsWith('--')) positional.push(args.shift());
const runs = Number(positional[0] ?? 70);
const first = Number(positional[1] ?? 0);
const passThrough = args;

const dir = out ? resolve(out) : mkdtempSync(join(tmpdir(), 'hexhold-fun-'));
mkdirSync(dir, { recursive: true });

const CHUNK = 7;
const chunks = [];
for (let s = first; s < first + runs; s += CHUNK) chunks.push([s, Math.min(CHUNK, first + runs - s)]);

const root = resolve(import.meta.dirname, '..');
const runChunk = ([seed, n], i) => new Promise((done, fail) => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'test/fun.ts', String(n), String(seed),
    '--json', join(dir, `part${i}.json`), ...passThrough], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`chunk ${seed}+${n} exited ${code}`))));
});

const started = Date.now();
let next = 0;
const worker = async () => {
  while (next < chunks.length) {
    const i = next++;
    await runChunk(chunks[i], i);
  }
};
await Promise.all(Array.from({ length: Math.min(jobs, chunks.length) }, worker));

const merge = spawn(process.execPath, ['--import', 'tsx', 'test/fun.ts', '--merge', dir, ...passThrough],
  { cwd: root, stdio: 'inherit' });
merge.on('exit', (code) => {
  console.log(`\n  ${runs} runs in ${((Date.now() - started) / 1000).toFixed(0)}s · parts in ${dir}`);
  process.exit(code ?? 1);
});
