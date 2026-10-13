import { memo } from 'react';
import { SCHOOLS } from '@shared/sigils';

/**
 * The table is a rose window, laid flat.
 *
 * Three versions of this file failed the same way, and it is worth writing
 * down why. The first was `ring(24)`, `ring(48)`, `ring(8)` — a loop, not a
 * drawing, and it read as generated because it was. The second scattered the
 * same marks off their ideal positions so a hand's error showed in them, which
 * helped and did not fix it. Both were gold scratched onto a surface, and the
 * surface underneath was a blue radial gradient. You can scratch as much gold
 * as you like onto a rendered-looking sheet; it stays a rendered-looking sheet.
 * "It's just a blue poker table" was the correct review.
 *
 * So the surface is the drawing now. There is no felt under this — this *is*
 * the table top, and it is one object with one idea: leaded glass.
 *
 * What that buys, and why it is the right idea for this game:
 *
 *   - **It cannot be a gradient.** Glass comes in pieces. A pane is one flat
 *     colour from edge to edge, and the only way light changes across a window
 *     is by changing to a different piece. That is a hard constraint, not a
 *     style, and it is the one this interface needed — every soft ramp in the
 *     old table was doing the work a line should have been doing.
 *   - **The black does the drawing.** Came is 4px of near-black around every
 *     single piece. It is the heaviest mark on the screen, it reads at a
 *     glance from across a room, and nothing else in a browser looks like it.
 *   - **It is already the game's subject.** A rose window is six orders
 *     radiating from a centre; HEXHOLD has six schools. The twelve lights of
 *     the first order are the six schools, each in its own glass, twice.
 *   - **It lets the cards win.** The centre light — the whole area the five
 *     community cards land on — is one unbroken piece of deep blue, so bone
 *     paper on top of it has nothing to compete with. All the colour lives out
 *     past where a card can reach.
 *
 * The light behind it is not steady: six pieces cycle between two flat values
 * on long, staggered, prime-ish periods, which is a window with weather behind
 * it. No piece ever fades through a middle value — it is one glass, then the
 * other.
 */

const CX = 500;
const CY = 300;

/** The orders, inner to outer. Each is an ellipse the glass is cut against. */
const R0 = { rx: 298, ry: 166 };  // the centre light — cards land here
const R1 = { rx: 382, ry: 213 };
const R2 = { rx: 462, ry: 258 };
/* Deliberately larger than the box it is drawn in. The aperture is an ellipse
   and this is a rectangle; anything short of overshooting leaves a bare wedge
   of nothing in each corner between the last piece of glass and the frame. */
const R3 = { rx: 580, ry: 352 };

const LEAD = '#080a1e';

/** A point on an ellipse at parametric angle `a`. */
const px = (r: { rx: number; ry: number }, a: number) => CX + Math.cos(a) * r.rx;
const py = (r: { rx: number; ry: number }, a: number) => CY + Math.sin(a) * r.ry;

/**
 * One piece of glass: the quadrilateral between two ellipses, bounded by two
 * radial cuts. The arcs are real elliptical arcs on the same ellipses the
 * endpoints came from, so neighbouring pieces share an edge exactly and the
 * came between them is one line rather than two nearly-coincident ones.
 */
function pane(inner: { rx: number; ry: number }, outer: { rx: number; ry: number }, a0: number, a1: number) {
  return [
    `M ${px(inner, a0).toFixed(2)} ${py(inner, a0).toFixed(2)}`,
    `L ${px(outer, a0).toFixed(2)} ${py(outer, a0).toFixed(2)}`,
    `A ${outer.rx} ${outer.ry} 0 0 1 ${px(outer, a1).toFixed(2)} ${py(outer, a1).toFixed(2)}`,
    `L ${px(inner, a1).toFixed(2)} ${py(inner, a1).toFixed(2)}`,
    `A ${inner.rx} ${inner.ry} 0 0 0 ${px(inner, a0).toFixed(2)} ${py(inner, a0).toFixed(2)}`,
    'Z',
  ].join(' ');
}

