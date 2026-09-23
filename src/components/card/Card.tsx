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
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type SpringOptions,
  type Transition,
} from 'framer-motion';
import type { CardView, Face, MarkId, Rank, Suit } from '@shared/cards';
import { MARKS, RANK_LABEL, RANK_NAME, SUIT_NAME, faceKey, faceName } from '@shared/cards';
import { CardArt, SuitShape } from './CardArt';
import { CardBack } from './CardBack';
import './card.css';

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
}

const SCALE: Record<CardSize, number> = { xs: 0.52, sm: 0.74, md: 1, lg: 1.36 };

const MAX_TILT = 10;
const TILT_SPRING: SpringOptions = { stiffness: 260, damping: 26, mass: 0.5 };
const GLARE_SPRING: SpringOptions = { stiffness: 190, damping: 30, mass: 0.4 };
const FLIP: Transition = { duration: 0.42, ease: [0.34, 1.56, 0.64, 1] };
const STAGGER = 0.07;

/** Cross-fade offsets for stacked superposition faces, in px. */
const Q_OFFSET: ReadonlyArray<readonly [number, number]> = [
  [-3.2, -1.6],
  [3.2, 1.6],
  [0, -3.6],
];
const Q_PHASE = 3.6; // seconds for one full phase cycle
const Q_MAX_LAYERS = 3;

const RING_GLYPHS = ['✶', '◈', '☾', '✦', '⟁', '☉', '✷', '⌖', '⟡', '✧', '⎔', '❖'] as const;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function useFinePointer(): boolean {
  const query = '(hover: hover) and (pointer: fine)';
  const [fine, setFine] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : true,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const sync = (): void => setFine(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return fine;
}

// ---------------------------------------------------------------------------
// Overlay pieces
// ---------------------------------------------------------------------------

const MarkBadge = memo(function MarkBadge({ id }: { id: MarkId }) {
  const mark = MARKS[id];
  const vars: StyleVars = { '--mk': mark.color };
  return (
    <span className={`hx-mark hx-mark--${id}`} style={vars} role="img" aria-label={`${mark.name}. ${mark.blurb}`}>
      <span className="hx-mark__glyph" aria-hidden="true">
        {mark.glyph}
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

function describe(view: CardView, back: boolean, cloud: Face[]): string {
  const bits: string[] = [];
  if (back && view.state === 'facedown') bits.push('Face-down card');
  else if (view.state === 'veiled') {
    if (view.rank !== undefined) bits.push(`Veiled card, rank ${RANK_NAME[view.rank] ?? 'unknown'}, suit hidden`);
    else if (view.suit !== undefined) bits.push(`Veiled card, suit ${SUIT_NAME[view.suit]}, rank hidden`);
    else bits.push('Veiled card');
  } else if (view.state === 'quantum') {
    bits.push(cloud.length ? `Uncollapsed card: ${cloud.map(faceName).join(' or ')}` : 'Uncollapsed card');
  } else if (view.face) bits.push(faceName(view.face));
  else bits.push('Face-down card');

  if (view.diverged) bits.push('divergent — the table sees another card');
  if (view.entangled) bits.push('entangled');
  if (view.memory > 0) bits.push(`${view.memory} pot${view.memory === 1 ? '' : 's'} won`);
  for (const m of view.marks) bits.push(MARKS[m].name);
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
}: CardProps) {
  const reduced = useReducedMotion() === true;
  const finePointer = useFinePointer();
  const scale = SCALE[size];

  const cloud = useMemo<Face[]>(
    () => (view.state === 'quantum' && view.possible ? view.possible.slice(0, Q_MAX_LAYERS) : []),
    [view.state, view.possible],
  );

  const interactive = Boolean(onClick) || selectable;
  const tiltEnabled = (tiltOnHover ?? interactive) && finePointer && !reduced;

  const isQuantum = view.state === 'quantum';
  const showBack =
    faceDown || view.state === 'facedown' || view.state === 'veiled' || (isQuantum && cloud.length === 0);

  // --- pointer tilt + specular -------------------------------------------
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const hot = useMotionValue(0);
  const sx = useSpring(px, TILT_SPRING);
  const sy = useSpring(py, TILT_SPRING);
  const sHot = useSpring(hot, GLARE_SPRING);
  const rotateX = useTransform(sy, [0, 1], [MAX_TILT, -MAX_TILT]);
  const rotateY = useTransform(sx, [0, 1], [-MAX_TILT, MAX_TILT]);
  const glareX = useTransform(sx, (v: number) => `${(v * 100).toFixed(2)}%`);
  const glareY = useTransform(sy, (v: number) => `${(v * 100).toFixed(2)}%`);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.5), rgba(255,255,255,0) 58%)`;

  const handleMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!tiltEnabled) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      px.set((e.clientX - r.left) / r.width);
      py.set((e.clientY - r.top) / r.height);
    },
    [tiltEnabled, px, py],
  );

  const handleEnter = useCallback(() => {
    onHoverChange?.(view.id);
    if (tiltEnabled) hot.set(1);
  }, [onHoverChange, view.id, tiltEnabled, hot]);

  const handleLeave = useCallback(() => {
    onHoverChange?.(null);
    px.set(0.5);
    py.set(0.5);
    hot.set(0);
  }, [onHoverChange, px, py, hot]);

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

  const slotVars: StyleVars = {
    '--cs': scale,
    '--hx-index': index,
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
    ? { duration: 0 }
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
            {cloud.map((f, i) => {
              const [dx, dy] = Q_OFFSET[i % Q_OFFSET.length];
              const layerVars: StyleVars = {
                '--qdx': dx,
                '--qdy': dy,
                animationDelay: `${(-(i * Q_PHASE) / Math.max(cloud.length, 1)).toFixed(2)}s`,
              };
              return (
                <div className="hx-q__layer" key={`${faceKey(f)}-${i}`} style={layerVars}>
                  <CardArt face={f} />
                </div>
              );
            })}
            <span className="hx-q__moire" />
          </div>
        ) : view.face ? (
          <CardArt face={view.face} />
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
      onPointerMove={handleMove}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      onClick={onClick ? handleClick : undefined}
      onKeyDown={onClick ? handleKey : undefined}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={selectable && onClick ? selected : undefined}
      aria-label={describe(view, showBack, cloud)}
    >
      <motion.div
        className="hx-card-enter"
        initial={enterInitial}
        animate={{ opacity: 1, x: 0, y: lift, rotate: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 22, rotate: 7, scale: 0.9, transition: { duration: 0.22 } }}
        transition={enterTransition}
      >
        <div className="hx-card__lift">
          <motion.span
            className="hx-card__shadow"
            initial={flipSeq.current === 0 ? false : undefined}
            animate={{ scaleX: [1, 1.16, 1], scaleY: [1, 1.26, 1], opacity: [0.6, 0.24, 0.6] }}
            transition={reduced ? { duration: 0 } : FLIP}
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
            style={{ rotateX: tiltEnabled ? rotateX : 0, rotateY: tiltEnabled ? rotateY : 0 }}
          >
            <motion.div
              className="hx-card__flip"
              animate={{ rotateY: showBack ? 180 : 0 }}
              initial={false}
              transition={reduced ? { duration: 0 } : FLIP}
            >
              {front}
              {back}
            </motion.div>

            <div className="hx-card__fx">
              {tiltEnabled && <motion.span className="hx-card__glare" style={{ backgroundImage: glare, opacity: sHot }} />}
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
