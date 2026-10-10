/**
 * Gameplay preferences: small booleans that change how the table behaves for
 * *this* player only. Wiring them into the actual table interactions is not
 * this module's job — it only needs to store them durably and expose them,
 * via `usePrefs()`, to whatever code wants to read them.
 */
import { useSyncExternalStore } from 'react';

/**
 * How long a resolved spell's card stays in the middle of the table.
 * Auto (the default): Full for a sigil you have not yet seen resolve
 * AUTO_LEARNED_AFTER times, Brief once you have. Full: 2.6s, long enough to
 * read a spell you have never seen. Brief: under a second, a flash of the name
 * for someone who knows the sigils. Off: only when you can answer it;
 * everything else goes to the ledger.
 */
export type SpellCards = 'auto' | 'full' | 'brief' | 'off';
export const SPELL_CARD_OPTIONS: readonly SpellCards[] = ['auto', 'full', 'brief', 'off'];

/**
 * Times a sigil has to resolve in front of you before Auto shows it briefly.
 *
 * Decided 2026-10-10 (FUN-REVIEW.md, round 3). Measured from the player's
 * chair, a resolved card at Full covered the middle of the table for 26% of
 * the player's own turns; Brief, 8%. The playtest's first-run reader needed
 * Full to learn what Graft does, and the simulated Deck player switched to
 * Brief after an hour. Three readings of the same spell is enough to know it.
 */
export const AUTO_LEARNED_AFTER = 3;

/**
 * How long a resolved spell stays readable after the stack empties, by the
 * player's Settings > Gameplay > Spell cards choice. Full is the playtest's
 * 2.6s (ceff08b): a first-time player has to be able to read an opponent's
 * Graft. Measured from the player's chair, ante 1 averages 6.8 casts a hand,
 * so by hour three that is a lot of reading; Brief and Off are for then.
 * Off still shows any spell you can answer: the response window is a choice.
 */
export const LINGER_MS: Readonly<Record<Exclude<SpellCards, 'auto'>, number>> = { full: 2600, brief: 800, off: 0 };

/**
 * The linger for one resolved spell. Auto reads how many times you have seen
 * this sigil resolve; a written (Scribe) sigil is new words every time, so it
 * is always read in full.
 */
export function lingerFor(mode: SpellCards, timesSeen: number, scribed = false): number {
  if (mode !== 'auto') return LINGER_MS[mode] ?? LINGER_MS.full;
  return scribed || timesSeen < AUTO_LEARNED_AFTER ? LINGER_MS.full : LINGER_MS.brief;
}

const SEEN_KEY = 'hexhold.seenSpells';
let seen: Record<string, number> | null = null;

function seenMap(): Record<string, number> {
  if (seen) return seen;
  seen = {};
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}');
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) seen[k] = v;
      }
    }
  } catch { /* unavailable: Auto then reads every spell in full this session */ }
  return seen;
}

/** How many times this sigil has resolved in front of this player. */
export const timesSeen = (sigilId: string): number => seenMap()[sigilId] ?? 0;

/** Count one more reading of a resolved sigil. */
export function markSeen(sigilId: string): void {
  const m = seenMap();
  m[sigilId] = Math.min(99, (m[sigilId] ?? 0) + 1);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch { /* private mode */ }
}

/** Tests only: forget what has been seen. */
export function resetSeen(): void {
  seen = {};
  try { localStorage.removeItem(SEEN_KEY); } catch { /* unavailable */ }
}

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
  spellCards: 'auto',
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
