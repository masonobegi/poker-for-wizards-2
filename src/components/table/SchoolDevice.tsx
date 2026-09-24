import { memo } from 'react';
import type { School } from '@shared/sigils';

/**
 * The device of each school, engraved.
 *
 * Sixty spell cards shared one visual idea between them: a Unicode glyph, set
 * large, in the school's colour. It identified the sigil and said nothing
 * about it — the entire spell hand, which is the mechanic the game is named
 * for, carried no drawing at all. Beside two playing cards with painted court
 * figures on them, the spells looked like the part nobody had got to yet.
 *
 * These are the six devices, one per school, printed behind the glyph the way
 * a banknote carries a vignette or a trade card carries the printer's own
 * emblem. Six drawings rather than sixty, because the school is what a device
 * is *for*: it groups. The glyph stays on top and stays the identifier, so
 * nothing that was readable before became less so.
 *
 * Every line is `currentColor`, so a device is drawn in its own school's ink
 * with no per-school colour handling here, and the whole thing is line work —
 * no fills, no gradients — because that is what the rest of the game's
 * printed surfaces are made of.
 */

const COMMON = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Device({ id }: { id: School }): JSX.Element {
  switch (id) {
    // Entropy — a die coming apart. The cube is still legible as a cube;
    // the shards leaving it are what the school does.
    case 'entropy':
      return (
        <g {...COMMON} strokeWidth="1.5">
          <path d="M32 12 48 21v18l-16 9-16-9V21Z" />
          <path d="M32 12v18m0 0 16-9m-16 9-16-9" />
          <path d="M32 30v18" strokeDasharray="3 3" />
          <path d="M24 25.5 30 33l-4 5" strokeWidth="1.1" />
          <path d="M40 25.5 34 33l4 5" strokeWidth="1.1" />
          <path d="m52 16-4 3 5 1Z" strokeWidth="1.1" />
          <path d="m12 16 4 3-5 1Z" strokeWidth="1.1" />
          <path d="m50 45-3 3 4 1Z" strokeWidth="1.1" />
        </g>
      );

    // Veil — a drawn curtain with an eye in the gap. The folds are hatching,
    // which is also the only shading in the set.
    case 'veil':
      return (
        <g {...COMMON} strokeWidth="1.5">
          {/* Two hung panels, wide enough to read as cloth, with a hem that
              swings — a narrow vertical reads as a pillar, which is what the
              first attempt at this looked like. */}
          <path d="M9 11h13v32c0 3-2 5-5 6-3 1-6 0-8-1 2-12 2-25 0-37Z" />
          <path d="M55 11H42v32c0 3 2 5 5 6 3 1 6 0 8-1-2-12-2-25 0-37Z" />
          <path d="M13 13c1.4 10 1.4 21 0 31M17 12.6c1.2 11 1.2 22 0 33"
            strokeWidth=".8" opacity=".7" />
          <path d="M51 13c-1.4 10-1.4 21 0 31M47 12.6c-1.2 11-1.2 22 0 33"
            strokeWidth=".8" opacity=".7" />
          <path d="M9 11h13M55 11H42" strokeWidth="2" />
          {/* The eye in the gap, large enough to be the subject. */}
          <path d="M22 32c4.4-7.4 7-10.4 10-10.4s5.6 3 10 10.4c-4.4 7.4-7 10.4-10 10.4S26.4 39.4 22 32Z" />
          <circle cx="32" cy="32" r="4.4" />
          <circle cx="32" cy="32" r="1.3" strokeWidth="2.2" />
        </g>
      );

    // Chronos — an hourglass whose sand has stopped in the air. The grains
    // are the point: the glass is ordinary, the fall is not.
    case 'chronos':
      return (
        <g {...COMMON} strokeWidth="1.5">
          <path d="M18 11h28M18 53h28" />
          <path d="M21 11c0 9 11 17 11 21s-11 12-11 21" />
          <path d="M43 11c0 9-11 17-11 21s11 12 11 21" />
          <path d="M24 15h16c-.6 5-8 12-8 12s-7.4-7-8-12Z" strokeWidth="1" opacity=".8" />
          <path d="M26 49h12c-.5-4-6-8-6-8s-5.5 4-6 8Z" strokeWidth="1" opacity=".8" />
          <circle cx="32" cy="35.5" r="1" strokeWidth="1.6" />
          <circle cx="30.4" cy="40" r=".8" strokeWidth="1.4" />
          <circle cx="33.4" cy="43.4" r=".7" strokeWidth="1.3" />
        </g>
      );

    // Bind — two links that cannot be separated without cutting one.
    case 'bind':
      return (
        <g {...COMMON} strokeWidth="1.5">
          <rect x="11" y="24" width="24" height="16" rx="8" />
          <rect x="29" y="24" width="24" height="16" rx="8" />
          <path d="M29 26.4a8 8 0 0 0 0 11.2" strokeWidth="2.4" />
          <path d="M18 20v-5M46 20v-5" strokeWidth="1.1" opacity=".8" />
          <path d="M18 44v5M46 44v5" strokeWidth="1.1" opacity=".8" />
        </g>
      );

    // Ruin — a column with the crack already through it and a piece on the
    // ground. Drawn after the fact, not during.
    case 'ruin':
      return (
        <g {...COMMON} strokeWidth="1.5">
          <path d="M22 14h20M20 11h24" />
          <path d="M24 14v28M40 14v28" />
          <path d="M28 14v26M36 14v26" strokeWidth=".8" opacity=".7" />
          <path d="M24 28l16 5" strokeWidth="1.2" />
          <path d="M22 42h20l3 5H19Z" />
          <path d="M17 52h30" />
          <path d="m47 33 6 4-3 5-6-3Z" strokeWidth="1.2" />
        </g>
      );

    // Weave — plain over-under. The whole school in one figure: everything
    // passes through everything else and holds.
    default:
      return (
        <g {...COMMON} strokeWidth="2.4">
          <path d="M20 12v40M32 12v40M44 12v40" />
          <path d="M12 20h40M12 32h40M12 44h40" />
          {/* The knockouts that turn a grid into a weave. They have to be only
              a little wider than the strap they interrupt: at twice the width
              the figure stops reading as bands passing over each other and
              starts reading as a field of dashes, which is what the first
              version of this did. */}
          <path d="M20 18.3v3.4M44 18.3v3.4M32 30.3v3.4M20 42.3v3.4M44 42.3v3.4"
            stroke="var(--sigil-paper, #efe8d8)" strokeWidth="3.2" />
          <path d="M30.3 20h3.4M30.3 44h3.4M18.3 32h3.4M42.3 32h3.4"
            stroke="var(--sigil-paper, #efe8d8)" strokeWidth="3.2" />
        </g>
      );
  }
}

function SchoolDeviceBase({ school }: { school: School }) {
  return (
    <svg className="sigil-device" viewBox="0 0 64 64" aria-hidden focusable="false">
      <Device id={school} />
    </svg>
  );
}

export default memo(SchoolDeviceBase);
