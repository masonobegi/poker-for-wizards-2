/**
 * Gameplay preferences: small booleans that change how the table behaves for
 * *this* player only. Wiring them into the actual table interactions is not
 * this module's job — it only needs to store them durably and expose them,
 * via `usePrefs()`, to whatever code wants to read them.
 */
import { useSyncExternalStore } from 'react';

/**
 * How long a resolved spell's card stays in the middle of the table.
 * Full: 2.6s, long enough to read a spell you have never seen. Brief: under a
 * second, a flash of the name for someone who knows the sigils. Off: only
 * when you can answer it; everything else goes to the ledger.
 */
export type SpellCards = 'full' | 'brief' | 'off';
export const SPELL_CARD_OPTIONS: readonly SpellCards[] = ['full', 'brief', 'off'];

/**
 * How long a resolved spell stays readable after the stack empties, by the
 * player's Settings > Gameplay > Spell cards choice. Full is the playtest's
 * 2.6s (ceff08b): a first-time player has to be able to read an opponent's
 * Graft. Measured from the player's chair, ante 1 averages 6.8 casts a hand,
 * so by hour three that is a lot of reading; Brief and Off are for then.
 * Off still shows any spell you can answer: the response window is a choice.
 */
export const LINGER_MS: Readonly<Record<SpellCards, number>> = { full: 2600, brief: 800, off: 0 };

export interface GameplayPrefs {
  /** Ask "are you sure?" before a fold goes to the server. */
  confirmFold: boolean;
  /** How long a cast stays on screen once it has resolved. */
  spellCards: SpellCards;
  /** Show pot-odds numbers on the action bar at all times, not just on hover. */
  showPotOdds: boolean;
  /** Automatically muck a losing hand at showdown instead of showing it. */
  autoMuck: boolean;
}

const PREFS_KEY = 'hexhold.prefs';

export const DEFAULT_PREFS: GameplayPrefs = {
  confirmFold: true,
  spellCards: 'full',
  showPotOdds: false,
  autoMuck: false,
};

function isPrefsShape(v: unknown): v is Partial<GameplayPrefs> {
  return typeof v === 'object' && v !== null;
}

function readPrefs(): GameplayPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (!isPrefsShape(parsed)) return DEFAULT_PREFS;
    return {
      confirmFold: typeof parsed.confirmFold === 'boolean' ? parsed.confirmFold : DEFAULT_PREFS.confirmFold,
      spellCards: SPELL_CARD_OPTIONS.includes(parsed.spellCards as SpellCards)
        ? parsed.spellCards as SpellCards : DEFAULT_PREFS.spellCards,
      showPotOdds: typeof parsed.showPotOdds === 'boolean' ? parsed.showPotOdds : DEFAULT_PREFS.showPotOdds,
      autoMuck: typeof parsed.autoMuck === 'boolean' ? parsed.autoMuck : DEFAULT_PREFS.autoMuck,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

let current: GameplayPrefs = (typeof localStorage !== 'undefined') ? readPrefs() : DEFAULT_PREFS;
const listeners = new Set<() => void>();

function notify(): void { for (const l of listeners) l(); }

export function getPrefs(): GameplayPrefs {
  return current;
}

export function setPrefs(patch: Partial<GameplayPrefs>): void {
  current = { ...current, ...patch };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(current)); } catch { /* private mode / unavailable */ }
  notify();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Tiny reactive hook: `const [prefs, setPrefs] = usePrefs();` */
export function usePrefs(): [GameplayPrefs, (patch: Partial<GameplayPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS);
  return [prefs, setPrefs];
}
