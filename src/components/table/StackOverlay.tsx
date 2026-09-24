/**
 * The response window.
 *
 * A sigil has been cast and has not resolved yet. Anyone holding a counterspell
 * gets a few seconds to answer. The stack renders bottom-up so the resolution
 * order — last cast, first resolved — is visible rather than something you have
 * to have read the rules to know.
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PlayerView, TableView } from '@shared/types';
import { SCHOOLS, SIGIL_BY_ID, type SigilDef } from '@shared/sigils';
import { RELIC_BY_ID } from '@shared/relics';
import { Button } from '@/components/ui/kit';
import { useGame } from '@/store/net';
// From the lazy-loading shim, not the `@/vfx` barrel — see SpellFlight.tsx.
import { shake } from '@/lib/visuals';
import { spellFlight } from '@/components/fx/SpellFlight';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { EASE_OUT, ENTER, ENTER_PANEL, SPRING_CRISP, T_BASE, T_REDUCED } from '@/styles/motion';
import { Mark } from '@/art/marks';

export interface StackOverlayProps {
  view: TableView;
  me: PlayerView;
  onBeginCast: (uid: string) => void;
}

function StackOverlayBase({ view, me, onBeginCast }: StackOverlayProps) {
  const pass = useGame((s) => s.pass);
  const stack = view.stack;
  const mayRespond = !!stack?.pending.includes(me.id);
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotionPref();

  const responses = (me.sigils ?? []).filter((s) => {
    const def = SIGIL_BY_ID[s.defId];
    if (!def?.timing.includes('response')) return false;
    let delta = 0;
    for (const id of me.relics) delta += RELIC_BY_ID[id]?.sigils?.costDelta ?? 0;
    return me.mana >= Math.max(1, def.cost + delta);
  });

  // A tiny impact tap each time a new sigil lands on the stack — the panel's
  // own spring already sells the "slam", this just adds a bit of weight to it.
  const topId = view.stackEntries.length ? view.stackEntries[view.stackEntries.length - 1].id : null;
  const prevTopId = useRef<string | null>(null);
  useEffect(() => {
    if (topId && topId !== prevTopId.current) shake(4, 140);
    prevTopId.current = topId;
  }, [topId]);

  const handleRespond = (uid: string, originEl: Element, def: SigilDef): void => {
    spellFlight.fireNow(originEl, panelRef.current, def.school, def.id);
    onBeginCast(uid);
  };

  return (
    <AnimatePresence>
      {stack && view.stackEntries.length ? (
        <motion.div
          className="stackview"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={ENTER_PANEL}
        >
          <motion.div
            className="stack-panel"
            ref={panelRef}
            initial={reducedMotion ? { opacity: 0 } : { y: 60, scale: 0.9 }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { y: 24, scale: 0.96 }}
            transition={reducedMotion
              ? { duration: T_REDUCED, ease: EASE_OUT }
              : SPRING_CRISP}
          >
            <header className="stack-head">
              <span className="eyebrow">The Stack</span>
              <span className="stack-note">Last cast resolves first</span>
            </header>

            <ol className="stack-list">
              {[...view.stackEntries].reverse().map((e, i) => {
                const def = SIGIL_BY_ID[e.sigilId];
                const school = SCHOOLS[e.school as keyof typeof SCHOOLS] ?? SCHOOLS.veil;
                return (
                  <motion.li
                    key={e.id}
                    className={`stack-item ${e.countered ? 'is-countered' : ''} ${i === 0 ? 'is-top' : ''}`}
                    style={{ ['--school' as string]: school.accent }}
                    initial={{ opacity: 0, x: -20 }}
                    // The counterspell punch lives here rather than in a CSS
                    // keyframe: the stack is a rapid, reversible surface
                    // (counter, counter-the-counter), and two systems writing
                    // `transform` to one node meant a second hit restarted the
                    // first from zero.
                    animate={e.countered && !reducedMotion
                      ? { opacity: 0.45, x: [0, -7, 5, -2, 0] }
                      : { opacity: e.countered ? 0.45 : 1, x: 0 }}
                    // The punch must not inherit the entrance stagger —
                    // feedback on a reactive surface has to be immediate.
                    transition={e.countered
                      ? { duration: T_BASE, ease: EASE_OUT }
                      : { ...ENTER, delay: Math.min(i * 0.06, 0.3) }}
                  >
                    <span className="stack-glyph">{def ? <Mark kind="sigil" id={def.id} fallback={def.glyph} /> : '✦'}</span>
                    <span className="stack-body">
                      <strong>{e.sigilName}</strong>
                      <span className="stack-caster">{e.casterName}</span>
                    </span>
                    {i === 0 ? <span className="stack-badge">resolves first</span> : null}
                    {e.countered ? <span className="stack-badge is-bad">countered</span> : null}
                  </motion.li>
                );
              })}
            </ol>

            {mayRespond ? (
              <div className="stack-respond">
                <ResponseTimer closesAt={stack.closesAt} seconds={view.config.responseSeconds} />
                <p className="stack-ask">Answer it?</p>
                <div className="stack-options">
                  {responses.map((s) => {
                    const def = SIGIL_BY_ID[s.defId];
                    if (!def) return null;
                    const school = SCHOOLS[def.school];
                    return (
                      <button
                        key={s.uid}
                        className="stack-option"
                        style={{ ['--school' as string]: school.accent }}
                        onClick={(ev) => handleRespond(s.uid, ev.currentTarget, def)}
                      >
                        <span className="stack-optglyph"><Mark kind="sigil" id={def.id} fallback={def.glyph} /></span>
                        <span>
                          <strong>{def.name}</strong>
                          <em>{def.text}</em>
                        </span>
                        <span className="stack-optcost mono">{def.cost}</span>
                      </button>
                    );
                  })}
                  {responses.length === 0 ? (
                    <p className="stack-none">Nothing in hand can answer this.</p>
                  ) : null}
                </div>
                <Button tone="ghost" block onClick={pass}>
                  Let it resolve
                </Button>
              </div>
            ) : (
              <p className="stack-waiting">
                {stack.pending.length
                  ? `Waiting on ${stack.pending.length} player${stack.pending.length === 1 ? '' : 's'}…`
                  : 'Resolving…'}
              </p>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * A linear drain, run by the compositor rather than by React. This was a
 * `requestAnimationFrame` calling `setState` per frame to write a `scaleX`
 * that CSS can interpolate on its own — and the element it drives already had
 * `transform-origin: left` and `will-change: transform` set up for exactly
 * that. `closesAt` is a wall-clock deadline, so a reconnect part-way through
 * the response window resumes at the right width.
 */
function ResponseTimer({ closesAt, seconds }: { closesAt: number; seconds: number }) {
  // Read the clock ONCE per response window, not once per render.
  //
  // `closesAt` is stable for the life of a window, so `key` does not change on
  // a re-render — but the parent re-renders on every `view` update, and
  // recomputing these from a fresh `Date.now()` rewrote the custom properties
  // underneath an animation that was already running. The keyframe would then
  // re-evaluate its endpoints against a new duration while keeping its
  // original start time, and the bar visibly jumped backwards. Reading the
  // clock in a memo keyed on the window fixes both that and the render-purity
  // problem (StrictMode double-renders produced two different values).
  const ring = useMemo(() => {
    if (!closesAt) return null;
    const leftMs = Math.max(0, closesAt - Date.now());
    return { leftMs, from: Math.min(1, leftMs / (seconds * 1000)) };
  }, [closesAt, seconds]);

  if (ring === null) return null;

  return (
    <div className="stack-timer" aria-hidden>
      <div
        key={closesAt}
        className="stack-timerfill"
        style={{
          ['--stack-from' as string]: String(ring.from),
          ['--stack-ms' as string]: `${ring.leftMs}ms`,
        }}
      />
    </div>
  );
}

export default memo(StackOverlayBase);