/** Cut an order into `n` pieces and hand each one back with its index. */
function order(inner: { rx: number; ry: number }, outer: { rx: number; ry: number }, n: number, offset = 0) {
  const step = (Math.PI * 2) / n;
  return Array.from({ length: n }, (_, i) => ({
    i,
    d: pane(inner, outer, offset + i * step, offset + (i + 1) * step),
    /* The middle of the piece, for anything painted on it. */
    mx: CX + Math.cos(offset + (i + 0.5) * step) * ((inner.rx + outer.rx) / 2),
    my: CY + Math.sin(offset + (i + 0.5) * step) * ((inner.ry + outer.ry) / 2),
    deg: ((offset + (i + 0.5) * step) * 180) / Math.PI + 90,
  }));
}

/**
 * The glass. Six school colours for the first order, then two blues alternating
 * outward, which is how a real window works: the figures are in the light, the
 * border course is quiet.
 *
 * Every one of these is a *deep* value. Glass in a window is seen against the
 * sky and still reads dark from inside the building — a pale pane here would
 * put a bright field directly behind a bone-white playing card.
 */
const SCHOOL_GLASS: Record<string, string> = {
  entropy: '#4b2592',
  veil:    '#13567f',
  chronos: '#8a5406',
  bind:    '#0d6353',
  ruin:    '#8a1b33',
  weave:   '#44661a',
};
const SCHOOL_ORDER = ['entropy', 'veil', 'chronos', 'bind', 'ruin', 'weave'] as const;

/* The second order and the border course. Two pieces side by side have to be
   TELLABLE APART or the came between them is drawing nothing — the first pass
   at this used two blues eleven points apart and the whole order read as one
   blue ring with scratches on it. */
const BLUE_A = '#2743ad';
const BLUE_B = '#101c5c';
const BORDER_A = '#0d1744';
const BORDER_B = '#213a9c';

const STAIN = '#e8b949';   // silver stain: the yellow a glazier fires into glass
const MOTTOES = SCHOOL_ORDER.map((s) => SCHOOLS[s].motto.replace(/\.$/, ''));

