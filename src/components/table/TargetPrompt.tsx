/**
 * Target pickers for sigils that ask for something other than a card or a seat:
 * a rank, a suit, or a mark to inscribe.
 */
import { useLayoutEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { MARKS, RANK_LABEL, RANK_NAME, SUITS, SUIT_GLYPH, SUIT_NAME, isRed, type MarkId, type Rank } from '@shared/cards';
import { SCHOOLS, type SigilDef } from '@shared/sigils';
import type { SigilTargets } from '@shared/types';
import { Button } from '@/components/ui/kit';
import { EASE_OUT, ENTER_PANEL, SPRING_SOFT, T_REDUCED } from '@/styles/motion';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { Mark } from '@/art/marks';

const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const RITE_MARKS: MarkId[] = ['blooded', 'prism', 'echo', 'wild', 'leaden', 'cursed'];

export interface TargetPromptProps {
  def: SigilDef;
  onCancel: () => void;
  onConfirm: (targets: SigilTargets) => void;
}

export default function TargetPrompt({ def, onCancel, onConfirm }: TargetPromptProps) {
  const school = SCHOOLS[def.school];
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPref();

  // `transform-origin` in px resolves against the element's own border box, so
  // the viewport-space point Rail published has to be rebased once the panel
  // has a rect. useLayoutEffect so the first animated frame already has it.
  useLayoutEffect(() => {
    const el = panelRef.current;
    const root = document.documentElement;
    const ox = root.style.getPropertyValue('--prompt-origin-x');
    const oy = root.style.getPropertyValue('--prompt-origin-y');
    if (el && ox && oy) {
      // `getBoundingClientRect()` reports the VISUAL box, and framer has
      // already written `initial`'s scale(0.92) into the style attribute by
      // the time this runs — so the rect is 8% smaller than the layout box
      // that `transform-origin` resolves against. Measuring it directly put
      // the origin out by several percent of the panel width.
      //
      // A scale about the default centre origin leaves the centre where it
      // is, so the rect's centre is still the layout centre. Rebuild the
      // untransformed top-left from that centre and the layout size.
      const r = el.getBoundingClientRect();
      const left = (r.left + r.width / 2) - el.offsetWidth / 2;
      const top = (r.top + r.height / 2) - el.offsetHeight / 2;
      el.style.transformOrigin = `${parseFloat(ox) - left}px ${parseFloat(oy) - top}px`;
    }
    return () => {
      // Don't let the next cast inherit a stale origin.
      root.style.removeProperty('--prompt-origin-x');
      root.style.removeProperty('--prompt-origin-y');
    };
  }, []);

  return (
    <motion.div
      className="prompt"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={ENTER_PANEL}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <motion.div
        ref={panelRef}
        className="prompt-panel"
        style={{ ['--school' as string]: school.accent }}
        // Scale only. With a real origin the growth already says where this
        // came from; a travel on top of it would read as a second, unrelated
        // motion.
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        transition={reduced ? { duration: T_REDUCED, ease: EASE_OUT } : SPRING_SOFT}
      >
        <header className="prompt-head">
          <span className="prompt-glyph"><Mark kind="sigil" id={def.id} fallback={def.glyph} /></span>
          <div>
            <h3>{def.name}</h3>
            <p>{def.text}</p>
          </div>
        </header>

        {def.target === 'rank' ? (
          <>
            <p className="prompt-ask">Name a rank</p>
            <div className="prompt-ranks">
              {RANKS.map((r) => (
                <button
                  key={r}
                  className="prompt-rank"
                  title={RANK_NAME[r]}
                  onClick={() => onConfirm({ rank: r })}
                >
                  {RANK_LABEL[r]}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {def.target === 'suit' ? (
          <>
            <p className="prompt-ask">Name a suit</p>
            <div className="prompt-suits">
              {SUITS.map((s) => (
                <button
                  key={s}
                  className={`prompt-suit ${isRed(s) ? 'is-red' : ''}`}
                  title={SUIT_NAME[s]}
                  onClick={() => onConfirm({ suit: s })}
                >
                  {SUIT_GLYPH[s]}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {def.id === 'inscribe' ? (
          <>
            <p className="prompt-ask">Choose the mark</p>
            <div className="prompt-marks">
              {RITE_MARKS.map((m) => (
                <button
                  key={m}
                  className="prompt-mark"
                  style={{ ['--mark' as string]: MARKS[m].color }}
                  onClick={() => onConfirm({ markId: m })}
                >
                  <span className="prompt-markglyph"><Mark kind="card" id={m} fallback={MARKS[m].glyph} /></span>
                  <strong>{MARKS[m].name}</strong>
                  <em>{MARKS[m].blurb}</em>
                </button>
              ))}
            </div>
          </>
        ) : null}

        <p className="prompt-impossible"><Mark kind="ui" id="impossible" /> {def.impossible}</p>

        <Button tone="ghost" block onClick={onCancel}>Cancel</Button>
      </motion.div>
    </motion.div>
  );
}
