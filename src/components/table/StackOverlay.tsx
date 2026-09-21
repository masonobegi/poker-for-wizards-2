/**
 * The response window.
 *
 * A sigil has been cast and has not resolved yet. Anyone holding a counterspell
 * gets a few seconds to answer. The stack renders bottom-up so the resolution
 * order — last cast, first resolved — is visible rather than something you have
 * to have read the rules to know.
 */
import { memo, useEffect, useRef, useState } from 'react';
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
    spellFlight.fireNow(originEl, panelRef.current, def.school, def.glyph);
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
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="stack-panel"
            ref={panelRef}
            initial={reducedMotion ? { opacity: 0 } : { y: 60, scale: 0.9 }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { y: 24, scale: 0.96 }}
            transition={reducedMotion
              ? { duration: 0.12 }
              : { type: 'spring', stiffness: 460, damping: 26, mass: 0.9 }}
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
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <span className="stack-glyph">{def?.glyph ?? '✦'}</span>
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
                        <span className="stack-optglyph">{def.glyph}</span>
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

function ResponseTimer({ closesAt, seconds }: { closesAt: number; seconds: number }) {
  const [pct, setPct] = useState(1);

  useEffect(() => {
    if (!closesAt) { setPct(1); return; }
    let raf = 0;
    const tick = () => {
      const left = Math.max(0, closesAt - Date.now());
      setPct(Math.min(1, left / (seconds * 1000)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [closesAt, seconds]);

  return (
    <div className="stack-timer" aria-hidden>
      <div className="stack-timerfill" style={{ transform: `scaleX(${pct})` }} />
    </div>
  );
}

export default memo(StackOverlayBase);
