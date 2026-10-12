import { memo } from 'react';

/**
 * The gold drawn on the cloth.
 *
 * The felt carried two hairline rings and a band of tick marks, which on a
 * dark green cloth was all it could carry — anything more would have been mud.
 * On a sapphire cloth under a brass rail the table is supposed to read as an
 * astrological plate someone deals cards on, and two rings do not do that.
 *
 * Everything here is drawn, not an asset: the build ships no images and this
 * keeps it that way. It is one <svg> on its own layer under the cards, at an
 * alpha low enough that a hand always wins the eye — a table that competes
 * with the cards on it is worse than a plain one.
 *
 * The middle is deliberately EMPTY, and must stay that way. The first version
 * put a sixteen-point rose and two inner rings at the centre of the plate —
 * which is exactly where the five community cards land. Under `screen` the
 * gold bled through the semi-transparent card slots in some places and showed
 * around them in others, so it read as simultaneously over and under the
 * cards. There is no alpha at which that looks deliberate.
 *
 * Everything drawn here therefore lives outside rx 300 / ry 170 of centre,
 * which is the box the board occupies. The plate is a border, not a medallion.
 */

/** Points on a circle, for the repeating motifs. */
function ring(count: number, rx: number, ry: number, cx = 500, cy = 300) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, deg: (i / count) * 360 };
  });
}

const GOLD = '#ffd882';

function FeltArcanaBase() {
  const spokes = ring(24, 430, 232);
  const crescents = ring(4, 300, 170);
  const stars = ring(8, 370, 205);

  return (
    <svg
      className="felt-arcana"
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        {/* The light falls across the plate the way the lamp does, so the gold
            is brighter on the lit side rather than an even outline. */}
        <linearGradient id="hx-arc-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff0c4" stopOpacity="1" />
          <stop offset="48%" stopColor={GOLD} stopOpacity="0.9" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0.5" />
        </linearGradient>
      </defs>

      <g stroke="url(#hx-arc-gold)" fill="none" strokeLinecap="round">
        {/* Concentric plate rings, at three weights. */}
        <ellipse cx="500" cy="300" rx="462" ry="250" strokeWidth="3.4" />
        <ellipse cx="500" cy="300" rx="448" ry="241" strokeWidth="0.9" opacity="0.7" />
        <ellipse cx="500" cy="300" rx="372" ry="206" strokeWidth="2.0" opacity="0.85" />

        {/* Spokes between the two outer rings — the degree marks of a chart. */}
        {spokes.map((p, i) => {
          const inner = ring(24, 372, 206)[i];
          return (
            <line
              key={`s${i}`}
              x1={inner.x} y1={inner.y} x2={p.x} y2={p.y}
              strokeWidth={i % 6 === 0 ? 1.8 : 0.7}
              opacity={i % 6 === 0 ? 0.75 : 0.34}
            />
          );
        })}

        {/* Four crescents at the quarters, as in the reference plate. */}
        {crescents.map((p, i) => (
          <path
            key={`c${i}`}
            d="M -13 0 a 13 13 0 1 0 13 -13 a 10 10 0 1 1 -13 13 z"
            transform={`translate(${p.x} ${p.y}) scale(1.25)`}
            fill="url(#hx-arc-gold)"
            stroke="none"
            opacity="0.7"
          />
        ))}

        {/* Eight four-pointed stars between them. */}
        {stars.map((p, i) => (
          <path
            key={`st${i}`}
            d="M 0 -11 Q 2 -2 11 0 Q 2 2 0 11 Q -2 2 -11 0 Q -2 -2 0 -11 z"
            transform={`translate(${p.x} ${p.y})`}
            fill="url(#hx-arc-gold)"
            stroke="none"
            opacity={i % 2 ? 0.62 : 0.4}
          />
        ))}
      </g>

      {/* A band of runes between the outer rings. Drawn as short strokes in
          repeating groups rather than as a font, so it needs no glyph coverage
          and cannot tofu on SteamOS. */}
      <g stroke="url(#hx-arc-gold)" fill="none" strokeLinecap="square" strokeWidth="1.5" opacity="0.6">
        {ring(48, 410, 224).map((p, i) => {
          const k = i % 4;
          const d = k === 0 ? 'M -4 -6 L -4 6 M -4 0 L 4 0 M 4 -6 L 4 6'
            : k === 1 ? 'M -4 6 L 0 -6 L 4 6 M -2 1 L 2 1'
            : k === 2 ? 'M -4 -6 L 4 -6 M 0 -6 L 0 6 M -3 6 L 3 6'
            : 'M -4 -6 L 4 6 M 4 -6 L -4 6';
          return <path key={`g${i}`} d={d} transform={`translate(${p.x} ${p.y}) rotate(${p.deg})`} />;
        })}
      </g>

    </svg>
  );
}

export const FeltArcana = memo(FeltArcanaBase);
