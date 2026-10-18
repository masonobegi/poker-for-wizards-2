/**
 * Every custom property a stylesheet reads is one a stylesheet defines.
 *
 * `color: var(--text-1)` is not an error. It is not a warning. The property
 * is simply undefined, the declaration is dropped, and the element inherits
 * whatever it would have inherited — which is usually close enough to right
 * that nobody notices. Written twice in one day here: the showdown's hand
 * name and the rail's hand reading both asked for `--text-1`, a token this
 * palette has never had (it is `--text`), and both quietly kept the body
 * colour while claiming to be the brightest ink on the table.
 *
 * A `var()` with a fallback is fine — that is a deliberate default. This only
 * catches the ones with no fallback, which are the ones that fail silently.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function walk(dir: string, ext: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p, ext));
    else if (ext.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '');

function lineOf(s: string, i: number): number {
  return s.slice(0, i).split('\n').length;
}

test('no stylesheet reads a custom property nothing defines', async () => {
  const files = await walk('src', ['.css']);
  const defined = new Set<string>();
  // Components may also set one inline (style={{ '--school': ... }}).
  for (const f of await walk('src', ['.tsx', '.ts'])) {
    for (const m of readFileSync(f, 'utf8').matchAll(/['"`](--[a-zA-Z0-9-]+)['"`]\s*\]?\s*:/g)) {
      defined.add(m[1]);
    }
  }
  for (const f of files) {
    for (const m of strip(readFileSync(f, 'utf8')).matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);
  }

  const bad: string[] = [];
  for (const f of files) {
    const s = strip(readFileSync(f, 'utf8'));
    // var(--name) with no comma, i.e. no fallback to fall back to.
    for (const m of s.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)) {
      if (!defined.has(m[1])) bad.push(`${f}:${lineOf(s, m.index ?? 0)} var(${m[1]}) is never defined`);
    }
  }
  assert.deepEqual(bad, [], `\n${bad.join('\n')}\n`);
});
