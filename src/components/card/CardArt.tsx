/**
 * CardArt — the ink on an ivory face.
 *
 * Everything here is pure geometry: suit shapes, traditional pip layouts, and
 * bespoke engraved court figures, all drawn as inline SVG paths in
 * `currentColor` so a single `--ink` variable swings the whole face between
 * near-black and deep crimson. No images, no icon fonts, no unicode faces.
 *
 * The component renders *only* the ink. The ivory stock, paper texture and
 * bevel live on the surface beneath it (see card.css) — which is what lets the
 * quantum state stack two of these on one sheet of paper and cross-fade them.
 */
import { memo } from 'react';
import type { Face, Rank, Suit } from '@shared/cards';
import { RANK_LABEL, isRed } from '@shared/cards';

// ---------------------------------------------------------------------------
// Suit geometry. Drawn inside a 100x100 box, centred on (50,50).
// ---------------------------------------------------------------------------

const SPADE_D =
  'M50 6 C45 22 30 33 20 43 C9 54 7 64 11 72 C15 80 26 84 35 80 ' +
  'C41 77.5 45.5 72 47.5 66 C47.5 79 43 89 32 96 L68 96 ' +
  'C57 89 52.5 79 52.5 66 C54.5 72 59 77.5 65 80 C74 84 85 80 89 72 ' +
  'C93 64 91 54 80 43 C70 33 55 22 50 6 Z';

const HEART_D =
  'M50 92 C22 70 6 54 6 36 C6 20 17 9 30 9 C39 9 46.5 14 50 22 ' +
  'C53.5 14 61 9 70 9 C83 9 94 20 94 36 C94 54 78 70 50 92 Z';

const DIAMOND_D =
  'M50 4 C60 22 74 38 88 50 C74 62 60 78 50 96 C40 78 26 62 12 50 C26 38 40 22 50 4 Z';

const CLUB_STEM_D = 'M50 44 C56 66 60 84 70 96 L30 96 C40 84 44 66 50 44 Z';

/** The raw shape, unwrapped — meant to be dropped into a `<g fill>` you own. */
function SuitGeometry({ suit }: { suit: Suit }) {
  if (suit === 'C') {
    return (
      <>
        <circle cx={50} cy={30} r={21} />
        <circle cx={26} cy={63} r={21} />
        <circle cx={74} cy={63} r={21} />
        <path d={CLUB_STEM_D} />
      </>
    );
  }
  return <path d={suit === 'S' ? SPADE_D : suit === 'H' ? HEART_D : DIAMOND_D} />;
}

export interface SuitShapeProps {
  suit: Suit;
  className?: string;
}

/** A standalone suit mark that inherits `color`. Used by indices and badges. */
export const SuitShape = memo(function SuitShape({ suit, className }: SuitShapeProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <g fill="currentColor">
        <SuitGeometry suit={suit} />
      </g>
    </svg>
  );
});

// ---------------------------------------------------------------------------
// Pip layouts. Traditional arrangements; bottom half rotated 180°.
// Art field is 100 x 150; columns at 25 / 50 / 75, rows spanning y 16..134.
// ---------------------------------------------------------------------------

type Pip = readonly [x: number, y: number];

const COL_L = 25;
const COL_C = 50;
const COL_R = 75;
const ROW_TOP = 16;
const ROW_SPAN = 118;
const MID_Y = ROW_TOP + ROW_SPAN / 2; // 75

const ry = (t: number): number => ROW_TOP + t * ROW_SPAN;

const SIX: readonly Pip[] = [
  [COL_L, ry(0)], [COL_R, ry(0)],
  [COL_L, ry(0.5)], [COL_R, ry(0.5)],
  [COL_L, ry(1)], [COL_R, ry(1)],
];

const EIGHT_SIDES: readonly Pip[] = [
  [COL_L, ry(0)], [COL_R, ry(0)],
  [COL_L, ry(1 / 3)], [COL_R, ry(1 / 3)],
  [COL_L, ry(2 / 3)], [COL_R, ry(2 / 3)],
  [COL_L, ry(1)], [COL_R, ry(1)],
];

