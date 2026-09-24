/**
 * The mark set has to stay complete, and stay one hand.
 *
 * Every sigil, relic, omen and card mark is drawn in `src/art/marks.tsx`, and
 * anything without a drawing silently falls back to the Unicode character it
 * replaced. That fallback is deliberate — a new sigil should never render as
 * nothing — but it is also invisible in review: add a sigil, forget its mark,
 * and the card looks right on Windows and shows an empty box on a Steam Deck,
 * which is the exact failure the drawings exist to end.
 *
 * So the coverage is asserted rather than eyeballed. The rest of these are the
 * properties that make 100 separate drawings read as one set:
 *
 *   - nothing carries its own colour, so a mark takes the colour of whatever
 *     it sits in — a school accent, a rarity, a card mark's own hue;
 *   - nothing is drawn outside the 24-unit box, so a mark can never paint over
 *     its neighbour in a tight row like the relic chips on a seat;
 *   - an unknown id still renders its fallback, because the fallback is the
 *     thing that keeps a half-finished set from having holes in it.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { before, test } from 'node:test';

// Components import their own stylesheets; Node cannot load those.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    return next(spec, ctx);
  },
});

type Marks = typeof import('../src/art/marks');
type Kind = 'sigil' | 'relic' | 'omen' | 'card' | 'ui';

let art: Marks;
let render: (node: unknown) => string;
let React: typeof import('react');
let expected: Array<{ kind: Kind; id: string }>;

before(async () => {
  art = await import('../src/art/marks');
  React = await import('react');
  ({ renderToStaticMarkup: render } = (await import('react-dom/server')) as never);

  const { SIGILS } = await import('@shared/sigils');
  const { RELICS } = await import('@shared/relics');
  const { OMENS } = await import('@shared/omens');
  const { MARKS } = await import('@shared/cards');

  expected = [
    ...SIGILS.map((s) => ({ kind: 'sigil' as const, id: s.id })),
    ...RELICS.map((r) => ({ kind: 'relic' as const, id: r.id })),
    ...OMENS.map((o) => ({ kind: 'omen' as const, id: o.id })),
    ...Object.values(MARKS).map((m) => ({ kind: 'card' as const, id: m.id })),
    { kind: 'ui' as const, id: 'mana' },
    { kind: 'ui' as const, id: 'impossible' },
  ];
});

const draw = (kind: Kind, id: string): string =>
  render(React.createElement(art.Mark, { kind, id }));

test('every sigil, relic, omen and card mark is drawn', () => {
  const missing = expected.filter((e) => !art.hasMark(e.kind, e.id)).map((e) => `${e.kind}:${e.id}`);
  assert.deepEqual(
    missing,
    [],
    `\n${missing.length} of ${expected.length} fall back to a Unicode character, which is what tofus on Linux:\n  ${missing.join('\n  ')}\n`,
  );
});

test('a drawn mark actually renders an svg', () => {
  for (const { kind, id } of expected) {
    const html = draw(kind, id);
    assert.ok(html.startsWith('<svg'), `${kind}:${id} rendered ${html.slice(0, 40)}`);
    assert.ok(/<(path|circle|ellipse)/.test(html), `${kind}:${id} drew nothing`);
  }
});

test('no mark carries its own colour', () => {
  const problems: string[] = [];
  for (const { kind, id } of expected) {
    for (const m of draw(kind, id).matchAll(/(?:fill|stroke)="([^"]*)"/g)) {
      if (m[1] === 'none' || m[1] === 'currentColor') continue;
      problems.push(`${kind}:${id} paints with \`${m[1]}\` — a mark takes the colour of what it sits in.`);
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});

/** Every attribute of one rendered tag, as numbers where they are numbers. */
function attrs(tag: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) out[m[1]] = Number(m[2]);
  return out;
}

/**
 * The centre of an SVG elliptical arc, from its endpoint parameters.
 *
 * Straight out of the SVG implementation notes (F.6.5), with the x-axis
 * rotation left out because every arc in this set is unrotated. Radii are
 * scaled up when they are too small to join the two endpoints, which the spec
 * also requires and which happens here whenever a path is nudged.
 */
function arcCentre(
  x1: number, y1: number, x2: number, y2: number,
  rxIn: number, ryIn: number, large: number, sweep: number,
): { cx: number; cy: number; rx: number; ry: number } {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2 };
  }

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const lambda = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (lambda > 1) {
    const k = Math.sqrt(lambda);
    rx *= k;
    ry *= k;
  }

  const denom = rx * rx * dy * dy + ry * ry * dx * dx;
  const numer = Math.max(0, rx * rx * ry * ry - denom);
  const k = denom === 0 ? 0 : Math.sqrt(numer / denom) * (large !== sweep ? 1 : -1);

  return {
    cx: k * ((rx * dy) / ry) + (x1 + x2) / 2,
    cy: k * (-(ry * dx) / rx) + (y1 + y2) / 2,
    rx,
    ry,
  };
}

/**
 * Absolute bounds of an SVG path.
 *
 * The first version of this pulled every number out of the `d` string, which
 * is wrong twice over: relative commands (`h-9`, `c-2 -4.5 ...`) carry DELTAS
 * rather than positions, and an arc's `rx ry rot large sweep` are not
 * coordinates at all. It reported 58 of 100 marks as out of bounds and every
 * one of them was fine — a guard that cries wolf on more than half the set is
 * a guard somebody deletes. So this walks the path properly.
 *
 * Curve extrema are approximated by their control points, which can only ever
 * overstate the box — the safe direction for a test looking for a mark drawn
 * somewhere it should not be.
 */
