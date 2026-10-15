/**
 * The art direction, as assertions.
 *
 * `npm run style` walks the rendered page, which is the only way to catch a
 * colour that two stylesheets fight over or a radius that comes out of a
 * `calc`. It also needs a browser, a served client and ninety seconds, so
 * nobody runs it on every commit — and the defect it found was not a subtle
 * one. It was two complete art directions live in the same file, two hundred
 * painted colours off the palette, sixty-seven Gaussian glows and thirty-nine
 * half-pixel corners, all of which had been there for weeks.
 *
 * These are the same rules, declared statically, so they fail in four
 * milliseconds inside `npm test` instead. A rule that is only checked by a
 * harness someone has to remember to run is a rule that is already broken.
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
/** Blank out comments without moving anything: line numbers stay true. */
const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
const lineOf = (s: string, i: number): number => s.slice(0, i).split('\n').length;

/** The fourteen, the four additions, and the interpolated ladder rungs. */
const PALETTE = new Set([
  '#0d0a14', '#14102b', '#2b2266', '#5b2a86', '#c2185b', '#ff4fa3', '#00e5ff',
  '#1fa3a3', '#ffd23f', '#ff8c1a', '#e5261e', '#c98a3e', '#a86a2a', '#e8b064',
  '#f4f1e8',
  '#c2bedb', '#9f9ac4', '#4ee08a', '#c21e18',
  '#100c20', '#1d1744', '#3a2d85', '#5c3a16',
]);

test('every colour in the app is on the palette', async () => {
  /* `shared/` and `server/` too. Six of the colours this audit found were not
     in a stylesheet at all — `shared/sigils.ts` is the canonical school table
     and the CSS tokens were only ever a copy of it, so a check that looked at
     `src/` alone would have called the game clean while the menu's coven
     glyphs were still painting the palette before last. */
  const files = [
    ...await walk('src', ['.css', '.ts', '.tsx']),
    ...await walk('shared', ['.ts']),
    ...await walk('server', ['.ts']),
  ];
  const bad: string[] = [];
  for (const f of files) {
    // tokens.css is where the palette is DECLARED; everything else refers to it
    if (f.endsWith('tokens.css')) continue;
    const s = strip(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      if (!PALETTE.has(m[0].toLowerCase())) bad.push(`${f}:${lineOf(s, m.index)} ${m[0]}`);
    }
    /* The same colours in the other notation.
       `#f0c465` and `rgba(240, 196, 101, 0.4)` are one off-palette gold, and
       the first version of this check only knew about the `#` — so it passed
       a stylesheet carrying 260 of them, including fifty-two whites,
       forty-four blacks and the whole of the palette before last. A scrim is
       `--ink` at an alpha and a highlight is `--bone` at one; neither is a
       number typed into a shadow. `crt.css` is exempt because its aperture
       grille is three deliberately tinted inks standing in for a phosphor
       triad. */
    if (!f.endsWith('crt.css')) {
      for (const m of s.matchAll(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*[,)]/g)) {
        bad.push(`${f}:${lineOf(s, m.index)} ${m[0]}... — use color-mix(in srgb, var(--token) N%, transparent)`);
      }
      /* And the three-digit form. `#fff` and `#000` are not on the fourteen
         either, and `color-mix(var(--veil) 45%, #fff)` is a ramp toward a
         colour the palette does not contain. A MASK is exempt: only its alpha
         is ever sampled, so `linear-gradient(#000 0 0)` is a stencil and not
         a colour at all. */
      for (const m of s.matchAll(/#[0-9a-fA-F]{3}\b/g)) {
        const decl = s.lastIndexOf(';', m.index) + 1;
        if (/mask/.test(s.slice(decl, m.index))) continue;
        bad.push(`${f}:${lineOf(s, m.index)} ${m[0]}`);
      }
    }
  }
  assert.deepEqual(bad, [], `\noff-palette colours:\n${bad.join('\n')}\n`);
});

