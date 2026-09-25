/**
 * Every stylesheet parses.
 *
 * CSS fails silently and catastrophically. A single unclosed brace does not
 * throw, does not fail a typecheck, does not fail a unit test and does not
 * fail a build — the browser simply swallows every rule after it into the
 * unterminated block and carries on.
 *
 * This is not hypothetical. Resolving a merge by splicing hunks together
 * dropped the closing brace of `@keyframes sigil-pop` in `table.css` and of
 * `.menu-covenrecord` in `menu.css`. The visible result was that the sigil
 * tooltip lost `position: absolute` — along with every other rule in the rest
 * of the file — so a tooltip that should have been out of flow became 261px
 * of layout inside each spell card, the rail grew to 527px, and the felt it
 * was squeezing collapsed from a table to a 20px sliver. The tests passed.
 * The build passed. The typecheck passed. It took a browser harness and an
 * hour to find two missing characters.
 *
 * A brace count is a crude check and it would have caught both instantly.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function stylesheets(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await stylesheets(p));
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

/** Strip comments and quoted strings, both of which may contain braces. */
function code(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

test('every stylesheet has balanced braces', async () => {
  const files = await stylesheets('src');
  assert.ok(files.length > 5, `expected to find stylesheets, found ${files.length}`);

  const broken: string[] = [];
  for (const f of files) {
    const s = code(readFileSync(f, 'utf8'));
    const depth = (s.match(/\{/g) ?? []).length - (s.match(/\}/g) ?? []).length;
    if (depth !== 0) {
      broken.push(`${f}: ${depth > 0 ? `${depth} unclosed` : `${-depth} extra`} brace(s)`);
    }
  }
  assert.deepEqual(broken, [], `\n${broken.join('\n')}\n`);
});

test('no stylesheet closes a block it never opened', async () => {
  // A file can be balanced overall and still be wrong: `} .foo {` nests
  // everything after it one level too shallow, which silently reparents rules.
  const broken: string[] = [];
  for (const f of await stylesheets('src')) {
    const s = code(readFileSync(f, 'utf8'));
    let depth = 0;
    let line = 1;
    for (const ch of s) {
      if (ch === '\n') line++;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth < 0) { broken.push(`${f}:${line} closes a block that was never opened`); break; }
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('no merge conflict marker survives in any source file', async () => {
  // The other thing that silently ships from a bad merge.
  const dirs = ['src', 'server', 'shared', 'test'];
  const bad: string[] = [];
  for (const d of dirs) {
    const walk = async (dir: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { await walk(p); continue; }
        if (!/\.(ts|tsx|css|mjs|js)$/.test(e.name)) continue;
        if (p === 'test/css.test.ts') continue;
        const s = readFileSync(p, 'utf8');
        if (/^<{7} |^={7}$|^>{7} /m.test(s)) bad.push(p);
      }
    };
    await walk(d);
  }
  assert.deepEqual(bad, []);
});

test('nothing replaces the fill of a `.hx-plate`', async () => {
  // A plate's own background is its 42% gold rule; its `::before` is the dark
  // fill laid one pixel inside it. Any other `::before` rule that matches a
  // plated element at equal specificity and loads later replaces that fill —
  // which is exactly what the print-grain rule in ui.css did to the menu, the
  // Market and the stack panel: every one rendered as a slab of translucent
  // brass with bone text on mustard at under 2:1, while every computed style
  // looked plausible. A rule may target a plated class's `::before` only if
  // it names `.hx-plate` itself (to exclude it, or to extend it).
  const plated = new Set<string>();
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      for (const m of readFileSync(p, 'utf8').matchAll(/["'`]([^"'`\n]*\bhx-plate\b[^"'`\n]*)["'`]/g)) {
        for (const cls of m[1].split(/\s+/)) {
          if (/^[a-z][\w-]*$/.test(cls) && !cls.startsWith('hx-plate')) plated.add(cls);
        }
      }
    }
  };
  await walk('src');
  assert.ok(plated.has('menu-panel'), `expected to find plated classes, found ${[...plated].join(', ')}`);

  const bad: string[] = [];
  for (const f of await stylesheets('src')) {
    const s = code(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/([^{}]+)\{/g)) {
      for (const sel of m[1].split(',')) {
        const t = sel.trim();
        if (!/::?before\b/.test(t) || /hx-plate/.test(t)) continue;
        // The compound the pseudo-element hangs off — the element it paints on.
        const subject = t.split(/::?before/)[0].trim().split(/[\s>+~]+/).pop() ?? '';
        for (const cls of plated) {
          if (new RegExp(`\\.${cls}(?![\\w-])`).test(subject)) bad.push(`${f}: ${t}`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});
