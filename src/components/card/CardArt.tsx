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

function Jack() {
  const body = 'M50 80 C63 80 72 90 74 104 L78 150 L22 150 L26 104 C28 90 37 80 50 80 Z';
  const cap = 'M34 58 C32 40 46 30 62 35 L74 41 C60 39 44 42 37 60 Z';
  return (
    <g aria-hidden="true">
      {/* halberd, carried on the diagonal */}
      <path className="hx-art__gold-line" d="M16 148 L82 30" />
      <path className="hx-art__gold-fill" d="M68 42 L95 27 L88 57 Z" />
      <path className="hx-art__gold-line" d="M68 42 L95 27 L88 57 Z" />
      {/* torso */}
      <path className="hx-art__fill" d={body} />
      <path className="hx-art__line" d={body} />
      <path className="hx-art__line" d="M33 88 C37 97 45 100 50 94 C55 100 63 97 67 88" />
      <path className="hx-art__line" d="M27 120 H73" />
      <circle className="hx-art__fill" cx={50} cy={120} r={4.5} />
      {/* neck + head */}
      <path className="hx-art__fill" d="M44 70 H56 V84 H44 Z" />
      <circle className="hx-art__fill" cx={50} cy={62} r={13} />
      <circle className="hx-art__line" cx={50} cy={62} r={13} />
      {/* chaperon and feather */}
      <path className="hx-art__fill" d={cap} />
      <path className="hx-art__line" d={cap} />
      <path className="hx-art__gold-line" d="M72 39 C84 24 95 21 99 25 C89 29 80 37 76 47" />
    </g>
  );
}

function Queen() {
  const mantle = 'M50 82 C68 82 80 94 82 112 L86 150 L14 150 L18 112 C20 94 32 82 50 82 Z';
  const crown = 'M33 50 L33 36 L41 45 L50 28 L59 45 L67 36 L67 50 Z';
  return (
    <g aria-hidden="true">
      <path className="hx-art__fill" d={mantle} />
      <path className="hx-art__line" d={mantle} />
      {/* falling hair */}
      <path className="hx-art__line" d="M36 58 C27 74 27 98 34 114" />
      <path className="hx-art__line" d="M64 58 C73 74 73 98 66 114" />
      {/* neck + head */}
      <path className="hx-art__fill" d="M44 70 H56 V86 H44 Z" />
      <circle className="hx-art__fill" cx={50} cy={60} r={13} />
      <circle className="hx-art__line" cx={50} cy={60} r={13} />
      {/* diadem */}
      <path className="hx-art__gold-fill" d={crown} />
      <path className="hx-art__gold-line" d={crown} />
      <circle className="hx-art__gold-fill" cx={33} cy={33} r={3} />
      <circle className="hx-art__gold-fill" cx={50} cy={25} r={3.6} />
      <circle className="hx-art__gold-fill" cx={67} cy={33} r={3} />
      {/* collar and jewel */}
      <path className="hx-art__line" d="M40 88 C44 96 56 96 60 88" />
      <circle className="hx-art__fill" cx={50} cy={96} r={3.6} />
      {/* lotus held at the left */}
      <g transform="translate(23 122)">
        <path className="hx-art__gold-line" d="M0 14 V-2" />
        <path className="hx-art__gold-fill" d="M0 -2 C-9 -4 -11 -12 -7 -16 C-2 -13 0 -8 0 -2 Z" />
        <path className="hx-art__gold-fill" d="M0 -2 C9 -4 11 -12 7 -16 C2 -13 0 -8 0 -2 Z" />
        <path className="hx-art__gold-fill" d="M0 -2 C-4 -10 0 -19 0 -19 C0 -19 4 -10 0 -2 Z" />
      </g>
    </g>
  );
}

function King() {
  const mantle = 'M50 84 C72 84 86 96 88 114 L90 150 L10 150 L12 114 C14 96 28 84 50 84 Z';
  const crown = 'M30 48 L30 30 L38 41 L44 26 L50 38 L56 26 L62 41 L70 30 L70 48 Z';
  const beard = 'M37 62 C37 82 42 94 50 99 C58 94 63 82 63 62 Z';
  return (
    <g aria-hidden="true">
      {/* sword at his shoulder */}
      <path className="hx-art__gold-line" d="M84 150 V44" />
      <path className="hx-art__gold-line" d="M74 54 H94" />
      <circle className="hx-art__gold-fill" cx={84} cy={38} r={5} />
      {/* mantle */}
      <path className="hx-art__fill" d={mantle} />
      <path className="hx-art__line" d={mantle} />
      <path className="hx-art__line" d="M22 104 C34 94 66 94 78 104" />
      <circle className="hx-art__fill" cx={25} cy={116} r={2.4} />
      <circle className="hx-art__fill" cx={33} cy={126} r={2.4} />
      <circle className="hx-art__fill" cx={75} cy={116} r={2.4} />
      <circle className="hx-art__fill" cx={67} cy={126} r={2.4} />
      {/* neck + head */}
      <path className="hx-art__fill" d="M44 68 H56 V84 H44 Z" />
      <circle className="hx-art__fill" cx={50} cy={58} r={13} />
      <circle className="hx-art__line" cx={50} cy={58} r={13} />
      {/* beard */}
      <path className="hx-art__fill" d={beard} />
      <path className="hx-art__line" d={beard} />
      <path className="hx-art__line" d="M42 76 H58" />
      <path className="hx-art__line" d="M44 86 H56" />
      {/* crown with a cross */}
      <path className="hx-art__gold-fill" d={crown} />
      <path className="hx-art__gold-line" d={crown} />
      <path className="hx-art__gold-line" d="M30 48 H70" />
      <path className="hx-art__gold-line" d="M50 26 V12 M44 19 H56" />
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
