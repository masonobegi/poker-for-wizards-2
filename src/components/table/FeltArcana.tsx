import { memo } from 'react';
import { SCHOOLS } from '@shared/sigils';

/**
 * The gold struck into the cloth.
 *
 * The first version of this was the most machine-made thing in the game: three
 * calls to a `ring(n, …)` helper that walked a circle in exact 1/24ths and
 * 1/48ths, every stroke the same width, every ellipse concentric to the pixel,
 * every glyph an abstract tick. It read as generated because it was generated
 * — a loop, not a drawing — and adding more gold to it only made the loop
 * louder.
 *
 * What a person's hand leaves behind, and what this now does:
 *
 *   - **Nothing is evenly spaced.** Every element is pushed off its ideal
 *     position by a seeded jitter — a few units along the arc, a degree or two
 *     of rotation, a little scale. A hand aiming for regular never gets it.
 *   - **No two strokes weigh the same.** Widths and alphas vary per element,
 *     the way pressure varies.
 *   - **The rings do not share a centre.** Each is nudged, as if struck from
 *     slightly different settings.
 *   - **It says something.** The band is not abstract runes, it is the six
 *     schools' own mottos, inscribed around the table in the game's display
 *     face. A real plate carries real words.
 *   - **It is worn.** The gold is rubbed thin in the arcs where hands and
 *     cards cross it, and that wear is not symmetrical either.
 *
 * The seed is fixed, so the table is the same table every session — this is
 * one plate that someone made once, not a new random one each launch.
 *
 * The middle stays EMPTY. The first version put a rose at the centre, which is
 * exactly where the five community cards land; under `screen` it bled through
 * the translucent slots and showed around them, reading as both over and under
 * the cards at once. Everything here lives outside rx 300 / ry 170. The plate
 * is a border, not a medallion.
 */

/** A small deterministic PRNG, so the irregularity is fixed rather than fresh. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Points around an ellipse, each shoved off true by a hand's worth of error. */
function scatter(
  count: number, rx: number, ry: number, r: () => number,
  { arc = 0.045, cx = 500, cy = 300 } = {},
) {
  return Array.from({ length: count }, (_, i) => {
    // The ideal angle, plus up to ±arc of a step. A hand spacing marks by eye
    // drifts; it does not divide the circle.
    const a = ((i + (r() - 0.5) * arc * 2) / count) * Math.PI * 2 - Math.PI / 2;
    const wobble = 0.985 + r() * 0.03;
    return {
      x: cx + Math.cos(a) * rx * wobble,
      y: cy + Math.sin(a) * ry * wobble,
      deg: (a + Math.PI / 2) * (180 / Math.PI) + (r() - 0.5) * 5,
      s: 0.86 + r() * 0.3,
      o: 0.4 + r() * 0.55,
    };
  });
}

const GOLD = '#ffd882';
const MOTTOES = Object.values(SCHOOLS).map((s) => s.motto.replace(/\.$/, ''));
/* Three over the top, three under the bottom. Split by hand rather than in
   half by length: these are the ones that read well at the top of a table. */
const TOP_WORDS = [MOTTOES[0], MOTTOES[1], MOTTOES[2]].join('  ·  ');
const BOTTOM_WORDS = [MOTTOES[3], MOTTOES[4], MOTTOES[5]].join('  ·  ');

