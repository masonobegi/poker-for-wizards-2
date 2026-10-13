/**
 * The spell on the stack, and the window to answer it.
 *
 * A sigil has been cast. Its card fills the middle of the screen — name, what
 * it does, who cast it and at whom — because a player reported an opponent's
 * Graft landing with no idea what Graft does, and the old panel only ever
 * printed a name, down by the action bar. Anyone holding a counterspell gets
 * a few seconds to answer underneath it.
 *
 * Most casts have nobody to answer them and resolve in a tenth of a second,
 * which used to mean the panel flickered and was gone. The last spell now
 * lingers for LINGER_MS after the stack empties, marked as resolved, so it can
 * actually be read. Clicking it dismisses it early.
 *
 * The stack renders top-down below the featured spell so the resolution
 * order — last cast, first resolved — is visible rather than something you
 * have to have read the rules to know.
 *
 * Once it resolves, the linger shows the stack as the server resolved it
 * (`view.resolvedEntries`), and features the spell that was countered, if one
 * was, under a COUNTERED stamp. A counter happens only during resolution, so
 * the live stack never shows one.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PlayerView, StackEntry, TableView } from '@shared/types';
import { SCHOOLS, defOf, entryDef, type SigilDef } from '@shared/sigils';
import { RELIC_BY_ID } from '@shared/relics';
import { Button } from '@/components/ui/kit';
import { useGame } from '@/store/net';
import { lingerFor, markSeen, timesSeen, usePrefs } from '@/components/shell/prefs';
// From the lazy-loading shim, not the `@/vfx` barrel — see SpellFlight.tsx.
import { shake } from '@/lib/visuals';
import { spellFlight } from '@/components/fx/SpellFlight';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { EASE_OUT, ENTER, ENTER_PANEL, SPRING_CRISP, T_BASE, T_REDUCED } from '@/styles/motion';
import { Mark } from '@/art/marks';
import { Stamp } from '@/components/fx/Stamp';

export interface StackOverlayProps {
  view: TableView;
  me: PlayerView;
  onBeginCast: (uid: string) => void;
}

type ShownEntry = TableView['stackEntries'][number];


const RANKS: Record<number, string> = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights',
  9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};
const SUITS: Record<string, string> = { H: 'Hearts', S: 'Spades', D: 'Diamonds', C: 'Clubs' };

/** Who or what a spell was aimed at, in words, or nothing if it aimed at nothing. */
function aimOf(e: StackEntry, view: TableView): string | null {
  const t = e.targets ?? {};
  if (t.playerId) return view.players.find((p) => p.id === t.playerId)?.name ?? null;
  if (t.rank) return RANKS[t.rank] ?? null;
  if (t.suit) return SUITS[t.suit] ?? null;
  if (t.cardIds?.length) {
    const where = t.cardIds.map((id) => {
      if (view.board.some((c) => c.id === id)) return 'a community card';
      const owner = view.players.find((p) => p.hole?.some((c) => c.id === id));
      if (!owner) return 'a card';
      return owner.isYou ? 'your card' : `${owner.name}’s card`;
    });
    return [...new Set(where)].join(' and ');
  }
  return null;
}

/**
 * The entry the panel features. On a live stack, its top: the spell that
 * resolves first. On a resolved one, the spell that was cancelled, if one was:
 * that is the news, and it is never the top, because a counter answers the
 * entry beneath it. In a counter war, the earliest spell cancelled.
 */
function featuredIndex(entries: readonly StackEntry[], live: boolean): number {
  const cancelled = live ? -1 : entries.findIndex((e) => e.countered);
  return cancelled >= 0 ? cancelled : entries.length - 1;
}

