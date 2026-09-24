/**
 * The first-run "How this works" flow.
 *
 * Eight panels, each making exactly one point, built from the real `Card`
 * component and sigil data rather than screenshots or prose. Shown
 * automatically the first time the game is opened (see `hasSeenIntro` /
 * `markIntroSeen`, backed by `localStorage['hexhold.seenIntro']`) and
 * reachable any time afterwards from the menu.
 */
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { Button } from '@/components/ui/kit';
import { Card } from '@/components/card/Card';
import { CardRow } from '@/components/card/CardRow';
import { SIGIL_BY_ID } from '@shared/sigils';
import { RELICS } from '@shared/relics';
import SigilTile from './SigilTile';
import {
  HOLE_DEMO, FLOP_DEMO, QUANTUM_DEMO, SEALED_DEMO, DIVERGED_DEMO,
  FIVE_OF_A_KIND, FLUSH_HOUSE, FLUSH_FIVE,
} from './demo';
import './onboarding.css';
import { EASE_OUT, ENTER, T_REDUCED } from '@/styles/motion';
import { Mark } from '@/art/marks';
import { covenOf } from '@shared/covens';
import { SCHOOLS } from '@shared/sigils';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const SEEN_KEY = 'hexhold.seenIntro';

export function hasSeenIntro(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

export function markIntroSeen(): void {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
}

// ---------------------------------------------------------------------------
// Panel visuals — module-scope so they never remount mid-flow
// ---------------------------------------------------------------------------

function HoldemVisual() {
  return (
    <div className="intro-visual intro-holdem">
      <div className="intro-holdem__group">
        <span className="intro-visual__label">Your hand</span>
        <CardRow views={HOLE_DEMO} size="md" fan fanSpread={12} tiltOnHover />
      </div>
      <div className="intro-holdem__group">
        <span className="intro-visual__label">The flop</span>
        <CardRow views={FLOP_DEMO} size="md" tiltOnHover />
      </div>
    </div>
  );
}

function ManaMeter({ label, value, max, warn }: {
  label: string; value: number; max: number; warn?: boolean;
}) {
  return (
    <div className={`intro-mana ${warn ? 'is-warn' : ''}`}>
      <span className="intro-mana__label">{label}</span>
      <span className="intro-mana__pips" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <i key={i} className={`intro-mana__pip ${i < value ? 'is-lit' : ''}`} />
        ))}
      </span>
      <span className="intro-mana__value mono">{value}/{max}</span>
    </div>
  );
}

function ManaVisual() {
  return (
    <div className="intro-visual intro-mana-row">
      <ManaMeter label="You" value={2} max={5} />
      <ManaMeter label="The player across the table" value={5} max={5} warn />
    </div>
  );
}

const CAST_DEF = SIGIL_BY_ID.burn;
const RESPONSE_DEF = SIGIL_BY_ID.nullify;

function SigilVisual() {
  return (
    <div className="intro-visual">
      <SigilTile def={CAST_DEF} />
    </div>
  );
}

function StackVisual() {
  return (
    <div className="intro-visual intro-stack">
      <div className="intro-stack__item">
        <SigilTile def={CAST_DEF} compact order="cast 1st · resolves 2nd" />
      </div>
      <div className="intro-stack__arrow" aria-hidden="true">⌄</div>
      <div className="intro-stack__item intro-stack__item--response">
        <SigilTile def={RESPONSE_DEF} compact order="cast 2nd · resolves 1st" />
      </div>
    </div>
  );
}

function DeckBreaksVisual() {
  return (
    <div className="intro-visual intro-trio">
      <div className="intro-trio__item">
        <Card view={QUANTUM_DEMO} size="md" tiltOnHover />
        <span className="intro-visual__label">Superposed</span>
      </div>
      <div className="intro-trio__item">
        <Card view={SEALED_DEMO} size="md" tiltOnHover />
        <span className="intro-visual__label">Sealed rank</span>
      </div>
      <div className="intro-trio__item">
        <Card view={DIVERGED_DEMO} size="md" tiltOnHover />
        <span className="intro-visual__label">Divergent</span>
      </div>
    </div>
  );
}

function HandsVisual() {
  return (
    <div className="intro-visual intro-hands">
      <div className="intro-hands__item">
        <CardRow views={FIVE_OF_A_KIND} size="sm" overlap={0.42} tiltOnHover={false} />
        <span className="intro-visual__label">Five of a Kind</span>
      </div>
      <div className="intro-hands__item">
        <CardRow views={FLUSH_HOUSE} size="sm" overlap={0.42} tiltOnHover={false} />
        <span className="intro-visual__label">Flush House</span>
      </div>
      <div className="intro-hands__item">
        <CardRow views={FLUSH_FIVE} size="sm" overlap={0.42} tiltOnHover={false} />
        <span className="intro-visual__label">Flush Five</span>
      </div>
    </div>
  );
}

const SHOP_RELIC = RELICS.find((r) => r.id === 'deep_well') ?? RELICS[0];
const SHOP_SIGIL = SIGIL_BY_ID.mirror;

