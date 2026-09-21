/**
 * Contextual first-time hints.
 *
 * A fully self-contained overlay: it reads the table view straight from the
 * game store, so it needs no props and no wiring beyond being mounted
 * somewhere in the tree. One coach mark shows at a time, in priority order;
 * each is marked seen (persisted, see `hintsStore.ts`) the moment it's shown,
 * so it never appears twice, and it auto-fades on its own after a few seconds
 * on top of the manual dismiss — it never blocks a click or steals focus.
 *
 * Mount point: see the report for where to add `<Hints />` in `GameTable.tsx`.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useView } from '@/store/net';
import type { TableView } from '@shared/types';
import { useHints } from './hintsStore';
import './onboarding.css';

interface HintDef {
  id: string;
  place: 'rail' | 'stack' | 'shop';
  text: string;
  match: (view: TableView) => boolean;
}

// Priority order: the response window is time-boxed, so it wins ties.
const HINTS: HintDef[] = [
  {
    id: 'response_window',
    place: 'stack',
    text: "A spell is on the stack. If you're holding a counter, this is your window to answer.",
    match: (v) => !!v.stack && v.stack.pending.includes(v.youId),
  },
  {
    id: 'castable_sigil',
    place: 'rail',
    text: 'That sigil is ready to cast — tap it to put it on the stack.',
    match: (v) => v.castable.length > 0,
  },
  {
    id: 'shop_open',
    place: 'shop',
    text: 'The Market is open. Spend shards on sigils, relics, and rites for the rest of the run.',
    match: (v) => v.phase === 'shop',
  },
];

const DISMISS_MS = 7000;

export default function Hints() {
  const view = useView();
  const seen = useHints((s) => s.seen);
  const markSeen = useHints((s) => s.markSeen);
  const reduced = useReducedMotion() === true;
  const [shown, setShown] = useState<HintDef | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // Pick the next not-yet-seen, currently-true hint once nothing is showing.
  useEffect(() => {
    if (shown || !view) return;
    const candidate = HINTS.find((h) => !seen[h.id] && h.match(view));
    if (!candidate) return;
    setShown(candidate);
    markSeen(candidate.id);
  }, [view, shown, seen, markSeen]);

  // Auto-fade after a few seconds, independent of the seen-map update above,
  // so a rapidly-changing table state can't flicker it or re-trigger it.
  useEffect(() => {
    if (!shown) return;
    timer.current = window.setTimeout(() => setShown(null), DISMISS_MS);
    return () => window.clearTimeout(timer.current);
  }, [shown]);

  return (
    <div className="hints-layer">
      <AnimatePresence>
        {shown ? (
          <motion.div
            key={shown.id}
            className={`hint-mark hint-mark--${shown.place}`}
            role="status"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: reduced ? 0.01 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="hint-mark__text">{shown.text}</span>
            <button
              type="button"
              className="hint-mark__dismiss"
              aria-label="Dismiss tip"
              onClick={() => setShown(null)}
            >
              &times;
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
