import { forwardRef, memo, useEffect, useRef } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { useFinePointer } from '@/components/fx/useFinePointer';
import { usePointerFoil } from '@/components/fx/usePointerFoil';
import { SCHOOLS, SIGIL_BY_ID, RARITY_COLOR, type Rarity, type SigilInstance } from '@shared/sigils';
import { EASE_OUT, ENTER_PANEL, SPRING_CRISP, T_REDUCED } from '@/styles/motion';

/**
 * How hard a sigil glints under the pointer. The playing cards have had a
 * specular highlight since the start and the sigils — the things the game is
 * named after — had none, so a rail of spells read flatter than the board it
 * sits under. Scaling it by rarity does the job a foil finish does on a real
 * card: you can tell a mythic from across the table without reading it.
 */
const FOIL: Record<Rarity, number> = { common: 0.16, rare: 0.26, mythic: 0.4 };
const FOIL_TILT = 7;

export interface SigilCardProps {
  inst: SigilInstance;
  castable: boolean;
  cost: number;
  affordable: boolean;
  selected?: boolean;
  onCast?: (uid: string) => void;
  onDiscard?: (uid: string) => void;
  index?: number;
  compact?: boolean;
}

/**
 * `AnimatePresence mode="popLayout"` clones its children with a ref, so this
 * has to forward one. Without it React logs a "Function components cannot be
 * given refs" error on every re-render of the sigil hand.
 */
const SigilCardBase = forwardRef<HTMLDivElement, SigilCardProps>(function SigilCardBase({
  inst, castable, cost, affordable, selected, onCast, onDiscard, index = 0, compact,
}: SigilCardProps, ref) {
  const def = SIGIL_BY_ID[inst.defId];
  // `usable` must be computed before any early return so the hooks below
  // always run in the same order, whether or not `def` resolves.
  const usable = !!def && castable && affordable;

  // A quick pop the instant a sigil crosses from locked to castable (mana
  // just filled the last pip) — a "you can act now" cue, not a loop.
  //
  // Driven imperatively rather than by a class-toggled keyframe: mana crosses
  // a sigil's cost repeatedly inside one betting round, and a boolean that is
  // already `true` never re-renders, so the old version silently swallowed
  // every re-trigger inside its own 260ms window.
  const wasUsable = useRef(usable);
  const pop = useAnimationControls();
  const reduced = useReducedMotionPref();
  const finePointer = useFinePointer();
  const foil = usePointerFoil({
    tilt: FOIL_TILT,
    strength: FOIL[def?.rarity ?? 'common'],
    spread: 64,
  });
  useEffect(() => {
    const crossed = usable && !wasUsable.current;
    wasUsable.current = usable;
    if (!crossed || reduced) return;
    void pop.start({
      scale: [1, 1.08, 1],
      transition: { ...ENTER_PANEL, times: [0, 0.45, 1] },
    });
  }, [usable, reduced, pop]);

  if (!def) return null;
  const school = SCHOOLS[def.school];

  return (
    <motion.div
      ref={ref}
      className={[
        'sigil',
        usable ? 'is-castable' : 'is-locked',
        selected ? 'is-selected' : '',
        compact ? 'is-compact' : '',
      ].filter(Boolean).join(' ')}
      data-sigil-uid={inst.uid}
      style={{
        ['--school' as string]: school.accent,
        ['--school-deep' as string]: school.glow,
        ['--rarity' as string]: RARITY_COLOR[def.rarity],
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, rotateZ: -4 }}
      animate={{ opacity: 1, y: 0, rotateZ: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.9 }}
      transition={reduced
        ? { duration: T_REDUCED, ease: EASE_OUT }
        : { ...SPRING_CRISP, delay: Math.min(index * 0.06, 0.3) }}
      whileHover={finePointer && !reduced ? (usable ? { y: -14, scale: 1.05, zIndex: 5 } : { y: -5 }) : undefined}
      whileTap={usable ? { y: -10, scale: 0.99 } : undefined}
      onPointerMove={foil.onPointerMove}
      onPointerEnter={foil.onPointerEnter}
      onPointerLeave={foil.onPointerLeave}
      onClick={() => { if (usable) onCast?.(inst.uid); }}
      role={usable ? 'button' : undefined}
      tabIndex={usable ? 0 : -1}
      onKeyDown={(e) => { if (usable && e.key === 'Enter') onCast?.(inst.uid); }}
      aria-label={`${def.name}, ${cost} mana`}
    >
      <motion.div
        className="sigil-frame"
        animate={pop}
        style={foil.on ? { rotateX: foil.rotateX, rotateY: foil.rotateY } : undefined}
      >
        {foil.on ? (
          <motion.span
            className="sigil-foil"
            aria-hidden
            style={{ backgroundImage: foil.sheen, opacity: foil.sheenOpacity }}
          />
        ) : null}
        <header className="sigil-head">
          <span className="sigil-cost mono">{cost}</span>
          <span className="sigil-school">
            {def.timing.includes('response') ? 'Response' : school.name}
          </span>
        </header>

        <div className="sigil-glyph">{def.glyph}</div>

        <h4 className="sigil-name">{def.name}</h4>

        {!compact ? <p className="sigil-text">{def.text}</p> : null}

        <footer className="sigil-foot">
          <span className="sigil-rarity">{def.rarity}</span>
        </footer>
      </motion.div>

      {onDiscard ? (
        <button
          className="sigil-discard"
          title="Unmake for 1 mana"
          aria-label={`Unmake ${def.name} for one mana`}
          onClick={(e) => { e.stopPropagation(); onDiscard(inst.uid); }}
        >
          ⌫
        </button>
      ) : null}

      <div className="sigil-tip" role="tooltip">
        <strong>{def.name}</strong>
        <p>{def.text}</p>
        <p className="sigil-impossible"><span aria-hidden>⧉</span> {def.impossible}</p>
        {!affordable ? <p className="sigil-warn">Not enough mana.</p> : null}
        {affordable && !castable ? <p className="sigil-warn">Cannot be cast right now.</p> : null}
      </div>
    </motion.div>
  );
});

export default memo(SigilCardBase);