function ShopVisual() {
  return (
    <div className="intro-visual intro-shop">
      <div className="intro-shop__tile">
        <span className="intro-shop__glyph" aria-hidden="true"><Mark kind="relic" id={SHOP_RELIC.id} fallback={SHOP_RELIC.glyph} /></span>
        <span className="intro-shop__name">{SHOP_RELIC.name}</span>
        <span className="intro-shop__price mono">{SHOP_RELIC.price} shards</span>
      </div>
      <div className="intro-shop__tile">
        <span className="intro-shop__glyph" aria-hidden="true"><Mark kind="sigil" id={SHOP_SIGIL.id} fallback={SHOP_SIGIL.glyph} /></span>
        <span className="intro-shop__name">{SHOP_SIGIL.name}</span>
        <span className="intro-shop__price mono">{SHOP_SIGIL.price} shards</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

interface Panel {
  id: string;
  kicker: string;
  title: string;
  body: string;
  Visual: ComponentType;
}

const PANELS: Panel[] = [
  {
    id: 'holdem',
    kicker: 'First things first',
    title: "You already know this game.",
    body: "Two hole cards. Five community cards. Four rounds of betting. Best five-card hand takes the pot — that part never changes.",
    Visual: HoldemVisual,
  },
  {
    id: 'mana',
    kicker: 'The one new resource',
    title: 'Mana. It refills every street.',
    body: "You gain mana each betting round and spend it casting sigils. It's public — everyone at the table can see exactly how much you're sitting on.",
    Visual: ManaVisual,
  },
  {
    id: 'sigils',
    kicker: 'Spells, not chips',
    title: "Sigils are spells. Here's one.",
    body: 'Every sigil does one clear thing, for a cost in mana. This one destroys a community card outright — the board gets shorter, and nothing replaces it.',
    Visual: SigilVisual,
  },
  {
    id: 'stack',
    kicker: 'The stack',
    title: 'Casting opens a response window.',
    body: "Anyone holding a counterspell can answer. The stack resolves top-down, so the last spell cast is the first to resolve — a Nullify played after yours eats it before it fires.",
    Visual: StackVisual,
  },
  {
    id: 'deck',
    kicker: 'None of this is a real deck',
    title: 'The deck breaks, on purpose.',
    body: "A card can hold two identities until someone looks. A named rank can be dealt face-down before anyone's seen it. The same card can read differently to different players — and both readings score.",
    Visual: DeckBreaksVisual,
  },
  {
    id: 'hands',
    kicker: 'Above a Straight Flush',
    title: "Hands a real deck can't make.",
    body: 'Wild marks and mirrored cards reach three hands fifty-two cards never could. Win with one and the whole table notices.',
    Visual: HandsVisual,
  },
  {
    id: 'shop',
    kicker: 'Between antes',
    title: 'Spend what you win.',
    body: 'Blinds climb every few hands. Between antes, the Market opens — spend shards on sigils, relics, and rites that carry into the rest of the run.',
    Visual: ShopVisual,
  },
  {
    id: 'coven',
    kicker: 'Before the first hand',
    title: 'Pick who you sat down as.',
    body: 'Seven covens, each opening with its own sigils and a relic you keep all run. The Ashen burn things and get paid for folding; the Quiet always see one of somebody else’s cards. Choose one on the menu — the bots will.',
    Visual: CovenVisual,
  },
];

/**
 * Three covens, drawn the way the menu draws them. The point of the panel is
 * not to explain seven loadouts — it is to tell a new player that the row of
 * buttons above "Practice vs Bots" is a real choice and not decoration.
 */
function CovenVisual(): JSX.Element {
  return (
    <div className="intro-covens" aria-hidden="true">
      {['unmoored', 'ashen', 'loom'].map((id) => {
        const c = covenOf(id);
        return (
          <span key={id} className="intro-coven" style={{ ['--school' as string]: SCHOOLS[c.school].accent }}>
            <Mark kind="coven" id={c.id} fallback={c.glyph} />
            <b>{c.name}</b>
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flow shell
// ---------------------------------------------------------------------------

export interface IntroFlowProps {
  open: boolean;
  onClose: () => void;
}

export default function IntroFlow({ open, onClose }: IntroFlowProps) {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotionPref();

  useEffect(() => { if (open) setIndex(0); }, [open]);

  const finish = useCallback(() => {
    markIntroSeen();
    onClose();
  }, [onClose]);

  const last = index === PANELS.length - 1;

  const next = useCallback(() => {
    setIndex((i) => (i >= PANELS.length - 1 ? i : i + 1));
  }, []);
  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);
  const advance = useCallback(() => {
    if (last) finish();
    else next();
  }, [last, finish, next]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); advance(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish, advance, back]);

  const panel = PANELS[index];

  const panelMotion = useMemo(() => (reduced
    ? {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.01 },
    }
    : {
      initial: { opacity: 0, x: 28 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -28 },
      transition: ENTER,
    }), [reduced]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="intro-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.12 : 0.2, ease: EASE_OUT }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) finish(); }}
        >
          <motion.div
            className="intro-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-panel-title"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: reduced ? T_REDUCED : 0.28, ease: EASE_OUT }}
          >
            <header className="intro-head">
              <div className="intro-dots" aria-hidden="true">
                {PANELS.map((p, i) => (
                  <span key={p.id} className={`intro-dot ${i === index ? 'is-on' : ''} ${i < index ? 'is-done' : ''}`} />
                ))}
              </div>
              <Button tone="ghost" size="sm" onClick={finish}>Skip intro</Button>
            </header>

            <div className="intro-body" aria-live="polite">
              <AnimatePresence>
                <motion.div key={panel.id} className="intro-page" {...panelMotion}>
                  <span className="intro-kicker">{panel.kicker}</span>
                  <h2 id="intro-panel-title" className="intro-title">{panel.title}</h2>
                  <div className="intro-visualwrap">
                    <panel.Visual />
                  </div>
                  <p className="intro-copy">{panel.body}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="intro-nav">
              <Button tone="ghost" onClick={back} disabled={index === 0}>Back</Button>
              <span className="intro-step mono">{index + 1} / {PANELS.length}</span>
              <Button tone="primary" onClick={advance}>{last ? "Let's play" : 'Next'}</Button>
            </footer>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
