/**
 * Seat portraits.
 *
 * These used to be a hooded shape inside a violet radial gradient with two
 * glowing dots for eyes — the last surviving piece of the colour language the
 * rest of the game was deliberately moved off, and at the forty pixels a seat
 * actually renders them at, twelve of them were indistinguishable. A ring of
 * coloured blobs is the single clearest tell that nobody drew anything.
 *
 * What replaced them is a woodcut: black ink on bone paper, hatched rather
 * than shaded, inside a brass rule. Three rules make it work at 40px, which
 * is the only size that matters:
 *
 *   **Silhouette carries the identity.** Detail is invisible at this size, so
 *   every portrait is the same head and shoulders under different headgear,
 *   and the headgear is chosen to be unmistakable in outline alone — a beak,
 *   a pair of horns, a wide brim, a mitre. You can tell two players apart
 *   from across the room without resolving a single feature.
 *
 *   **The figure breaks its frame.** Horns, antlers and hat brims are drawn
 *   past the plate edge. Everything contained neatly inside a circle reads as
 *   an icon; something overflowing its border reads as a picture of a person.
 *
 *   **Ink does not fade.** Shadow is hatching, not opacity. There is exactly
 *   one accent colour per portrait, used on the eyes and the maker's mark,
 *   and it is one of the six school inks so the portraits sit in the same
 *   palette as the cards.
 *
 * Still no image assets: twelve figures, all paths, about 4 KB of markup.
 */
import { memo } from 'react';

/** The six school inks, doubled so twelve seats never repeat an accent. */
const INKS = [
  '#9a7fc9', '#5f8fb5', '#c79541', '#4f9a8c', '#b04a4f', '#7f9a4c',
  '#8a6fbd', '#527f9f', '#b8863a', '#448578', '#9c4045', '#6f8942',
];

/**
 * Printer's marks, struck low-left the way an engraver signs a plate. These
 * are drawn rather than set: `base.css` pins every `<text>` inside an avatar
 * to ten user units so the bot badge stays legible, which is five times the
 * size a signature wants, and a mark that fights a global rule is a mark that
 * breaks the next time someone touches that rule.
 */
const MARKS = [
  'M4 40h3v3H4Z',                                    // block
  'M5.5 39 8 44H3Z',                                 // triangle
  'M5.5 41.5 3 44l2.5-2.5L3 39l2.5 2.5L8 39 5.5 41.5 8 44Z', // cross
  'M5.5 39 8 41.5 5.5 44 3 41.5Z',                   // lozenge
  'M5.5 39a2.6 2.6 0 1 0 0 5 2.1 2.1 0 1 1 0-5Z',    // crescent
  'M3 41.5h5v1H3Zm2 -2.5h1v6H5Z',                    // plus
  'M3 39h5v1.2H3Zm0 2.4h5v1.2H3Zm0 2.4h5v1.2H3Z',    // three bars
  'M5.5 38.8 6.6 41 8.9 41 7 42.5 7.8 44.8 5.5 43.4 3.2 44.8 4 42.5 2.1 41 4.4 41Z', // star
  'M3 44l2.5-5L8 44Z',                               // pyramid
  'M5.5 39 8 41.5 5.5 44 3 41.5Zm0 1.6L4.3 41.5l1.2 1 1.2-1Z', // ring lozenge
  'M3 39h5v5H3Zm1.2 1.2v2.6h2.6v-2.6Z',              // square ring
  'M5.5 38.6 8 44H3Zm0 2.4L4.4 43h2.2Z',             // hollow triangle
];

const INK = '#17161a';
const INK_2 = '#3a3730';
const PAPER = '#e7dfcc';
const PAPER_2 = '#cfc4ab';

/**
 * The headgear, by archetype. Each returns paths drawn over the shared head,
 * and each is allowed outside the 0–48 box on purpose — the plate clips the
 * frame, not the figure.
 */
