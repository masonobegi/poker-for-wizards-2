/**
 * Card — one card entity, rendered for one viewer.
 *
 * The component is a stack of flat layers so that everything it does can be
 * expressed as transform / opacity / filter and nothing ever reflows:
 *
 *   .hx-card-slot    size + perspective + layoutId (shared-element flight)
 *     .hx-card-enter deal-in arc, exit, selection lift          [framer]
 *       .hx-card__lift  idle float for winning cards            [css]
 *         .hx-card__shadow  contact shadow, tightens on landing [framer]
 *         .hx-card        pointer tilt                          [framer]
 *           .hx-card__flip   real 3D Y-rotation, preserve-3d    [framer]
 *             .hx-card__side--front   face / quantum cloud
 *             .hx-card__side--back    back / veil / probability field
 *           .hx-card__fx     clipped effects + specular glare
 *           .hx-card__ov     unclipped badges, ripples, glyph ring
 */
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { motion, type Transition } from 'framer-motion';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { usePointerFoil } from '@/components/fx/usePointerFoil';
import type { CardView, Face, MarkId, Rank, Suit } from '@shared/cards';
import { MARKS, RANK_LABEL, RANK_NAME, SUIT_NAME, faceKey, faceLabel, faceName } from '@shared/cards';
import { CardArt, SuitShape } from './CardArt';
import { CardBack } from './CardBack';
import { Mark } from '@/art/marks';
import './card.css';
import { EASE_OUT, ENTER_PANEL, T_REDUCED, T_SLOW } from '@/styles/motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';
export type CardHighlight = 'none' | 'winning' | 'used' | 'target' | 'dimmed';

/** CSSProperties that also tolerates custom properties. */
export type StyleVars = CSSProperties & Record<`--${string}`, string | number>;

export interface CardProps {
  view: CardView;
  /** md is exactly --card-w x --card-h; everything else scales from it. */
  size?: CardSize;
  /** Force the back regardless of `view.state` — e.g. an opponent's mucked hand. */
  faceDown?: boolean;
  highlight?: CardHighlight;
  selectable?: boolean;
  selected?: boolean;
  onClick?: (id: string) => void;
  onHoverChange?: (id: string | null) => void;
  /** Shared-element id, so a card can fly from hand to board and stay the same card. */
  layoutId?: string;
  /** Position in a deal, for the 70ms-per-card stagger. */
  index?: number;
  /**
   * Where this card flies in from, in pixels relative to where it lands.
   * `CardRow` measures it once per row against the deck; without it the card
   * falls back to a fixed offset, which is what everything off the table
   * still uses.
   */
  dealFrom?: { x: number; y: number; rotate: number } | null;
  className?: string;
  /** 3D tilt following the pointer. Defaults on for interactive cards. */
  tiltOnHover?: boolean;
  /**
   * Land face-down and turn over, rather than arriving already face-up.
   *
   * Only true where a DEAL is what is actually happening — the board and your
   * own hand. Every other card on screen (the codex, the shop, the top-of-deck
   * peek, a showdown row) is a card being SHOWN, not dealt, and flipping those
   * on mount turns a quiet panel into a flock of spinning rectangles.
   */
  dealFlip?: boolean;
}

const SCALE: Record<CardSize, number> = { xs: 0.52, sm: 0.74, md: 1, lg: 1.36 };

const MAX_TILT = 10;
const FLIP: Transition = { duration: T_SLOW, ease: EASE_OUT };
const STAGGER = 0.07;

const Q_MAX_LAYERS = 3;

/**
 * An undecided card is cut, not cross-faded.
 *
 * The two faces used to be stacked on one sheet with their opacity phasing
 * in and out of each other, which is a lovely idea and reads, in the hand, as
 * a card that cannot make up its mind about being rendered. "The wildcard
 * animations look bad" was the note, and the fix the same player asked for is
 * the right one: show both at once, split, so the card states its two
 * identities instead of flickering between them.
 *
 * The cut runs corner to corner because of where a playing card prints its
 * index: top-left upright, bottom-right rotated. Split on that diagonal and
 * each half keeps a whole index of its own — the upper face reads from the
 * top-left corner, the lower face from the bottom-right, exactly as both
 * would if you fanned two real cards.
 *
 * `band(i, n)` is that cut generalised: n bands between the lines x + y = t,
 * which is two triangles at n = 2 and three stripes at n = 3.
 */