function pathBounds(d: string): { lo: number; hi: number } {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+/g) ?? [];
  let i = 0;
  let x = 0, y = 0, sx = 0, sy = 0;
  let lo = Infinity, hi = -Infinity;
  const see = (...vs: number[]): void => {
    for (const v of vs) { if (v < lo) lo = v; if (v > hi) hi = v; }
  };
  const n = (): number => Number(tokens[i++]);

  let cmd = '';
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    // A repeated coordinate pair after M continues as an implicit lineto.
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    if (i > tokens.length) break;

    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;

    switch (cmd.toUpperCase()) {
      case 'M': x = ox + n(); y = oy + n(); sx = x; sy = y; see(x, y); break;
      case 'L': x = ox + n(); y = oy + n(); see(x, y); break;
      case 'H': x = ox + n(); see(x, y); break;
      case 'V': y = oy + n(); see(x, y); break;
      case 'C': {
        const ax = ox + n(), ay = oy + n(), bx = ox + n(), by = oy + n();
        x = ox + n(); y = oy + n();
        see(ax, ay, bx, by, x, y);
        break;
      }
      case 'S': case 'Q': {
        const ax = ox + n(), ay = oy + n();
        x = ox + n(); y = oy + n();
        see(ax, ay, x, y);
        break;
      }
      case 'T': x = ox + n(); y = oy + n(); see(x, y); break;
      case 'A': {
        const rx = n(), ry = n();
        n();                                 // x-axis rotation (0 throughout)
        const large = n(), sweep = n();
        const x0 = x, y0 = y;
        x = ox + n(); y = oy + n();
        if (large === 1) {
          // More than half the ellipse is swept, so the ellipse's own box is
          // a fair bound. (`endpoint +/- radius` was the first attempt and
          // was loose by a whole radius; it flagged ten placed marks.)
          const c = arcCentre(x0, y0, x, y, rx, ry, large, sweep);
          see(c.cx - c.rx, c.cx + c.rx, c.cy - c.ry, c.cy + c.ry);
        } else {
          // A minor arc never runs past its endpoints ALONG the chord, and
          // bulges off it by at most the sagitta. Two earlier versions got
          // this wrong in opposite directions: bounding by the whole ellipse
          // put Gloaming's crescent at x=32 (the ellipse it rides is mostly
          // somewhere else), and padding the chord's box in every direction
          // gave Decohere's vertical semicircle 14 units of vertical slack it
          // cannot use. The bulge is perpendicular to the chord, so it is
          // split between the axes by the chord's own direction.
          const r = Math.max(rx, ry);
          const dxc = x - x0;
          const dyc = y - y0;
          const len = Math.hypot(dxc, dyc);
          const half = len / 2;
          const bulge = r > half ? r - Math.sqrt(Math.max(0, r * r - half * half)) : r;
          const px = len === 0 ? r : (bulge * Math.abs(dyc)) / len;
          const py = len === 0 ? r : (bulge * Math.abs(dxc)) / len;
          see(Math.min(x0, x) - px, Math.max(x0, x) + px,
            Math.min(y0, y) - py, Math.max(y0, y) + py);
        }
        break;
      }
      case 'Z': x = sx; y = sy; break;
      default: i++; break;                    // unrecognised: step past it
    }
  }
  return { lo, hi };
}

test('nothing is drawn outside the 24-unit box', () => {
  // Stroke half-width is 0.8, so the usable span is 0.8..23.2. A mark that
  // reaches past the viewBox is clipped by some consumers and paints over its
  // neighbour in others — the relic chips on a seat sit a couple of px apart.
  const LOW = -0.6;
  const HIGH = 24.6;
  const problems: string[] = [];

  for (const { kind, id } of expected) {
    const html = draw(kind, id);
    let lo = Infinity;
    let hi = -Infinity;
    const see = (a: number, b: number): void => { lo = Math.min(lo, a); hi = Math.max(hi, b); };

    for (const m of html.matchAll(/<circle[^>]*>/g)) {
      const a = attrs(m[0]);
      if (Number.isFinite(a.cx) && Number.isFinite(a.r)) {
        see(Math.min(a.cx - a.r, a.cy - a.r), Math.max(a.cx + a.r, a.cy + a.r));
      }
    }
    for (const m of html.matchAll(/<ellipse[^>]*>/g)) {
      const a = attrs(m[0]);
      if (Number.isFinite(a.cx)) {
        see(Math.min(a.cx - a.rx, a.cy - a.ry), Math.max(a.cx + a.rx, a.cy + a.ry));
      }
    }
    for (const m of html.matchAll(/ d="([^"]+)"/g)) {
      const b = pathBounds(m[1]);
      if (Number.isFinite(b.lo)) see(b.lo, b.hi);
    }

    if (lo < LOW || hi > HIGH) {
      problems.push(`${kind}:${id} spans ${lo.toFixed(1)}..${hi.toFixed(1)} — outside the 24 box.`);
    }
  }

  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});

test('the path walker reads relative commands as deltas, not positions', () => {
  // The bug this file shipped with once. `h-9` from x=12 ends at 3, and a
  // walker that reads the -9 as a position reports the mark out of bounds.
  const b = pathBounds('M12 4h-9v6h9Z');
  assert.deepEqual([b.lo, b.hi], [3, 12]);
  // An arc's radii and flags are not coordinates.
  const arc = pathBounds('M12 5a7 7 0 1 0 7 7');
  assert.ok(arc.lo >= 0 && arc.hi <= 26, `arc bounds ${arc.lo}..${arc.hi}`);
});

test('an id with no drawing still renders its fallback rather than nothing', () => {
  const html = render(React.createElement(art.Mark, { kind: 'sigil', id: 'no_such_sigil', fallback: '✦' }));
  assert.ok(html.includes('✦'), `expected the fallback character; got ${html}`);
});