function Hat({ n, ink }: { n: number; ink: string }): JSX.Element {
  switch (n) {
    case 0: // cowl — a deep hood, the face lost inside it
      return (
        <>
          <path d="M24 3c-10 0-16 8-16 19 0 5 1 9 3 13h26c2-4 3-8 3-13C40 11 34 3 24 3Z" fill={INK} />
          <path d="M31 5c4 3 6 9 6 17 0 5-1 9-3 13h3c2-4 3-8 3-13 0-9-4-15-9-17Z" fill={INK_2} opacity=".55" />
          <ellipse cx="24" cy="23" rx="7.4" ry="9" fill="#08070a" />
        </>
      );
    case 1: // horned helm — the horns sweep up and in, so they stay on the plate
      return (
        <>
          <path d="M24 7c-8 0-13 6-13 14v4h26v-4c0-8-5-14-13-14Z" fill={INK} />
          <path d="M13.4 17C9 16 4.6 12.6 2 6c6.6 1.4 10.6 4.6 12.6 10Z" fill={INK} />
          <path d="M34.6 17C39 16 43.4 12.6 46 6c-6.6 1.4-10.6 4.6-12.6 10Z" fill={INK} />
          <path d="M13.4 17C9 16 4.6 12.6 2 6c4 3.4 8 6.2 12 8Z" fill={INK_2} opacity=".7" />
          <path d="M11 20h26v2.4H11Z" fill={INK_2} />
          <path d="M23 8v13h2V8Z" fill={INK_2} opacity=".7" />
        </>
      );
    case 2: // antlered — short, wide and branching, all inside the rule
      return (
        <>
          <path d="M24 8c-7 0-11 5-11 12v5h22v-5c0-7-4-12-11-12Z" fill={INK} />
          <path d="M15 15 9 9l1-5-3 3-3-3 1 6 4 4-4-1 5 5Z" fill={INK} />
          <path d="M33 15l6-6-1-5 3 3 3-3-1 6-4 4 4-1-5 5Z" fill={INK} />
        </>
      );
    case 3: // plague beak — pale, so it reads against the ink of the head
      return (
        <>
          <path d="M24 5c-8 0-13 6-13 13v7h26v-7c0-7-5-13-13-13Z" fill={INK} />
          <path d="M19.8 19.6h8.4l-.4 7.4c-.2 4-1.6 6.6-4.4 7.8 1.2-2.6 1.6-5.4 1.4-8.6l-.2-2.6h-5Z" fill={PAPER_2} />
          <path d="M19.8 19.6h8.4l-.2 3.4h-8Z" fill={INK_2} opacity=".55" />
          <path d="M20.4 23.6h4.2" stroke={INK} strokeWidth=".7" opacity=".4" />
        </>
      );
    case 4: // spiked crown
      return (
        <>
          <path d="M24 9c-8 0-12 5-12 12v4h24v-4c0-7-4-12-12-12Z" fill={INK} />
          <path d="M10 14 8 2l6 6 4-7 4 7 4-7 4 7 6-6-2 12Z" fill={INK} />
          <path d="M10 14h28v2.4H10Z" fill={INK_2} />
          <circle cx="24" cy="6.5" r="1.7" fill={ink} />
        </>
      );
    case 5: // veiled — sheer cloth, so the hatching shows through it
      return (
        <>
          <path d="M24 7c-9 0-14 6-14 14v3h28v-3c0-8-5-14-14-14Z" fill={INK} />
          <path d="M10 19h28v3.4H10Z" fill={ink} opacity=".6" />
          <path d="M10 21h28c0 14-2 22-4 27H14c-2-5-4-13-4-27Z" fill={PAPER} opacity=".3" />
          <path d="M10 21h28c0 14-2 22-4 27H14c-2-5-4-13-4-27Z" fill="none" stroke={PAPER_2} strokeWidth=".7" opacity=".5" />
          <path d="M16 26v20M24 27v21M32 26v20" stroke={PAPER_2} strokeWidth=".5" opacity=".35" />
        </>
      );
    case 6: // wide brim — sized to the plate's interior, not past it
      return (
        <>
          <path d="M24 4c-6 0-9 5-10 14h20C33 9 30 4 24 4Z" fill={INK} />
          <path d="M2 19c0-2.4 10-4.4 22-4.4S46 16.6 46 19s-10 4.4-22 4.4S2 21.4 2 19Z" fill={INK} />
          <path d="M14 15.6h20V18H14Z" fill={ink} opacity=".75" />
          <path d="M2 19c0 1.5 4 2.8 10 3.6C7 21.8 4 20.5 4 19Z" fill={INK_2} opacity=".8" />
        </>
      );
    case 7: // a pale mask, the one face on the table that is lighter than the felt
      return (
        <>
          <path d="M24 7c-9 0-13.5 6-13.5 15S15 37 24 37s13.5-6 13.5-15S33 7 24 7Z" fill={PAPER} />
          <path d="M24 7c-9 0-13.5 6-13.5 15S15 37 24 37c-4-3-6-8-6-15s2-12 6-15Z" fill={PAPER_2} opacity=".6" />
          <path d="M14.6 19.4c2.4-1.6 5-1.6 6.8 0-1.8 2-4.4 2.2-6.8 0Zm11.9 0c1.9-1.6 4.5-1.6 6.9 0-2.4 2.2-5 2-6.9 0Z" fill={INK} />
          <path d="M20.6 29.4h6.8" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M23.2 22.6h1.6l-.8 4Z" fill={INK_2} opacity=".75" />
        </>
      );
    case 8: // bare skull — bone, because a skull drawn in ink reads as a hole
      return (
        <>
          <path d="M24 6c-8.4 0-13.6 6-13.6 14 0 5 2 8.4 4 10.4V35h19.2v-4.6c2-2 4-5.4 4-10.4 0-8-5.2-14-13.6-14Z" fill={PAPER} />
          <path d="M24 6c-8.4 0-13.6 6-13.6 14 0 5 2 8.4 4 10.4V35h4V30c-2-2-4-5.4-4-10.4 0-6.6 3.6-12 9.6-13.6Z" fill={PAPER_2} opacity=".7" />
          <ellipse cx="18.4" cy="20.6" rx="3.6" ry="4.2" fill="#0b0a0c" />
          <ellipse cx="29.6" cy="20.6" rx="3.6" ry="4.2" fill="#0b0a0c" />
          <path d="M22.6 26.4h2.8l-1.4 3.6Z" fill="#0b0a0c" />
          <path d="M18 33h12v2H18Zm2.6-1.4v3.4M24 31.6V35m3.4-3.4V35" stroke={INK} strokeWidth=".7" opacity=".65" />
        </>
      );
    case 9: // bound head, the last turn of the bandage left hanging
      return (
        <>
          <path d="M24 6c-8 0-13 6-13 14v6h26v-6c0-8-5-14-13-14Z" fill={INK} />
          <path d="M11 14.6h26V17H11Zm0 4.8h26v2.4H11Zm0 4.8h26v2.4H11Z" fill={PAPER_2} opacity=".26" />
          <path d="M36 11 45 3l2.4 3.4-9 8Z" fill={INK} />
          <path d="M36 11 45 3l1 1.4-9 8Z" fill={INK_2} opacity=".8" />
        </>
      );
    case 10: // mitre — the peak brought down onto the plate
      return (
        <>
          <path d="M24 10c-7 0-11 5-11 12v4h22v-4c0-7-4-12-11-12Z" fill={INK} />
          <path d="M24 1c5.4 7 8.4 12 8.4 16H15.6C15.6 13 18.6 8 24 1Z" fill={INK} />
          <path d="M24 1c-5.4 7-8.4 12-8.4 16h3.6c0-4 2-8.4 4.8-13Z" fill={INK_2} opacity=".6" />
          <path d="M15.6 14h16.8v2.6H15.6Z" fill={ink} opacity=".85" />
        </>
      );
    default: // blindfolded, the tie trailing off to one side
      return (
        <>
          <path d="M24 6c-8 0-13 6-13 14v6h26v-6c0-8-5-14-13-14Z" fill={INK} />
          <path d="M9 17.6h30v6.2H9Z" fill={INK_2} />
          <path d="M38 20.6 46 17v7.6Z" fill={INK_2} />
          <path d="M9 17.6h30v1.6H9Z" fill={PAPER_2} opacity=".22" />
          <circle cx="24" cy="20.6" r="1.4" fill={ink} />
        </>
      );
  }
}