function FeltArcanaBase() {
  const r = rng(0x48455844); // "HEXD" — fixed, so it is one plate, not a new one each launch
  const crescents = scatter(4, 300, 170, r, { arc: 0.10 });
  const stars = scatter(9, 372, 206, r, { arc: 0.16 });
  const ticks = scatter(31, 432, 234, r, { arc: 0.30 });

  return (
    <svg
      className="felt-arcana"
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="hx-arc-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff0c4" stopOpacity="1" />
          <stop offset="48%" stopColor={GOLD} stopOpacity="0.9" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0.5" />
        </linearGradient>
        {/* The wear. Where hands and cards cross the plate the gold is thin;
            the patches are deliberately lopsided, because wear is. */}
        <radialGradient id="hx-arc-wear-a" cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#000" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <mask id="hx-arc-worn">
          <rect width="1000" height="600" fill="#fff" />
          <ellipse cx="236" cy="372" rx="128" ry="74" fill="url(#hx-arc-wear-a)" />
          <ellipse cx="792" cy="214" rx="104" ry="62" fill="url(#hx-arc-wear-a)" />
          <ellipse cx="520" cy="118" rx="150" ry="48" fill="url(#hx-arc-wear-a)" />
          <ellipse cx="612" cy="486" rx="92" ry="44" fill="url(#hx-arc-wear-a)" />
        </mask>
        {/* Two arcs, not one ring. A single path round the whole ellipse puts
            the bottom half of the sentence upside down, which reads as a bug
            rather than as a plate. Struck work splits it: the upper arc runs
            left to right over the top, the lower arc runs left to right under
            the bottom, so both halves stand upright to someone sitting at the
            table. Neither is concentric with the rings — a plate struck in two
            passes never quite lines up. */}
        <path id="hx-arc-band-top" fill="none"
          d="M 96,296 A 406,220 0 0,1 904,302" />
        <path id="hx-arc-band-bot" fill="none"
          d="M 98,304 A 404,222 0 0,0 902,298" />
      </defs>

      <g mask="url(#hx-arc-worn)">
        {/* The rings. Each one off its neighbour's centre by a unit or two, and
            none of them the same weight. */}
        <g fill="none" stroke="url(#hx-arc-gold)" strokeLinecap="round">
          <ellipse cx="500" cy="300" rx="462" ry="250" strokeWidth="3.6" opacity="0.92" />
          <ellipse cx="502" cy="299" rx="447" ry="240" strokeWidth="0.8" opacity="0.6" />
          <ellipse cx="499" cy="302" rx="374" ry="207" strokeWidth="2.2" opacity="0.8" />
          <ellipse cx="501" cy="301" rx="366" ry="201" strokeWidth="0.7" opacity="0.45" />
        </g>

        {/* Degree marks, uneven in both spacing and weight. */}
        <g stroke="url(#hx-arc-gold)" strokeLinecap="round">
          {ticks.map((p, i) => (
            <line
              key={`t${i}`}
              x1={p.x} y1={p.y}
              x2={500 + (p.x - 500) * 0.955} y2={300 + (p.y - 300) * 0.955}
              strokeWidth={i % 5 === 0 ? 1.4 + p.s : 0.5 + p.s * 0.5}
              opacity={p.o}
            />
          ))}
        </g>

        {/* The inscription: the six schools' own mottos, struck around the
            table. The plate says something rather than decorating. */}
        <text className="felt-arcana__band" fill="url(#hx-arc-gold)" fontSize="15.5" letterSpacing="2.1">
          <textPath href="#hx-arc-band-top" startOffset="50%" textAnchor="middle">{TOP_WORDS}</textPath>
        </text>
        <text className="felt-arcana__band" fill="url(#hx-arc-gold)" fontSize="15.5" letterSpacing="2.1">
          <textPath href="#hx-arc-band-bot" startOffset="50%" textAnchor="middle">{BOTTOM_WORDS}</textPath>
        </text>

        {/* Crescents and stars, each at its own angle and weight. */}
        <g fill="url(#hx-arc-gold)">
          {crescents.map((p, i) => (
            <path
              key={`c${i}`}
              d="M -13 0 a 13 13 0 1 0 13 -13 a 10 10 0 1 1 -13 13 z"
              transform={`translate(${p.x} ${p.y}) rotate(${p.deg}) scale(${1.2 * p.s})`}
              opacity={0.45 + p.o * 0.4}
            />
          ))}
          {stars.map((p, i) => (
            <path
              key={`s${i}`}
              d="M 0 -11 Q 2 -2 11 0 Q 2 2 0 11 Q -2 2 -11 0 Q -2 -2 0 -11 z"
              transform={`translate(${p.x} ${p.y}) rotate(${p.deg}) scale(${p.s})`}
              opacity={p.o * 0.8}
            />
          ))}
        </g>

        {/* The maker's mark. Every struck plate carries one, tucked where it
            does not interrupt the table — and this one is the reason the thing
            reads as made rather than rendered. */}
        <g
          transform="translate(176 232) rotate(-13)"
          fill="none"
          stroke="url(#hx-arc-gold)"
          strokeWidth="1.1"
          opacity="0.5"
        >
          <path d="M -9 -7 L -9 7 M -9 0 L 9 0 M 9 -7 L 9 7" />
          <circle cx="0" cy="0" r="13.5" strokeWidth="0.8" />
        </g>
      </g>
    </svg>
  );
}

export const FeltArcana = memo(FeltArcanaBase);
