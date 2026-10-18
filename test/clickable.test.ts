/**
 * A thing that looks clickable has to be clickable.
 *
 * The deck was given a hit area, an aria-label, a focus ring, a hover lift
 * and a panel full of writing, and it could not be clicked at all. `.deck`
 * carries `pointer-events: none` — deliberately, so a card flying over the
 * stack it was dealt from is not swallowed on its way to the board — and the
 * button inside it inherited that and ate every click. Nothing failed. The
 * element was in the DOM, visible, the right size, in the right place, with
 * `cursor: pointer` under the mouse. It just did not do anything, twice, in
 * two rounds of "you still can't click the omens / the deck".
 *
 * That shape of bug is findable from the stylesheet alone: a rule that paints
 * something as interactive, nested by name inside a rule that takes no
 * pointer events, and never opting back in. The naming convention is the
 * whole trick — `.deck-hit` lives inside `.deck` — and it is the convention
 * this codebase already uses everywhere.
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

interface Seen {
  /** Classes that refuse pointer events, and the file that said so. */
  deaf: Map<string, string>;
  /** Classes that explicitly take them back. */
  live: Set<string>;
  /** Classes drawn as interactive, and the file that drew them. */
  hot: Map<string, string>;
}

function scan(files: string[]): Seen {
  const seen: Seen = { deaf: new Map(), live: new Set(), hot: new Map() };
  for (const f of files) {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // Innermost blocks only, which is exactly the set of real rules: an
    // @media wrapper never matches because its body still has braces in it.
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].split('\n').filter((l) => !l.trim().startsWith('@')).join(' ');
      // A pseudo-element is not the element: `.menu::after` saying it takes
      // no pointer events says nothing at all about `.menu`.
      if (sel.includes('::')) continue;
      const body = m[2];
      const deaf = /pointer-events:\s*none/.test(body);
      const live = /pointer-events:\s*(auto|all)/.test(body);
      const hot = /cursor:\s*pointer/.test(body);
      if (!deaf && !live && !hot) continue;
      for (const c of sel.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
        const k = `.${c[1]}`;
        if (deaf) seen.deaf.set(k, f);
        if (live) seen.live.add(k);
        if (hot) seen.hot.set(k, f);
      }
    }
  }
  return seen;
}

/** The nearest ancestor by naming — `.deck-hit` is inside `.deck`. */
function deafAncestor(cls: string, deaf: Map<string, string>): string | null {
  const parts = cls.slice(1).split('-');
  for (let i = parts.length - 1; i >= 1; i--) {
    const anc = `.${parts.slice(0, i).join('-')}`;
    if (deaf.has(anc)) return anc;
  }
  return null;
}

test('nothing is painted as clickable inside something that eats clicks', async () => {
  const seen = scan(await stylesheets('src'));
  assert.ok(seen.hot.size > 10, `expected plenty of interactive rules, found ${seen.hot.size}`);

  const broken: string[] = [];
  for (const [cls, file] of seen.hot) {
    if (seen.live.has(cls)) continue;
    const anc = deafAncestor(cls, seen.deaf);
    if (anc) broken.push(`${file}: ${cls} has cursor:pointer inside ${anc}, which sets pointer-events:none — add pointer-events:auto`);
  }
  assert.deepEqual(broken, [], `\n${broken.join('\n')}\n`);
});

test('the deck is one of them, because it was the one that broke', async () => {
  const seen = scan(await stylesheets('src'));
  assert.ok(seen.hot.has('.deck-hit'), 'the deck lost its hit area');
  assert.ok(seen.deaf.has('.deck'), 'the deck stopped letting cards fly over it');
  assert.ok(seen.live.has('.deck-hit'), 'the deck cannot be clicked again');
});