const PIPS: Record<number, readonly Pip[]> = {
  2: [[COL_C, ry(0)], [COL_C, ry(1)]],
  3: [[COL_C, ry(0)], [COL_C, ry(0.5)], [COL_C, ry(1)]],
  4: [[COL_L, ry(0)], [COL_R, ry(0)], [COL_L, ry(1)], [COL_R, ry(1)]],
  5: [[COL_L, ry(0)], [COL_R, ry(0)], [COL_C, ry(0.5)], [COL_L, ry(1)], [COL_R, ry(1)]],
  6: SIX,
  7: [...SIX, [COL_C, ry(0.25)]],
  8: [...SIX, [COL_C, ry(0.25)], [COL_C, ry(0.75)]],
  9: [...EIGHT_SIDES, [COL_C, ry(0.5)]],
  10: [...EIGHT_SIDES, [COL_C, ry(1 / 6)], [COL_C, ry(5 / 6)]],
};

/** Fewer pips means each one can breathe. */
function pipScale(rank: Rank): number {
  if (rank <= 3) return 0.3;
  if (rank <= 6) return 0.26;
  if (rank <= 8) return 0.235;
  return 0.21;
}

// ---------------------------------------------------------------------------
// Court art. Engraved, geometric, two-tone silhouettes inside a hex medallion.
// ---------------------------------------------------------------------------

const HEX_OUTER = 'M50 4 L93 30 L93 120 L50 146 L7 120 L7 30 Z';
const HEX_INNER = 'M50 11 L87 34 L87 116 L50 139 L13 116 L13 34 Z';
const HATCH_ROWS = [42, 48, 54, 60, 66, 72, 78, 84, 90, 96, 102, 108];

function CourtFrame() {
  return (
    <g aria-hidden="true">
      <path className="hx-art__frame" d={HEX_OUTER} />
      <path className="hx-art__frame-2" d={HEX_INNER} />
      <g className="hx-art__hatch">
        {HATCH_ROWS.map((y) => (
          <path key={y} d={`M16 ${y} H84`} />
        ))}
      </g>
    </g>
  );
}

/** Small suit marks tucked into the medallion, as on a real court card. */
function CourtPips({ suit }: { suit: Suit }) {
  return (
    <g fill="currentColor" aria-hidden="true">
      <g transform="translate(19 24) scale(0.15) translate(-50 -50)">
        <SuitGeometry suit={suit} />
      </g>
      <g transform="translate(81 126) rotate(180) scale(0.15) translate(-50 -50)">
        <SuitGeometry suit={suit} />
      </g>
    </g>
  );
}

/**
 * A face, at the size a face actually has to work at.
 *
 * On a Steam Deck a hole card is about 90px wide, which makes the head in
 * this 100x150 viewBox roughly ten screen pixels across. Anything more than a
 * brow, two eyes and a nose turns to mud at that size — and anything less
 * turns the court cards into the featureless grey circles they were, where a
 * King and a Queen were the same silhouette with a different hat.
 */
function Face({ cy, brow = true }: { cy: number; brow?: boolean }) {
  return (
    <g aria-hidden="true">
      <circle className="hx-art__eye" cx={45.4} cy={cy} r={1.5} />
      <circle className="hx-art__eye" cx={54.6} cy={cy} r={1.5} />
      {brow ? <path className="hx-art__face" d={`M41.6 ${cy - 4.4} H48.4 M51.6 ${cy - 4.4} H58.4`} /> : null}
      <path className="hx-art__face" d={`M50 ${cy - 1} V${cy + 3.4} h2.6`} />
    </g>
  );
}

/**
 * The three courts.
 *
 * They have one job the rest of the deck does not: to be told apart instantly,
 * at a glance, at the size a card is actually played at. So each one is built
 * around a different silhouette rather than a different accessory — the King
 * broad and square, the Queen tall and tapered, the Jack angled and off-centre
 * — and the gold each carries (sword, lotus, halberd) reads as a shape at the
 * card's outer edge rather than as detail in the middle where it would vanish.
 */