/** Whether this archetype already draws its own eyes. */
const NO_EYES = new Set([0, 3, 7, 8, 11]);

export interface AvatarProps {
  seed: number;
  size?: number;
  bot?: boolean;
  dim?: boolean;
  className?: string;
}

function AvatarBase({ seed, size = 40, bot, dim, className = '' }: AvatarProps) {
  const i = ((seed % 12) + 12) % 12;
  const ink = INKS[i];
  const mark = MARKS[i];
  const id = `av${i}`;

  return (
    <div
      className={`avatar ${dim ? 'is-dim' : ''} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 48 48" width={size} height={size}>
        <defs>
          {/* The hatching behind the figure. Woodcut shadow is lines, not a
              gradient — this is the single cue that does the most work. */}
          <pattern id={`${id}h`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
            <line x1="0" y1="0" x2="0" y2="3" stroke={PAPER_2} strokeWidth="1.1" />
          </pattern>
          <clipPath id={`${id}c`}>
            {/* A clipped-corner plate, not a circle. Circles are what every
                other avatar in every other game is. */}
            <path d="M6 1h36a5 5 0 0 1 5 5v36a5 5 0 0 1-5 5H6a5 5 0 0 1-5-5V6a5 5 0 0 1 5-5Z" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${id}c)`}>
          <rect width="48" height="48" fill={PAPER} />
          <rect width="48" height="48" fill={`url(#${id}h)`} opacity=".55" />
          {/* The paper is lit from the same side as the table. */}
          <rect width="48" height="48" fill={PAPER} opacity=".0" />

          {/* Shoulders — shared by every figure, so twelve portraits read as
              one set. Modelled the way an engraving is: the lit side gets
              nothing, the turned side gets hatching. */}
          <path d="M24 30c-10 0-17 6-19 18h38c-2-12-9-18-19-18Z" fill={INK} />
          <path d="M30 31c6 2 11 8 13 17h5c-2-10-8-16-18-17Z" fill={INK_2} opacity=".55" />
          <path d="M8 44c3-6 7-10 12-11" stroke={PAPER_2} strokeWidth=".8" opacity=".14" fill="none" />
          <path d="M6 47c3-7 8-12 14-13.6" stroke={PAPER_2} strokeWidth=".8" opacity=".1" fill="none" />

          {/* head */}
          <ellipse cx="24" cy="22" rx="11" ry="12" fill={INK} />

          <Hat n={i} ink={ink} />

          {!NO_EYES.has(i) ? (
            <>
              <circle cx="20.4" cy="22.5" r="1.5" fill={ink} />
              <circle cx="27.6" cy="22.5" r="1.5" fill={ink} />
            </>
          ) : (
            <>
              <circle cx="21.2" cy="23" r="1.25" fill={ink} />
              <circle cx="26.8" cy="23" r="1.25" fill={ink} />
            </>
          )}

          {/* the engraver's signature, struck low-left */}
          <path d={mark} fill={ink} opacity=".8" />
        </g>

        {/* the brass rule around the plate */}
        <path
          d="M6 1h36a5 5 0 0 1 5 5v36a5 5 0 0 1-5 5H6a5 5 0 0 1-5-5V6a5 5 0 0 1 5-5Z"
          fill="none" stroke="#8a6420" strokeWidth="1.6"
        />
        <path
          d="M6 1h36a5 5 0 0 1 5 5v36a5 5 0 0 1-5 5H6a5 5 0 0 1-5-5V6a5 5 0 0 1 5-5Z"
          fill="none" stroke="#d4a24a" strokeWidth=".7" opacity=".85"
        />

        {bot ? (
          <g>
            <path d="M32 33h16v9a5 5 0 0 1-5 5h-11Z" fill="#17161a" />
            <path d="M32 33h16v9a5 5 0 0 1-5 5h-11Z" fill="none" stroke="#8a6420" strokeWidth="1" />
            {/* `base.css` pins every `<text>` in an avatar to ten user units
                so this stays legible; `textLength` is what keeps ten units of
                type inside a sixteen-unit tab. */}
            <text
              x="40.5" y="43.6" textAnchor="middle" fill="#d4a24a"
              textLength="11" lengthAdjust="spacingAndGlyphs"
              fontFamily="ui-monospace, monospace" fontWeight="700"
            >
              AI
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

export default memo(AvatarBase);
