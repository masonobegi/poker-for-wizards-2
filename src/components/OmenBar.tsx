/**
 * The omens in force.
 *
 * These are the rules that have been added to the table since the game began,
 * and they never come off. Keeping them permanently on screen is not optional:
 * by ante four a player genuinely cannot reason about their hand without
 * knowing that suits have merged and a rank has been struck out.
 */
import { memo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { OMEN_BY_ID, type ActiveOmen } from '@shared/omens';
import { RANK_NAME } from '@shared/cards';
import './omens.css';
import { EASE_OUT, EASE_SNAP, ENTER, T_REDUCED } from '@/styles/motion';
import { Mark } from '@/art/marks';
import { useBannerIdle } from '@/components/BannerLayer';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { flashPeak, motionPrefs } from '@/components/fx/arcade';

function OmenBarBase({ omens }: { omens: ActiveOmen[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const reduced = useReducedMotionPref();

  // A new omen is announced first and lands second. Its banner names it in
  // the middle of the screen; only once that banner has gone does the chip
  // slam into the bar, which is where the eye goes next. Landing together,
  // the chip arrived under a full-screen announcement and was never seen
  // arriving. Omens already here when the bar mounted have landed.
  const bannerIdle = useBannerIdle();
  const landed = useRef<Set<string> | null>(null);
  if (landed.current === null) landed.current = new Set(omens.map((o) => o.id));
  const landedIds = landed.current;
  if (bannerIdle) for (const o of omens) landedIds.add(o.id);

  if (omens.length === 0) return null;
  const peak = flashPeak(motionPrefs());

  return (
    <div className="omens" aria-label="Rules in force at this table">
      <span className="omens-label">Omens</span>
      <ul className="omens-list">
        <AnimatePresence initial={false}>
          {omens.map((o) => {
            const def = OMEN_BY_ID[o.id];
            if (!def) return null;
            const showing = open === o.id;
            return (
              <motion.li
                key={o.id}
                layout
                // The arcade slam (see fx/arcade.ts): in at 1.8x, down through
                // an overshoot, two frames of white on contact. The scale
                // shorthand rather than a transform string here, because
                // `layout` composes its own projection into this element's
                // transform and a whole-string transform would fight it.
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.8, filter: `brightness(${peak})` }}
                animate={!landedIds.has(o.id)
                  ? { opacity: 0 }
                  : reduced
                    ? { opacity: 1 }
                    : { opacity: 1, scale: 1, filter: [`brightness(${peak})`, `brightness(${peak})`, 'brightness(1)'] }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={reduced
                  ? { duration: T_REDUCED, ease: EASE_OUT }
                  : {
                    scale: { duration: 0.22, ease: EASE_SNAP },
                    opacity: { duration: 0.06 },
                    filter: { duration: 0.26, times: [0, 0.4, 1], ease: 'linear' },
                    layout: { duration: 0.26, ease: EASE_OUT },
                  }}
              >
                <button
                  className={`omen ${showing ? 'is-open' : ''}`}
                  onPointerEnter={() => setOpen(o.id)}
                  onPointerLeave={() => setOpen((v) => (v === o.id ? null : v))}
                  onFocus={() => setOpen(o.id)}
                  onBlur={() => setOpen((v) => (v === o.id ? null : v))}
                  onClick={() => setOpen((v) => (v === o.id ? null : o.id))}
                  aria-expanded={showing}
                  title={`${def.name} — ${def.text}`}
                >
                  <span className="omen-glyph" aria-hidden><Mark kind="omen" id={def.id} fallback={def.glyph} /></span>
                  <span className="omen-name">{def.name}</span>
                  {o.rank ? <span className="omen-rank">{RANK_NAME[o.rank]}s</span> : null}
                  <span className="omen-ask" aria-hidden>?</span>
                </button>

                <AnimatePresence>
                  {showing ? (
                    <motion.div
                      className="omen-tip"
                      role="tooltip"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={ENTER}
                    >
                      <strong>{def.name}</strong>
                      <p className="omen-what">A rule added to this table at ante {o.ante}. It never comes off.</p>
                      <p>
                        {def.text}
                        {o.rank ? ` The rank is ${RANK_NAME[o.rank]}s.` : ''}
                      </p>
                      <p className="omen-impossible">
                        <Mark kind="ui" id="impossible" /> {def.impossible}
                      </p>
                      <span className="omen-since">Every omen so far is in force at once</span>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export default memo(OmenBarBase);