function Jack() {
  // Turned, so the shoulder line is diagonal where the other two are level.
  // Ends inside the medallion, not at the card's edge: these are busts, and
  // a hem cut flat by the viewBox read as a figure standing behind a wall.
  const doublet = 'M50 78 C64 78 74 88 77 104 L79 118 L72 128 L28 128 L21 118 L24 102 C27 87 37 78 50 78 Z';
  const chaperon = 'M35 56 C31 42 40 31 54 32 C64 33 70 40 69 48 L64 46 C62 40 56 37 50 38 C43 39 38 46 38 57 Z';
  return (
    <g aria-hidden="true">
      {/* halberd, carried across the body */}
      <path className="hx-art__gold-line" d="M26 132 L84 26" />
      <path className="hx-art__gold-fill" d="M70 38 L96 22 L90 54 Z" />
      <path className="hx-art__gold-line" d="M70 38 L96 22 L90 54 Z" />

      {/* doublet */}
      <path className="hx-art__robe" d={doublet} />
      <path className="hx-art__line" d={doublet} />
      {/* slashed sleeve and belt, the period detail that reads as texture */}
      <path className="hx-art__face" d="M31 96 L28 114 M39 92 L36 112" />
      <path className="hx-art__line" d="M25 116 H77" />
      <path className="hx-art__gold-fill" d="M45 111 h10 v10 h-10 Z" />

      {/* collar, neck, head */}
      <path className="hx-art__line" d="M39 84 C44 92 56 92 61 84" />
      <path className="hx-art__robe" d="M45 66 H55 V82 H45 Z" />
      <circle className="hx-art__robe" cx={50} cy={57} r={12.5} />
      <circle className="hx-art__line" cx={50} cy={57} r={12.5} />
      <Face cy={56} />

      {/* chaperon, and the feather that gives him his outline */}
      <path className="hx-art__robe" d={chaperon} />
      <path className="hx-art__line" d={chaperon} />
      <path className="hx-art__gold-line" d="M66 40 C80 22 93 18 98 22 C86 27 76 36 71 49" />
    </g>
  );
}

function Queen() {
  // Tapered: narrow at the shoulder, wide at the hem, so she is an A where
  // the King is a T.
  const gown = 'M50 80 C64 80 74 92 77 110 L80 120 L72 129 L28 129 L20 120 L23 110 C26 92 36 80 50 80 Z';
  // Springs from under the diadem and falls against the shoulders. The first
  // version floated clear of the head on both sides and read as rabbit ears.
  const hair = 'M38 44 C28 52 26 74 31 96 C33 104 37 108 40 108 C35 96 33 80 36 66 C37 58 39 50 42 46 Z';
  const hair2 = 'M62 44 C72 52 74 74 69 96 C67 104 63 108 60 108 C65 96 67 80 64 66 C63 58 61 50 58 46 Z';
  const diadem = 'M35 47 L35 34 L42 43 L50 26 L58 43 L65 34 L65 47 Z';
  return (
    <g aria-hidden="true">
      {/* gown */}
      <path className="hx-art__robe" d={gown} />
      <path className="hx-art__line" d={gown} />
      {/* bodice seam and hem band */}
      <path className="hx-art__face" d="M50 96 V126" />
      <path className="hx-art__line" d="M24 118 H76" />

      {/* hair falling either side — the tapered frame */}
      <path className="hx-art__robe" d={hair} />
      <path className="hx-art__line" d={hair} />
      <path className="hx-art__robe" d={hair2} />
      <path className="hx-art__line" d={hair2} />

      {/* collar, neck, head */}
      <path className="hx-art__line" d="M40 86 C44 94 56 94 60 86" />
      <path className="hx-art__robe" d="M45 68 H55 V84 H45 Z" />
      <circle className="hx-art__robe" cx={50} cy={58} r={12.5} />
      <circle className="hx-art__line" cx={50} cy={58} r={12.5} />
      <Face cy={57} />

      {/* diadem */}
      <path className="hx-art__gold-fill" d={diadem} />
      <path className="hx-art__gold-line" d={diadem} />
      <circle className="hx-art__gold-fill" cx={35} cy={31} r={2.8} />
      <circle className="hx-art__gold-fill" cx={50} cy={23} r={3.4} />
      <circle className="hx-art__gold-fill" cx={65} cy={31} r={2.8} />
      {/* pendant */}
      <path className="hx-art__gold-line" d="M50 94 V100" />
      <circle className="hx-art__gold-fill" cx={50} cy={103} r={3.4} />

      {/* lotus, held out at the hem where it is still a shape at card size */}
      <g transform="translate(24 110)">
        <path className="hx-art__gold-line" d="M0 20 V0" />
        <path className="hx-art__gold-fill" d="M0 0 C-10 -3 -13 -13 -8 -18 C-2 -14 0 -8 0 0 Z" />
        <path className="hx-art__gold-fill" d="M0 0 C10 -3 13 -13 8 -18 C2 -14 0 -8 0 0 Z" />
        <path className="hx-art__gold-fill" d="M0 0 C-5 -11 0 -22 0 -22 C0 -22 5 -11 0 0 Z" />
      </g>
    </g>
  );
}

