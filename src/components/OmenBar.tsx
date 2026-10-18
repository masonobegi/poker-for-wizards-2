/**
 * The omens in force.
 *
 * These are the rules that have been added to the table since the game began,
 * and they never come off. Keeping them permanently on screen is not optional:
 * by ante four a player genuinely cannot reason about their hand without
 * knowing that suits have merged and a rank has been struck out.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  /*
   * Hovering and clicking are two different intentions, and conflating them
   * is why "you still can't click the omens" came back twice after the panel
   * itself was fixed.
   *
   * There was one piece of state and three handlers writing it: pointer-enter
   * opened it, pointer-leave closed it, and click toggled. So a click — which
   * is always preceded by a pointer-enter — found it already open and closed
   * it again. Measured, in a browser, on a real table: hover → panel up,
   * click → panel gone. A tap on a touchscreen opened it on the synthetic
   * enter and shut it on the click that followed. There was no gesture that
   * left it readable, and moving the mouse off to read it dismissed it.
   *
   * So hovering previews and clicking pins. A pinned omen stays up when the
   * pointer leaves, which is the whole point of clicking one, and clicking it
   * again — or Escape, or a click anywhere else — puts it away.
   */
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const open = pinned ?? hovered;
  const setOpen = setHovered;
  /**
   * Where the open chip is, in window coordinates.
   *
   * The panel is portaled to <body>. It has to be: this bar lives in the
   * table header, which sets `overflow: hidden` so nothing can push a second
   * row down over the felt — and `.tbl-top-r .omens` clips as well. A panel
   * absolutely positioned inside either of them opens correctly and is then
   * thrown away by the clip, which is why clicking an omen appeared to do
   * nothing at all.
   */
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const reduced = useReducedMotionPref();

  // A pinned panel is dismissed the two ways anything else on this table is.
  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent): void => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.('.omens') && !t?.closest?.('.omen-tip')) setPinned(null);
    };
    /* Capture, and consume. Escape at a table otherwise opens the system
       menu (see shell/SystemMenu), so dismissing a pinned omen also paused
       the game — two things from one key. Taking it in the capture phase and
       stopping it there means Escape closes the panel and nothing else. */
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setPinned(null);
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [pinned]);

  const openAt = (id: string, el: HTMLElement | null): void => {
    const r = el?.getBoundingClientRect();
    if (r) setAt({ x: Math.min(Math.max(r.left + r.width / 2, 170), window.innerWidth - 170), y: r.bottom + 8 });
    setOpen(id);
  };

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
            const isPinned = pinned === o.id;
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
                  className={`omen ${showing ? 'is-open' : ''} ${isPinned ? 'is-pinned' : ''}`}
                  onPointerEnter={(e) => openAt(o.id, e.currentTarget)}
                  onPointerLeave={() => setOpen((v) => (v === o.id ? null : v))}
                  onFocus={(e) => openAt(o.id, e.currentTarget)}
                  onBlur={() => setOpen((v) => (v === o.id ? null : v))}
                  onClick={(e) => {
                    // Pin, or unpin if this one is already pinned. Never
                    // reads the hover state, which is what used to make a
                    // click close the panel the hover had just opened.
                    if (pinned === o.id) { setPinned(null); return; }
                    openAt(o.id, e.currentTarget);
                    setPinned(o.id);
                  }}
                  aria-expanded={showing}
                  title={`${def.name} — ${def.text}`}
                >
                  <span className="omen-glyph" aria-hidden><Mark kind="omen" id={def.id} fallback={def.glyph} /></span>
                  <span className="omen-name">{def.name}</span>
                  {o.rank ? <span className="omen-rank">{RANK_NAME[o.rank]}s</span> : null}
                  <span className="omen-ask" aria-hidden>?</span>
                </button>

                {createPortal(
                  <AnimatePresence>
                  {showing && at ? (
                    <motion.div
                      className="omen-tip"
                      role="tooltip"
                      style={{ left: at.x, top: at.y }}
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
                      <span className="omen-since">
                        {isPinned
                          ? 'Click the omen again, or press Escape, to put this away'
                          : 'Every omen so far is in force at once'}
                      </span>
                    </motion.div>
                  ) : null}
                  </AnimatePresence>,
                  document.body,
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export default memo(OmenBarBase);