function band(i: number, n: number): string {
  const ta = (200 * i) / n;
  const tb = (200 * (i + 1)) / n;
  const first = (t: number): [number, number] => (t <= 100 ? [t, 0] : [100, t - 100]);
  const second = (t: number): [number, number] => (t <= 100 ? [0, t] : [t - 100, 100]);
  const pts: Array<[number, number]> = [first(ta)];
  if (ta < 100 && tb > 100) pts.push([100, 0]);
  pts.push(first(tb), second(tb));
  if (ta < 100 && tb > 100) pts.push([0, 100]);
  pts.push(second(ta));
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`;
}

/** The cut lines themselves, drawn in ink so the split is an edge, not a seam. */
function QuantumSeams({ n }: { n: number }) {
  const lines = [];
  for (let i = 1; i < n; i++) {
    const t = (200 * i) / n;
    const [x1, y1] = t <= 100 ? [t, 0] : [100, t - 100];
    const [x2, y2] = t <= 100 ? [0, t] : [t - 100, 100];
    lines.push(
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />,
    );
  }
  return (
    <svg className="hx-q__seams" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden focusable="false">
      {lines}
    </svg>
  );
}

const RING_GLYPHS = ['✶', '◈', '☾', '✦', '⟁', '☉', '✷', '⌖', '⟡', '✧', '⎔', '❖'] as const;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Overlay pieces
// ---------------------------------------------------------------------------

const MarkBadge = memo(function MarkBadge({ id }: { id: MarkId }) {
  const mark = MARKS[id];
  const vars: StyleVars = { '--mk': mark.color };
  return (
    <span className={`hx-mark hx-mark--${id}`} style={vars} role="img" aria-label={`${mark.name}. ${mark.blurb}`}>
      <span className="hx-mark__glyph" aria-hidden="true">
        <Mark kind="card" id={id} fallback={mark.glyph} />
      </span>
      <span className="hx-mark__tip" role="tooltip" aria-hidden="true">
        <b className="hx-mark__name">{mark.name}</b>
        <i className="hx-mark__blurb">{mark.blurb}</i>
      </span>
    </span>
  );
});

const MemoryDots = memo(function MemoryDots({ memory }: { memory: number }) {
  if (memory <= 0) return null;
  return (
    <span className="hx-mem" aria-hidden="true">
      {memory <= 5 ? (
        Array.from({ length: memory }, (_, i) => <i key={i} className="hx-mem__dot" />)
      ) : (
        <b className="hx-mem__count">
          <i className="hx-mem__dot" />×{memory}
        </b>
      )}
    </span>
  );
});

const VeilPlaque = memo(function VeilPlaque({ rank, suit }: { rank?: Rank; suit?: Suit }) {
  return (
    <div className="hx-veil" aria-hidden="true">
      <span className="hx-veil__sigil" />
      <span className="hx-veil__rank">{rank !== undefined ? (RANK_LABEL[rank] ?? '?') : '?'}</span>
      <span className="hx-veil__suit">
        {suit !== undefined ? <SuitShape suit={suit} className="hx-veil__mark" /> : <span className="hx-veil__q">?</span>}
      </span>
    </div>
  );
});

/** The back an observer gets when a card is in superposition but not theirs to read. */
const QuantumField = memo(function QuantumField() {
  return (
    <div className="hx-field" aria-hidden="true">
      <span className="hx-field__blob hx-field__blob--a" />
      <span className="hx-field__blob hx-field__blob--b" />
      <span className="hx-field__blob hx-field__blob--c" />
      <svg className="hx-field__rings" viewBox="0 0 78 112" aria-hidden="true" focusable="false">
        <g className="hx-field__drift">
          <circle cx={33} cy={52} r={17} />
          <circle cx={45} cy={52} r={17} />
          <circle cx={39} cy={62} r={17} />
        </g>
      </svg>
      <span className="hx-field__grid" />
    </div>
  );
});

const GlyphRing = memo(function GlyphRing() {
  return (
    <svg className="hx-qring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g className="hx-qring__spin">
        {RING_GLYPHS.map((g, i) => (
          <text key={g} x={50} y={9} textAnchor="middle" transform={`rotate(${(i * 360) / RING_GLYPHS.length} 50 50)`}>
            {g}
          </text>
        ))}
      </g>
    </svg>
  );
});

// ---------------------------------------------------------------------------
// Description for assistive tech
// ---------------------------------------------------------------------------

/**
 * What a mark means, in the words the player needs mid-hand.
 *
 * `MARKS[id].blurb` is written for the codex; this is the same thing said
 * while you are deciding whether to call. Asked for directly: "if I hover
 * over a card I want to see its stats and modifiers."
 */
function markLine(m: MarkId): string {
  const def = MARKS[m];
  return `${def.name}: ${def.blurb}`;
}

function describe(view: CardView, back: boolean, cloud: Face[]): string {
  const bits: string[] = [];
  if (back && view.state === 'facedown') bits.push('Face-down card');
  else if (view.state === 'veiled') {
    if (view.rank !== undefined) bits.push(`Veiled card, rank ${RANK_NAME[view.rank] ?? 'unknown'}, suit hidden`);
    else if (view.suit !== undefined) bits.push(`Veiled card, suit ${SUIT_NAME[view.suit]}, rank hidden`);
    else bits.push('Veiled card');
  } else if (view.state === 'quantum') {
    bits.push(cloud.length ? `Undecided card: ${cloud.map(faceName).join(' or ')}` : 'Undecided card — nobody has seen it yet');
  } else if (view.face) bits.push(faceName(view.face));
  else bits.push('Face-down card');

  if (view.wasFace) bits.push(`was printed ${faceName(view.wasFace)}`);
  if (view.diverged) bits.push('divergent — the table sees another card');
  if (view.entangled) bits.push('entangled');
  if (view.amber) bits.push('set in amber — nothing can change it');
  if (view.memory > 0) bits.push(`${view.memory} pot${view.memory === 1 ? '' : 's'} won`);
  for (const m of view.marks) bits.push(markLine(m));
  return bits.join('. ');
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function CardBase({
  view,
  size = 'md',
  faceDown = false,
  highlight = 'none',
  selectable = false,
  selected = false,
  onClick,
  onHoverChange,
  layoutId,
  index = 0,
  dealFrom,
  className,
  tiltOnHover,
  dealFlip = false,
}: CardProps) {
  const reduced = useReducedMotionPref();
  const scale = SCALE[size];

  const cloud = useMemo<Face[]>(
    () => (view.state === 'quantum' && view.possible ? view.possible.slice(0, Q_MAX_LAYERS) : []),
    [view.state, view.possible],
  );

  const interactive = Boolean(onClick) || selectable;

  const isQuantum = view.state === 'quantum';
  const showBack =
    faceDown || view.state === 'facedown' || view.state === 'veiled' || (isQuantum && cloud.length === 0);

  // --- pointer tilt + specular -------------------------------------------
  // Shared with the sigils, so the two never drift apart. See usePointerFoil.
  const foil = usePointerFoil({ tilt: MAX_TILT, strength: 0.5, enabled: tiltOnHover ?? interactive });
  const tiltEnabled = foil.on;

  const handleEnter = useCallback(() => {
    onHoverChange?.(view.id);
    foil.onPointerEnter();
  }, [onHoverChange, view.id, foil]);

  const handleLeave = useCallback(() => {
    onHoverChange?.(null);
    foil.onPointerLeave();
  }, [onHoverChange, foil]);

  const handleClick = useCallback(() => onClick?.(view.id), [onClick, view.id]);

  const handleKey = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!onClick) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(view.id);
      }
    },
    [onClick, view.id],
  );

  // --- shadow tightening, re-triggered on each flip ------------------------
  const flipSeq = useRef(0);
  const prevBack = useRef(showBack);
  if (prevBack.current !== showBack) {
    prevBack.current = showBack;
    flipSeq.current += 1;
  }

  const marks = view.marks;
  const has = useCallback((id: MarkId): boolean => marks.includes(id), [marks]);
  /* Wild counts as any suit and Prism counts as any suit, so neither has the
     one that is printed on it. See CardArt's `rainbow`. */
  const rainbow = marks.includes('wild') || marks.includes('prism');
  /* Wild is any rank AND any suit; Prism is any suit only. They were drawn
     identically, so "there needs to be more of a distinction on which cards
     are wild rank, which are wild suit and which are both" — the rank goes
     grey and struck on a Wild, because the number printed on it no longer
     decides anything, and a strip at the foot of the card says which it is. */
  const anyRank = marks.includes('wild');

  const slotVars: StyleVars = {
    '--cs': scale,
  };

  const classes = [
    'hx-card-slot',
    `hx-card-slot--${size}`,
    `is-${view.state}`,
    showBack ? 'is-back' : 'is-front',
    highlight !== 'none' ? `is-${highlight}` : '',
    selected ? 'is-selected' : '',
    interactive ? 'is-interactive' : '',
    view.diverged ? 'is-diverged' : '',
    view.entangled ? 'is-entangled' : '',
    view.amber ? 'is-amber' : '',
    // Every mark gets a hook. card.css turns these into the foil that makes a
    // marked card read as precious from across the table — the payoff of the
    // whole Weave school, which until now looked like an ordinary card with a
    // small badge on it.
    marks.length > 0 ? 'has-mark' : '',
    has('wild') ? 'has-wild' : '',
    has('prism') ? 'has-prism' : '',
    has('blooded') ? 'has-blooded' : '',
    has('leaden') ? 'has-leaden' : '',
    has('mirrored') ? 'has-mirrored' : '',
    has('bound') ? 'has-bound' : '',
    has('cursed') ? 'has-cursed' : '',
    has('burning') ? 'has-burning' : '',
    has('echo') ? 'has-echo' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const delay = reduced ? 0 : index * STAGGER;
  const lift = selected ? -10 * scale : 0;

  // A real deal has a common origin; a fixed offset per card does not. When
  // the row knows where the deck is, the card starts there, turned the way a
  // card thrown in that direction would be. Off the table there is no deck,
  // and the old fixed arc is still the right answer.
  // --- the turn ------------------------------------------------------------
  // `flipSeq` is still 0 for as long as the card has never changed face, so it
  // doubles as "this is the mount animation" — which is the only flip that
  // wants to wait for the deal arc to land first.
  const firstTurn = flipSeq.current === 0;
  const dealTurn = dealFlip && !reduced && !showBack;
  const turnTransition: Transition = firstTurn && dealTurn ? { ...FLIP, delay: delay + 0.16 } : FLIP;

  const enterInitial = reduced
    ? { opacity: 0, x: 0, y: 0, rotate: 0, scale: 1 }
    : dealFrom
      ? { opacity: 0, x: dealFrom.x, y: dealFrom.y, rotate: dealFrom.rotate, scale: 0.7 }
      : { opacity: 0, x: -34, y: -118, rotate: -20, scale: 0.84 };

  // Distance sets the spring, not the other way round: a card crossing the
  // whole felt should not arrive at the same moment as one dropped two inches,
  // and a stiff spring over 600px is a card teleporting with a wobble at the
  // end. Softer and heavier the further it has to travel.
  const reach = dealFrom ? Math.hypot(dealFrom.x, dealFrom.y) : 0;
  const far = Math.min(1, reach / 520);

  const enterTransition: Transition = reduced
    ? { duration: T_REDUCED, ease: EASE_OUT }
    : {
        default: {
          type: 'spring',
          stiffness: 240 - far * 90,
          damping: 26 - far * 4,
          mass: 0.8 + far * 0.5,
          delay,
        },
        // A softer spring on y than on x bends the straight line into an arc.
        y: {
          type: 'spring',
          stiffness: 170 - far * 60,
          damping: 21 - far * 3,
          mass: 0.95 + far * 0.55,
          delay,
        },
        // The card lands flat before it finishes settling into place, which is
        // what stops a long throw reading as a slide.
        rotate: { type: 'spring', stiffness: 210, damping: 19, mass: 0.7, delay },
        opacity: { duration: 0.16, delay },
      };

  const front = (
    <div className="hx-card__side hx-card__side--front">
      <div className="hx-card__surface hx-card__surface--face">
        <span className="hx-card__paper" />
        {isQuantum && cloud.length > 0 ? (
          <div className="hx-q">
            {cloud.map((f, i) => (
              <div
                className="hx-q__layer"
                key={`${faceKey(f)}-${i}`}
                style={{ clipPath: band(i, cloud.length) } as StyleVars}
              >
                <CardArt face={f} rainbow={rainbow} anyRank={anyRank} />
              </div>
            ))}
            <QuantumSeams n={cloud.length} />
            <span className="hx-q__moire" />
            {/* The word, because a split card still has to say what the split
                means. "Undecided" is the game's word for it everywhere else. */}
            <span className="hx-q__or" aria-hidden>or</span>
          </div>
        ) : view.face && view.wasFace ? (
          /*
            What it is, and what it was, on one card.

            "You can see the real card and the card of what it is in like a
            half and half, and what the card really is is bright while what it
            was is grayed out." This is that, on the same diagonal seam the
            undecided cards are split along, so the two kinds of split card
            read as the same idea. Only a Mirrored card has a `wasFace`: the
            board that came out 3♣ 4♠ 7♦ and read as three 3♣s now shows the
            4♠ and the 7♦ still there underneath, which is the part that was
            missing.
          */
          <div className="hx-was">
            <div className="hx-was__layer is-was" style={{ clipPath: band(1, 2) } as StyleVars}>
              <CardArt face={view.wasFace} />
            </div>
            <div className="hx-was__layer is-now" style={{ clipPath: band(0, 2) } as StyleVars}>
              <CardArt face={view.face} rainbow={rainbow} anyRank={anyRank} />
            </div>
            <QuantumSeams n={2} />
            <span className="hx-was__label" aria-hidden>was {faceLabel(view.wasFace)}</span>
          </div>
        ) : view.face ? (
          <CardArt face={view.face} rainbow={rainbow} anyRank={anyRank} />
        ) : null}
        {rainbow && !showBack ? (
          <span className={`hx-any ${anyRank ? 'is-both' : ''}`} aria-hidden>
            {anyRank ? 'any rank · any suit' : 'any suit'}
          </span>
        ) : null}
      </div>
    </div>
  );

  const back = (
    <div className="hx-card__side hx-card__side--back">
      <div className="hx-card__surface hx-card__surface--back">
        {isQuantum && cloud.length === 0 ? (
          <QuantumField />
        ) : (
          <>
            <CardBack muted={view.state === 'veiled'} sheen={!reduced} />
            {view.state === 'veiled' && <VeilPlaque rank={view.rank} suit={view.suit} />}
          </>
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      className={classes}
      style={slotVars}
      layoutId={layoutId}
      onPointerMove={foil.onPointerMove}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      onClick={onClick ? handleClick : undefined}
      onKeyDown={onClick ? handleKey : undefined}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={selectable && onClick ? selected : undefined}
      aria-label={describe(view, showBack, cloud)}
      /* The same sentence as a native tooltip. A card can be on the board, on
         a seat, in your hand or in a showdown row, so this is the one place
         that reaches all of them without a layer that could be clipped. */
      title={describe(view, showBack, cloud)}
    >
      <motion.div
        className="hx-card-enter"
        initial={enterInitial}
        animate={{ opacity: 1, x: 0, y: lift, rotate: 0, scale: 1 }}
        exit={reduced
          ? { opacity: 0, transition: { duration: T_REDUCED, ease: EASE_OUT } }
          : { opacity: 0, y: 22, rotate: 7, scale: 0.9, transition: ENTER_PANEL }}
        transition={enterTransition}
        // Cards are pressable through every targeting flow and had nothing but
        // a cursor change to say so. This sits on the inner element rather
        // than the slot because the slot's transform belongs to `layoutId`.
        whileTap={onClick ? { scale: 0.97 } : undefined}
      >
        <div className="hx-card__lift">
          <motion.span
            className="hx-card__shadow"
            initial={flipSeq.current === 0 ? false : undefined}
            animate={{ scaleX: [1, 1.16, 1], scaleY: [1, 1.26, 1], opacity: [0.6, 0.24, 0.6] }}
            transition={reduced ? { duration: T_REDUCED, ease: EASE_OUT } : FLIP}
            key={flipSeq.current}
          />
          {/* The landing.
              A card that travels the width of the table and simply stops has
              no weight — the arc says where it went, nothing says it arrived.
              This is the shadow it casts while it is still in the air: wide
              and faint at the start of the flight, collapsing onto the tight
              contact shadow above as the card comes down. It is the cheapest
              honest cue for height there is, and it is the one the eye reads
              first. */}
          {reduced ? null : (
            <motion.span
              className="hx-card__drop"
              initial={{ opacity: 0.55, scale: 2.2 }}
              animate={{ opacity: 0, scale: 1 }}
              transition={{ duration: 0.46, delay, ease: [0.16, 1, 0.3, 1] }}
              aria-hidden
            />
          )}
          <motion.div
            className="hx-card"
            style={{ rotateX: tiltEnabled ? foil.rotateX : 0, rotateY: tiltEnabled ? foil.rotateY : 0 }}
          >
            <motion.div
              className="hx-card__flip"
              animate={{ rotateY: showBack ? 180 : 0 }}
              initial={dealTurn ? { rotateY: 180 } : false}
              transition={reduced ? { duration: T_REDUCED, ease: EASE_OUT } : turnTransition}
            >
              {front}
              {back}
            </motion.div>

            <div className="hx-card__fx">
              {/* The light a real card catches as it turns. `hx-card__fx` is a
                  sibling of the flip, so it keeps facing the viewer and the
                  streak reads as a reflection passing over the card rather
                  than a decal glued to one face. Keyed on the same counter as
                  the shadow, and `initial={false}` on the first render so a
                  card that arrives face-up does not flash. */}
              {!reduced && (!firstTurn || dealTurn) && (
                <motion.span
                  key={`turn-${flipSeq.current}`}
                  className="hx-card__turn"
                  initial={{ opacity: 0, x: '-75%' }}
                  animate={{ opacity: [0, 0.55, 0], x: ['-75%', '75%'] }}
                  transition={turnTransition}
                />
              )}
              {tiltEnabled && <motion.span className="hx-card__glare" style={{ backgroundImage: foil.sheen, opacity: foil.sheenOpacity }} />}
              {isQuantum && <span className="hx-fx hx-fx--chroma" />}
              {isQuantum && <span className="hx-fx hx-fx--interference" />}
              {view.diverged && <span className="hx-fx hx-fx--split" />}
              {has('cursed') && <span className="hx-fx hx-fx--cursed" />}
              {has('burning') && <span className="hx-fx hx-fx--burning" />}
              {has('blooded') && <span className="hx-fx hx-fx--blooded" />}
              {highlight === 'target' && <span className="hx-fx hx-fx--target" />}
              <span className="hx-card__rim" />
            </div>

            <div className="hx-card__ov">
              {has('wild') && <span className="hx-fx hx-fx--wild" />}
              {has('echo') && <span className="hx-fx hx-fx--echo" />}
              {isQuantum && <GlyphRing />}

              {marks.length > 0 && (
                <span className="hx-marks">
                  {marks.map((m) => (
                    <MarkBadge key={m} id={m} />
                  ))}
                </span>
              )}

              <span className="hx-badges">
                {view.diverged && (
                  <span className="hx-badge hx-badge--diverged" role="img" aria-label="Divergent reading">
                    ⋔
                  </span>
                )}
                {view.entangled && (
                  <span className="hx-badge hx-badge--entangled" role="img" aria-label="Entangled">
                    ∞
                  </span>
                )}
                {/* Amber was invisible: the rule existed, the card wearing it
                    did not say so, and a player cannot plan around a card
                    they cannot point at. */}
                {view.amber && (
                  <span
                    className="hx-badge hx-badge--amber"
                    role="img"
                    aria-label="Set in amber — nothing can burn, collapse, steal or rewrite this card"
                    title="Set in amber — nothing can burn, collapse, steal or rewrite this card"
                  >
                    ⬡
                  </span>
                )}
              </span>

              <MemoryDots memory={view.memory} />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export const Card = memo(CardBase);
Card.displayName = 'Card';

export default Card;