function StackOverlayBase({ view, me, onBeginCast }: StackOverlayProps) {
  const pass = useGame((s) => s.pass);
  const stack = view.stack;
  const mayRespond = !!stack?.pending.includes(me.id);
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotionPref();
  const [{ spellCards }] = usePrefs();
  // Read when the stack empties, not a dependency: changing the setting while
  // a card lingers must not strand it on screen.
  const mode = useRef(spellCards);
  mode.current = spellCards;

  // Keep the last stack on screen for a moment after it resolves.
  const [lingering, setLingering] = useState<ShownEntry[] | null>(null);
  const lingerMs = useRef(0);
  const lastEntries = useRef<ShownEntry[]>([]);
  useEffect(() => {
    if (stack && view.stackEntries.length) {
      lastEntries.current = view.stackEntries;
      setLingering(null);
      return;
    }
    if (!lastEntries.current.length) return;
    const last = lastEntries.current;
    lastEntries.current = [];
    // Linger on the stack as it resolved, not as it last stood. The server
    // unwinds the whole stack at once after clearing it, so a counter is
    // never in any live `stackEntries`: lingering on those showed the spell
    // that was cancelled looking as if it had landed. `resolvedEntries` is
    // the same stack with its outcomes; it is matched by the top entry's id
    // so an older resolution can never stand in for this one.
    const after = view.resolvedEntries ?? [];
    const settled = after.length && after[after.length - 1].id === last[last.length - 1].id ? after : last;
    // Auto judges by the card the panel features.
    const shown = settled[featuredIndex(settled, false)];
    const ms = lingerFor(mode.current, timesSeen(shown.sigilId), !!shown.scribed);
    if (ms <= 0) { setLingering(null); return; }
    markSeen(shown.sigilId);
    lingerMs.current = ms;
    setLingering(settled);
  }, [stack, view.stackEntries, view.resolvedEntries]);
  // The linger's clock belongs to the card, not to the view. Every bet sends
  // a fresh view, and a timer cleared by the effect above re-running left the
  // card over the board (and the showdown) until the next hand.
  useEffect(() => {
    if (!lingering) return undefined;
    const id = window.setTimeout(() => setLingering(null), lingerMs.current);
    return () => window.clearTimeout(id);
  }, [lingering]);
  // A new hand clears anything left over from the last one.
  useEffect(() => { setLingering(null); }, [view.handNumber]);

  // With spell cards Off, a live stack is shown only when you can answer it.
  const live = !!(stack && view.stackEntries.length) && (spellCards !== 'off' || mayRespond);
  const entries: ShownEntry[] = live ? view.stackEntries : (lingering ?? []);

  const responses = (me.sigils ?? []).filter((s) => {
    const def = defOf(s);
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
    if (topId && topId !== prevTopId.current && (spellCards !== 'off' || mayRespond)) shake(4, 140);
    prevTopId.current = topId;
  }, [topId]);

  const handleRespond = (uid: string, originEl: Element, def: SigilDef): void => {
    spellFlight.fireNow(originEl, panelRef.current, def.school, def.id);
    onBeginCast(uid);
  };

  const featured = featuredIndex(entries, live);
  const lead = entries[featured];
  // Everything else, last cast first: under a live stack's top, or around
  // the cancelled spell once the stack has resolved.
  const rest = entries.filter((_, i) => i !== featured).reverse();
  const leadDef = lead ? entryDef(lead) : undefined;
  const leadSchool = lead ? (SCHOOLS[lead.school as keyof typeof SCHOOLS] ?? SCHOOLS.veil) : SCHOOLS.veil;
  const leadAim = lead ? aimOf(lead, view) : null;
  const words = lead?.scribed?.text;

  return (
    <AnimatePresence>
      {entries.length ? (
        <motion.div
          className={`stackview ${live ? '' : 'is-lingering'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={ENTER_PANEL}
        >
          <motion.div
            className="stack-panel hx-plate"
            ref={panelRef}
            // A resolved spell is only being read, so the screen behind it
            // stays live (the scrim lets clicks through) and the card itself
            // dismisses on a click.
            onClick={live ? undefined : () => setLingering(null)}
            initial={reducedMotion ? { opacity: 0 } : { y: 30, scale: 0.92 }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { y: 16, scale: 0.97 }}
            transition={reducedMotion
              ? { duration: T_REDUCED, ease: EASE_OUT }
              : SPRING_CRISP}
          >
            {lead && leadDef ? (
              <section
                className={`stack-feature ${lead.countered ? 'is-countered' : ''}`}
                style={{ ['--school' as string]: leadSchool.accent }}
                aria-live="polite"
              >
                <span className="stack-feature__glyph" aria-hidden>
                  <Mark kind="sigil" id={leadDef.id} fallback={leadDef.glyph} />
                </span>
                <div className="stack-feature__body">
                  <p className="stack-feature__who">
                    {lead.casterId === me.id ? 'You cast' : `${lead.casterName} casts`}
                    {leadAim ? <> &rarr; <strong>{leadAim}</strong></> : null}
                  </p>
                  <h3 className="stack-feature__name hx-gilt--school">{words ? `“${words}”` : lead.sigilName}</h3>
                  <p className="stack-feature__text">{leadDef.text}</p>
                  <p className="stack-feature__state">
                    {lead.countered ? 'Countered — it never happened.'
                      : live ? `${leadSchool.name} · resolves first`
                        : 'Resolved'}
                  </p>
                </div>
                {/* The basketball roguelike's REJECTED!!: the counter is the
                    most dramatic thing a spell can have happen to it, and a
                    strikethrough was all it got. Keyed by the entry, so the
                    next countered spell slams again. */}
                <AnimatePresence>
                  {lead.countered
                    ? <Stamp key={`countered-${lead.id}`} text="COUNTERED" tone="ice" from={2.8} rotate={-7} className="stack-stamp" />
                    : null}
                </AnimatePresence>
              </section>
            ) : null}

            {rest.length ? (
              <>
                <p className="stack-note">
                  {featured === entries.length - 1 ? 'Underneath, resolving after it' : 'The rest of the stack'}
                </p>
                <ol className="stack-list">
                  {rest.map((e, i) => {
                    const def = entryDef(e);
                    const school = SCHOOLS[e.school as keyof typeof SCHOOLS] ?? SCHOOLS.veil;
                    return (
                      <motion.li
                        key={e.id}
                        className={`stack-item ${e.countered ? 'is-countered' : ''}`}
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
                        transition={e.countered
                          ? { duration: T_BASE, ease: EASE_OUT }
                          : { ...ENTER, delay: Math.min(i * 0.06, 0.3) }}
                      >
                        <span className="stack-glyph">{def ? <Mark kind="sigil" id={def.id} fallback={def.glyph} /> : '✦'}</span>
                        <span className="stack-body">
                          <strong>{e.scribed ? `“${e.scribed.text}”` : e.sigilName}</strong>
                          <span className="stack-caster">{e.casterName} — {def?.text}</span>
                        </span>
                        {e.countered ? <span className="stack-badge is-bad">countered</span> : null}
                      </motion.li>
                    );
                  })}
                </ol>
              </>
            ) : null}

            {!live ? (
              <p className="stack-waiting">Click to dismiss.</p>
            ) : mayRespond ? (
              <div className="stack-respond">
                <ResponseTimer closesAt={stack!.closesAt} seconds={view.config.responseSeconds} />
                <p className="stack-ask">Answer it?</p>
                <div className="stack-options">
                  {responses.map((s) => {
                    const def = defOf(s);
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
                {stack!.pending.length
                  ? `Waiting on ${stack!.pending.length} player${stack!.pending.length === 1 ? '' : 's'}…`
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
