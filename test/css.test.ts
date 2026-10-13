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

/**
 * Nothing on a surface ramps from one colour to another.
 *
 * HEXHOLD is leaded glass: a piece is one flat colour from edge to edge, and
 * the only way light changes across a window is by changing to a different
 * piece. That is the whole art direction, and it is a rule a stylesheet can be
 * held to — "it still looks so flat and bad, take away the gradients" was the
 * review of a build in which I had already removed most of them, because the
 * ones left over were the big surfaces: the cloth, the rail, the plate fill,
 * the card face, the chips.
 *
 * So: a gradient may not interpolate between two OPAQUE colours at different
 * positions. Which leaves, deliberately, everything a gradient is legitimately
 * for in a flat design:
 *
 *   - a hard stop (two colours at the same position) — a progress bar, a
 *     facet, two pieces of glass meeting;
 *   - a stripe plate (`repeating-linear-gradient` of a colour and
 *     `transparent`) — the grain, the weave, a hatch;
 *   - a fade to `transparent` or an `rgba()` — a shadow, a vignette, a glow.
 *     Glow is reserved for magic in this game, and magic is allowed to glow;
 *   - `linear-gradient(x, x)` of a single colour — a solid slab at an exact
 *     size, which is how a 14px registration tick is drawn without a box;
 *   - anything inside a `mask`, which is geometry, not colour.
 */

/** Split a comma list at top level, ignoring commas inside parens. */
function topLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim());
}

/** The colour at the head of a stop, and whatever position follows it. */
function stop(arg: string): { colour: string; pos: string } | null {
  const m = /^(var|rgba?|hsla?|color-mix|oklch|lab)\s*\(/i.exec(arg);
  if (m) {
    let depth = 0;
    for (let i = m[0].length - 1; i < arg.length; i++) {
      if (arg[i] === '(') depth++;
      else if (arg[i] === ')' && --depth === 0) {
        return { colour: arg.slice(0, i + 1).replace(/\s+/g, ''), pos: arg.slice(i + 1).trim() };
      }
    }
    return null;
  }
  const w = /^(\S+)\s*(.*)$/.exec(arg);
  return w ? { colour: w[1].toLowerCase(), pos: w[2].trim() } : null;
}

/**
 * A stop that carries alpha anywhere in it is a fade, and a fade is a shadow,
 * a vignette or a glow rather than a surface. `color-mix(… , transparent)` and
 * `var(--x, rgba(…))` both land here, which is why this looks at the whole
 * expression rather than its head.
 */
/**
 * The position tokens of a stop, split at top level — a position may itself be
 * a `var(--pct, 0%)` with a comma and a space inside it.
 */
function positions(pos: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of pos) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const SEE_THROUGH = /transparent|rgba\(|hsla\(|#[0-9a-f]{8}\b|#[0-9a-f]{4}\b/i;

/** The leading argument of a gradient is its geometry, not a colour. */
const GEOMETRY = /^(to\b|at\b|circle\b|ellipse\b|in\b|from\b|closest-|farthest-|-?[\d.]+(deg|turn|rad|grad)\b|[\d.]+(%|px|em|rem|vh|vw)\s)/i;

test('no surface ramps from one opaque colour to another', async () => {
  const bad: string[] = [];
  for (const f of await stylesheets('src')) {
    const css = code(readFileSync(f, 'utf8'));
    for (const decl of css.split(';')) {
      // Masks are geometry. So is anything a shader draws.
      if (/(-webkit-)?mask(-image)?\s*:/.test(decl)) continue;
      for (const g of decl.matchAll(/(repeating-)?(linear|radial|conic)-gradient\s*\(/g)) {
        if (g[1]) continue; // a repeating stripe plate is flat by construction
        const open = g.index! + g[0].length;
        let depth = 1;
        let i = open;
        for (; i < decl.length && depth > 0; i++) {
          if (decl[i] === '(') depth++;
          else if (decl[i] === ')') depth--;
        }
        const args = topLevel(decl.slice(open, i - 1));
        if (args.length && GEOMETRY.test(args[0])) args.shift();
        const stops = args
          .map(stop)
          .filter((s): s is { colour: string; pos: string } => !!s);
        const opaque = stops.filter((s) => !SEE_THROUGH.test(s.colour));
        for (let k = 1; k < opaque.length; k++) {
          const a = opaque[k - 1];
          const b = opaque[k];
          if (a.colour === b.colour) continue;          // a solid slab
          // A hard stop: where one piece ends is exactly where the next
          // begins, so nothing is interpolated between them. Written either as
          // two stops at the same position, or — the clearer form — as a stop
          // given a span of its own (`var(--ruin) 0deg 60deg`).
          const ends = positions(a.pos).pop();
          const starts = positions(b.pos)[0];
          if (ends && ends === starts) continue;
          bad.push(`${f}: ${a.colour} ${a.pos} -> ${b.colour} ${b.pos}`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], `gradients that ramp between opaque colours:\n  ${bad.join('\n  ')}`);
});

test('the shader does not ramp either', () => {
  // The sky is quantised to a fixed number of levels for exactly the same
  // reason the stylesheets are: a smoothly shaded backdrop behind a table made
  // of flat pieces is the thing that gives the whole screen away as rendered.
  const src = readFileSync(new URL('../src/vfx/Backdrop.tsx', import.meta.url), 'utf8');
  assert.match(src, /LEVELS\s*=\s*[\d.]+/, 'the backdrop no longer posterises');
  assert.match(src, /floor\(.*LEVELS/, 'the backdrop no longer snaps colour to levels');
});