function King() {
  // Broadest of the three, and level: a T against the Queen's A.
  const mantle = 'M50 82 C74 82 88 94 91 112 L92 120 L80 130 L20 130 L8 120 L9 112 C12 94 26 82 50 82 Z';
  const crown = 'M29 45 L29 26 L37 38 L43 22 L50 35 L57 22 L63 38 L71 26 L71 45 Z';
  const beard = 'M37 60 C36 80 41 96 50 102 C59 96 64 80 63 60 Z';
  return (
    <g aria-hidden="true">
      {/* greatsword, planted point-down beside him */}
      <path className="hx-art__gold-line" d="M86 128 V40" />
      <path className="hx-art__gold-line" d="M76 52 H96" />
      <circle className="hx-art__gold-fill" cx={86} cy={34} r={5} />

      {/* mantle, with an ermine band along the shoulders */}
      <path className="hx-art__robe" d={mantle} />
      <path className="hx-art__line" d={mantle} />
      <path className="hx-art__line" d="M19 104 C33 93 67 93 81 104" />
      <circle className="hx-art__eye" cx={24} cy={114} r={1.9} />
      <circle className="hx-art__eye" cx={32} cy={124} r={1.9} />
      <circle className="hx-art__eye" cx={76} cy={114} r={1.9} />
      <circle className="hx-art__eye" cx={68} cy={124} r={1.9} />

      {/* neck and head, sitting inside the beard */}
      <path className="hx-art__robe" d="M45 66 H55 V80 H45 Z" />
      <circle className="hx-art__robe" cx={50} cy={56} r={13} />
      <circle className="hx-art__line" cx={50} cy={56} r={13} />

      {/* beard — drawn under the face so the features stay on top of it */}
      <path className="hx-art__robe" d={beard} />
      <path className="hx-art__line" d={beard} />
      <path className="hx-art__face" d="M43 82 C46 88 54 88 57 82" />
      <Face cy={54} />
      {/* moustache, which is most of what makes him read as the King */}
      <path className="hx-art__face" d="M43 62 C46 66 54 66 57 62" />

      {/* crown, with the cross */}
      <path className="hx-art__gold-fill" d={crown} />
      <path className="hx-art__gold-line" d={crown} />
      <path className="hx-art__gold-line" d="M29 45 H71" />
      <path className="hx-art__gold-line" d="M50 22 V9 M44 15 H56" />
    </g>
  );
}

const ACE_CURL =
  'M6 82 C12 62 26 56 33 68 C37 75 33 84 26 82 C20 80.5 19 73 24 70';
const ACE_LEAF = 'M14 96 C24 92 32 96 34 104 C26 106 18 103 14 96 Z';