function FeltArcanaBase() {
  /* Rotated a half-step so no cut line runs straight up the middle of the
     table, where the board sits. */
  const half = Math.PI / 12;
  const first = order(R0, R1, 12, -Math.PI / 2 + half);
  const second = order(R1, R2, 24, -Math.PI / 2);
  const course = order(R2, R3, 40, -Math.PI / 2);

  return (
    <svg
      className="felt-arcana"
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        {/* The inscription runs round the BORDER COURSE, outside the second
            order, which is where a window carries one — set across the figures
            it reads as a caption over a picture. Both halves, because one path
            round the whole window prints the bottom half upside down. */}
        <path id="hx-rose-top" fill="none" d="M 2,300 A 498,291 0 0,1 998,300" />
        <path id="hx-rose-bot" fill="none" d="M 6,300 A 494,288 0 0,0 994,300" />
      </defs>

      {/* --- the glass ------------------------------------------------------
          Painted first, all of it, with no stroke. The came goes on top as one
          pass so that a line is never half-covered by the next piece. */}
      <g className="rose-glass">
        <ellipse cx={CX} cy={CY} rx={R0.rx} ry={R0.ry} fill="#101d5e" />
        {first.map((p) => (
          <path
            key={`a${p.i}`}
            d={p.d}
            fill={SCHOOL_GLASS[SCHOOL_ORDER[p.i % 6]]}
            /* Six of the twelve breathe, on three different periods, so the
               window never pulses as one thing. */
            className={p.i % 2 === 0 ? `rose-lit rose-lit--${(p.i / 2) % 3}` : undefined}
          />
        ))}
        {second.map((p) => (
          <path key={`b${p.i}`} d={p.d} fill={p.i % 2 ? BLUE_A : BLUE_B} />
        ))}
        {course.map((p) => (
          <path key={`c${p.i}`} d={p.d} fill={p.i % 2 ? BORDER_A : BORDER_B} />
        ))}
      </g>

      {/* --- painted detail -------------------------------------------------
          Black enamel, fired onto the glass before the window is leaded. A
          plain trefoil in each of the twelve lights, and the six schools'
          mottos round the border in silver stain. This is the layer that makes
          it a window somebody made rather than a pattern somebody tiled. */}
      <g className="rose-paint" fill="none" stroke={LEAD} strokeWidth="2.5">
        {first.map((p) => (
          <g key={`p${p.i}`} transform={`translate(${p.mx.toFixed(1)} ${p.my.toFixed(1)}) rotate(${p.deg.toFixed(1)})`}>
            <circle cx="0" cy="-8" r="8.5" vectorEffect="non-scaling-stroke" />
            <circle cx="-8" cy="6" r="8.5" vectorEffect="non-scaling-stroke" />
            <circle cx="8" cy="6" r="8.5" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </g>

      {/* --- the came -------------------------------------------------------
          Near-black, constant width whatever the table is stretched to
          (`non-scaling-stroke` — the window is drawn into an ellipse that is
          much wider than it is tall, and a scaled stroke would come out thin
          at the sides and fat at the top). The orders are drawn heavier than
          the cuts between pieces, the way the structural lead in a window is
          heavier than the glazing bars. */}
      <g fill="none" stroke={LEAD} strokeLinecap="round">
        <g strokeWidth="3.5">
          {first.map((p) => <path key={`la${p.i}`} d={p.d} vectorEffect="non-scaling-stroke" />)}
          {second.map((p) => <path key={`lb${p.i}`} d={p.d} vectorEffect="non-scaling-stroke" />)}
          {course.map((p) => <path key={`lc${p.i}`} d={p.d} vectorEffect="non-scaling-stroke" />)}
        </g>
        <g strokeWidth="7">
          <ellipse cx={CX} cy={CY} rx={R0.rx} ry={R0.ry} vectorEffect="non-scaling-stroke" />
          <ellipse cx={CX} cy={CY} rx={R1.rx} ry={R1.ry} vectorEffect="non-scaling-stroke" />
          <ellipse cx={CX} cy={CY} rx={R2.rx} ry={R2.ry} vectorEffect="non-scaling-stroke" />
        </g>
      </g>

      {/* --- the stain ------------------------------------------------------
          Everything gold. A hairline inside the first order so the centre
          light has an edge of its own, the inscription, and a bead of solder
          at each junction of the second order — which is the one detail that
          says metal rather than paint. */}
      <g>
        <ellipse
          cx={CX} cy={CY} rx={R0.rx - 7} ry={R0.ry - 5}
          fill="none" stroke={STAIN} strokeWidth="2" opacity="0.55"
          vectorEffect="non-scaling-stroke"
        />
        <text className="felt-arcana__band" fill={STAIN} fontSize="14" letterSpacing="2.4" opacity="0.8">
          <textPath href="#hx-rose-top" startOffset="50%" textAnchor="middle">
            {MOTTOES.slice(0, 3).join('  ·  ')}
          </textPath>
        </text>
        <text className="felt-arcana__band" fill={STAIN} fontSize="14" letterSpacing="2.4" opacity="0.8">
          <textPath href="#hx-rose-bot" startOffset="50%" textAnchor="middle">
            {MOTTOES.slice(3).join('  ·  ')}
          </textPath>
        </text>
        {second.map((p) => (
          <circle
            key={`s${p.i}`}
            cx={px(R1, -Math.PI / 2 + (p.i * Math.PI * 2) / 24).toFixed(2)}
            cy={py(R1, -Math.PI / 2 + (p.i * Math.PI * 2) / 24).toFixed(2)}
            r="3.6"
            fill={STAIN}
            opacity="0.62"
          />
        ))}
      </g>

      {/* The glazier's mark, scratched into one piece of the border course.
          Every window has one somewhere nobody looks. */}
      <g
        transform="translate(196 446) rotate(-16)"
        fill="none"
        stroke={STAIN}
        strokeWidth="1.2"
        opacity="0.42"
        vectorEffect="non-scaling-stroke"
      >
        <path d="M -8 -6 L -8 6 M -8 0 L 8 0 M 8 -6 L 8 6" vectorEffect="non-scaling-stroke" />
        <circle cx="0" cy="0" r="12" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

export const FeltArcana = memo(FeltArcanaBase);
