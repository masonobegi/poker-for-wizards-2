/**
 * Gameplay preferences: small booleans that change how the table behaves for
 * *this* player only. Wiring them into the actual table interactions is not
 * this module's job — it only needs to store them durably and expose them,
 * via `usePrefs()`, to whatever code wants to read them.
 */
import { useSyncExternalStore } from 'react';

export interface GameplayPrefs {
  /** Ask "are you sure?" before a fold goes to the server. */
  confirmFold: boolean;
  /** Show pot-odds numbers on the action bar at all times, not just on hover. */
  showPotOdds: boolean;
  /** Automatically muck a losing hand at showdown instead of showing it. */
  autoMuck: boolean;
}

const PREFS_KEY = 'hexhold.prefs';

export const DEFAULT_PREFS: GameplayPrefs = {
  confirmFold: true,
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