function Ace({ suit }: { suit: Suit }) {
  const ornate = suit === 'S';
  return (
    <g aria-hidden="true">
      <circle className="hx-art__frame-2" cx={50} cy={76} r={41} />
      {ornate && <circle className="hx-art__frame" cx={50} cy={76} r={47} />}
      {/* flanking scrollwork, mirrored */}
      <g className="hx-art__gold-line">
        <path d={ACE_CURL} />
        <path d={ACE_CURL} transform="translate(100 0) scale(-1 1)" />
      </g>
      {ornate && (
        <g className="hx-art__gold-fill">
          <path d={ACE_LEAF} />
          <path d={ACE_LEAF} transform="translate(100 0) scale(-1 1)" />
        </g>
      )}
      {/* the mark itself, oversized */}
      <g fill="currentColor" transform={`translate(50 76) scale(${ornate ? 0.62 : 0.56}) translate(-50 -50)`}>
        <SuitGeometry suit={suit} />
      </g>
      {ornate && (
        <g>
          {/* banner beneath the spade */}
          <path className="hx-art__gold-line" d="M16 130 L26 124 H74 L84 130 L74 136 H26 Z" />
          <path className="hx-art__gold-line" d="M38 130 H62 M32 127 V133 M68 127 V133" />
          <path className="hx-art__gold-fill" d="M50 16 L53 24 L61 27 L53 30 L50 38 L47 30 L39 27 L47 24 Z" />
        </g>
      )}
      {!ornate && <path className="hx-art__gold-line" d="M28 128 H72" />}
    </g>
  );
}

function CourtArt({ rank, suit }: { rank: Rank; suit: Suit }) {
  return (
    <>
      <CourtFrame />
      <CourtPips suit={suit} />
      {rank === 11 && <Jack />}
      {rank === 12 && <Queen />}
      {rank === 13 && <King />}
      {rank === 14 && <Ace suit={suit} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Public pieces
// ---------------------------------------------------------------------------

export interface PipLayoutProps {
  rank: Rank;
  suit: Suit;
}

/** The centre of the card: pips for 2..10, bespoke art for J/Q/K/A. */
export const PipLayout = memo(function PipLayout({ rank, suit }: PipLayoutProps) {
  const court = rank >= 11;
  return (
    <svg
      className={court ? 'hx-art__svg hx-art__svg--court' : 'hx-art__svg'}
      viewBox="0 0 100 150"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {court ? (
        <CourtArt rank={rank} suit={suit} />
      ) : (
        <g fill="currentColor">
          {(PIPS[rank] ?? []).map(([x, y], i) => (
            <g
              key={i}
              transform={
                `translate(${x} ${y}) rotate(${y > MID_Y + 0.5 ? 180 : 0}) ` +
                `scale(${pipScale(rank)}) translate(-50 -50)`
              }
            >
              <SuitGeometry suit={suit} />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
});

function CornerIndex({ rank, suit, corner }: { rank: Rank; suit: Suit; corner: 'tl' | 'br' }) {
  const label = RANK_LABEL[rank] ?? '?';
  return (
    <div className={`hx-art__index hx-art__index--${corner}`} aria-hidden="true">
      <span className="hx-art__rank" data-wide={label.length > 1 ? 'true' : undefined}>
        {label}
      </span>
      <SuitShape suit={suit} className="hx-art__index-suit" />
    </div>
  );
}

export interface CardArtProps {
  face: Face;
  className?: string;
}

/**
 * A complete face: corner indices top-left and bottom-right (the latter
 * rotated), plus the centre art. Transparent background — the ivory stock is
 * painted by the surface beneath, so several of these can be stacked.
 */
export const CardArt = memo(function CardArt({ face, className }: CardArtProps) {
  const red = isRed(face.suit);
  return (
    <div
      className={className ? `hx-art ${className}` : 'hx-art'}
      data-ink={red ? 'red' : 'black'}
      aria-hidden="true"
    >
      <CornerIndex rank={face.rank} suit={face.suit} corner="tl" />
      <div className="hx-art__centre">
        <PipLayout rank={face.rank} suit={face.suit} />
      </div>
      <CornerIndex rank={face.rank} suit={face.suit} corner="br" />
    </div>
  );
});

export default CardArt;