test('nothing is blurred', async () => {
  const files = await walk('src', ['.css']);
  const bad: string[] = [];
  for (const f of files) {
    const s = strip(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/(?:^|[\s:(])blur\(/g)) bad.push(`${f}:${lineOf(s, m.index)}`);
  }
  assert.deepEqual(bad, [], `\nblur is not in this style:\n${bad.join('\n')}\n`);
});

/**
 * A shadow is a hard offset silhouette. The third length in a shadow is its
 * blur, and the only legal value is zero — including inside a `drop-shadow()`,
 * which is where the glows hid from the first version of this check.
 */
test('no shadow has a blur radius', async () => {
  const files = await walk('src', ['.css']);
  const LEN = String.raw`(?:-?[\d.]+(?:px|em|rem)|0)`;
  const three = new RegExp(`^\\s*${LEN}\\s+${LEN}\\s+(-?[\\d.]+)(?:px|em|rem)`);
  const bad: string[] = [];
  for (const f of files) {
    const s = strip(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/(?:box-shadow|text-shadow)\s*:\s*([^;}]+)/g)) {
      for (const part of splitTop(m[1])) {
        if (/inset/.test(part)) continue;
        const hit = three.exec(part.replace(/\b(?:rgba?|hsla?|color-mix|color|var)\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' C '));
        if (hit && Number(hit[1]) > 0) bad.push(`${f}:${lineOf(s, m.index)} ${part.trim().slice(0, 48)}`);
      }
    }
    for (const m of s.matchAll(/drop-shadow\(\s*(-?[\d.]+)(?:px|em|rem)?\s+(-?[\d.]+)(?:px|em|rem)?\s+(-?[\d.]+)(?:px|em|rem)/g)) {
      if (Number(m[3]) > 0) bad.push(`${f}:${lineOf(s, m.index)} ${m[0].slice(0, 48)}`);
    }
    // a two-value drop-shadow is offset only; a one-value one cannot exist
    for (const m of s.matchAll(/drop-shadow\(\s*0\s+0\s+(-?[\d.]+)(?:px|em|rem)/g)) {
      if (Number(m[1]) > 0) bad.push(`${f}:${lineOf(s, m.index)} ${m[0].slice(0, 48)}`);
    }
  }
  assert.deepEqual(bad, [], `\nblurred shadows (use --e-card / --halo-*):\n${bad.join('\n')}\n`);
});

/**
 * Every edge is a whole number of pixels.
 *
 * The outlines went onto the grid first and the INNER edges did not, because
 * they are written as `inset` box-shadows rather than as borders: seventeen
 * `inset 0 0 0 1px` rings and fourteen one-pixel bevels, which is the lit
 * edge just inside the ink line — the single most-repeated mark in this
 * style, drawn at a quarter of a pixel everywhere it appeared.
 *
 * `crt.css` is exempt. It is a sheet of glass in front of the game rather
 * than a thing drawn in it, and a real tube's vignette is soft because an
 * actual lens is.
 */
test('every edge and offset is a whole number of pixels', async () => {
  const files = (await walk('src', ['.css'])).filter((f) => !f.endsWith('crt.css'));
  const ok = new Set([0, 2, 4, 8, 12, 16]);
  const bad: string[] = [];
  for (const f of files) {
    const s = strip(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) {
      for (const part of splitTop(m[1])) {
        const masked = part.replace(/\b(?:rgba?|hsla?|color-mix|color|var|calc)\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' C ');
        for (const n of masked.matchAll(/(?<![\w.#-])(-?\d[\d.]*)px/g)) {
          if (!ok.has(Math.abs(Number(n[1])))) {
            bad.push(`${f}:${lineOf(s, m.index)} ${n[1]}px in ${part.trim().slice(0, 44)}`);
          }
        }
      }
    }
    for (const m of s.matchAll(/border(?:-(?:top|right|bottom|left))?(?:-width)?\s*:\s*([\d.]+)px/g)) {
      if (!ok.has(Number(m[1]))) bad.push(`${f}:${lineOf(s, m.index)} ${m[1]}px border`);
    }
  }
  assert.deepEqual(bad, [], `\nedges off the pixel grid:\n${bad.join('\n')}\n`);
});

/**
 * Anything snapped to a grid is snapped to THE grid.
 *
 * `round(<expr>, 2px)` looks like it is doing the right thing and is doing
 * half of it: the board slot, the sigil frame and the rail's minimum height
 * were all landing on even pixels rather than on art pixels, which is the
 * grid every other box, the scanlines and the dither all share.
 */
test('every round() snaps to the art pixel', async () => {
  const files = await walk('src', ['.css']);
  const bad: string[] = [];
  for (const f of files) {
    const s = strip(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/round\([^()]*(?:\([^()]*\)[^()]*)*,\s*([\d.]+)px\s*\)/g)) {
      if (Number(m[1]) !== 4) bad.push(`${f}:${lineOf(s, m.index)} round(..., ${m[1]}px)`);
    }
  }
  assert.deepEqual(bad, [], `\nsnapped to the wrong grid:\n${bad.join('\n')}\n`);
});

/** One art pixel is 4 CSS px, so a corner is 0, 4, 8 or 16 — never 2. */
test('every corner is on the art-pixel grid', async () => {
  const files = await walk('src', ['.css']);
  const ok = new Set([0, 4, 8, 16]);
  const bad: string[] = [];
  for (const f of files) {
    const s = strip(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/border-radius:\s*([^;}]+)/g)) {
      const v = m[1].trim();
      if (/%|inherit|var\(|calc\(|round\(/.test(v)) continue;
      for (const n of v.split(/[\s/]+/)) {
        const px = /^(-?[\d.]+)px$/.exec(n) ?? /^(0)$/.exec(n);
        if (px && !ok.has(Number(px[1]))) bad.push(`${f}:${lineOf(s, m.index)} ${v}`);
      }
    }
  }
  assert.deepEqual(bad, [], `\nradii off the 4px grid:\n${bad.join('\n')}\n`);
});

/**
 * Nothing ramps.
 *
 * A gradient stop with no position interpolates all the way to the next one,
 * so two positionless opaque stops in a row are a ramp through every value
 * between them — which in a fourteen-colour palette means a few hundred
 * colours that are not in it. Hard stops (`a 0 40%, b 40% 100%`) and fades to
 * `transparent` are both still fine, and both are still gradients.
 */
test('no gradient ramps between two opaque colours', async () => {
  const files = await walk('src', ['.css']);
  const bad: string[] = [];
  for (const f of files) {
    const s = strip(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/(?:linear|radial|conic)-gradient\(/g)) {
      const open = m.index + m[0].length - 1;
      let depth = 1; let j = open + 1;
      while (depth > 0 && j < s.length) {
        if (s[j] === '(') depth++;
        else if (s[j] === ')') depth--;
        j++;
      }
      const stops = splitTop(s.slice(open + 1, j - 1)).map((x) => x.trim()).filter(Boolean);
      let runs = 0;
      let prev = '';
      for (const stop of stops) {
        // a direction/shape keyword, not a stop
        if (/^(to |from |\d+deg|in |closest|farthest|circle|ellipse|at )/.test(stop)) { runs = 0; prev = ''; continue; }
        /* A stop that ends in a length or percentage has a POSITION, so it
           does not interpolate into the next one. `var(--pct, 0%)` is a
           position too — `.hh-range` fills its track with one. */
        const positioned = /(\d|\))\s*(%|px|em|rem|deg|turn)\s*$/.test(stop)
          || /\s(\d+%|\d+px)\s+(\d+%|\d+px)$/.test(stop)
          || /\s+var\([^()]*\)$/.test(stop);
        const clear = /transparent|\b0\s*\)\s*$|,\s*0\s*\)/.test(stop);
        /* Two stops of the SAME colour do not ramp — that is how you paint a
           flat 1px rule with a gradient, which is what the plate's corner
           ticks in base.css are. */
        const same = stop.trim() === prev;
        prev = stop.trim();
        runs = positioned || clear || same ? 0 : runs + 1;
        if (runs >= 2) { bad.push(`${f}:${lineOf(s, m.index)} ${stops.join(', ').slice(0, 70)}`); break; }
      }
    }
  }
  assert.deepEqual(bad, [], `\nramps:\n${bad.join('\n')}\n`);
});

/**
 * Press Start 2P is an 8-pixel bitmap face: at 16px each of its source pixels
 * is exactly two CSS pixels, at 12px it is one and a half. There is no way to
 * draw half a pixel, so every stem is anti-aliased into greys the palette does
 * not contain. It is only ever set through `--font-hud`, and `--font-hud` is
 * only ever set at `--fs-hud` or `--fs-hud-lg`.
 */
test('the arcade face is only set at a multiple of eight', async () => {
  const files = await walk('src', ['.css']);
  const bad: string[] = [];
  for (const f of files) {
    const s = strip(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/font-family:\s*var\(--font-hud\)[^}]*?font-size:\s*([^;}]+)/g)) {
      const v = m[1].trim();
      if (/var\(--fs-hud(-lg)?\)/.test(v)) continue;
      const px = /^([\d.]+)px$/.exec(v);
      if (!px || Number(px[1]) % 8 !== 0) bad.push(`${f}:${lineOf(s, m.index)} ${v}`);
    }
    if (/Press Start 2P/.test(s) && !f.endsWith('tokens.css') && !f.endsWith('fonts.css')) {
      bad.push(`${f}:${lineOf(s, s.indexOf('Press Start 2P'))} names the face directly — use var(--font-hud)`);
    }
  }
  assert.deepEqual(bad, [], `\narcade face off its grid:\n${bad.join('\n')}\n`);
});

/** Split on commas at paren depth zero. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0; let buf = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(buf); buf = ''; } else buf += ch;
  }
  out.push(buf);
  return out;
}
