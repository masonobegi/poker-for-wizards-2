/**
 * A local record of everything you have done at this table.
 *
 * There is no account system and no server persistence — this is deliberately
 * a single localStorage blob. Its whole job is to make finishing a run mean
 * something: the first Flush Five you ever land should still be sitting on the
 * menu a week later.
 */
import { CAT_NAME, type Cat } from '@shared/hand';

const KEY = 'hexhold.profile';
const MAX_RUNS = 30;

export interface RunRecord {
  at: number;
  /** 1 means you took the table. */
  placement: number;
  players: number;
  handsWon: number;
  antesSurvived: number;
  bestHand: string;
  bestCat: number;
  impossible: number;
  omens: string[];
  relics: string[];
  won: boolean;
}

export interface Profile {
  runs: RunRecord[];
  totals: {
    runs: number;
    wins: number;
    handsWon: number;
    impossible: number;
    bestCat: number;
    bestHand: string;
    /** Highest ante ever reached. */
    deepestAnte: number;
    /** Every distinct omen ever survived. */
    omensSeen: string[];
    /** Every distinct relic ever owned. */
    relicsOwned: string[];
  };
}

const EMPTY: Profile = {
  runs: [],
  totals: {
    runs: 0, wins: 0, handsWon: 0, impossible: 0,
    bestCat: -1, bestHand: '', deepestAnte: 0,
    omensSeen: [], relicsOwned: [],
  },
};

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      totals: { ...EMPTY.totals, ...(parsed.totals ?? {}) },
    };
  } catch {
    return EMPTY;
  }
}

function save(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    window.dispatchEvent(new Event('hexhold:save-changed'));
  } catch { /* private mode, or the quota is full — the game still plays */ }
}

/** Fold one finished run into the profile. Returns the updated profile. */
export function recordRun(run: RunRecord): Profile {
  const p = loadProfile();
  const t = p.totals;

  p.runs = [run, ...p.runs].slice(0, MAX_RUNS);
  t.runs += 1;
  if (run.won) t.wins += 1;
  t.handsWon += run.handsWon;
  t.impossible += run.impossible;
  t.deepestAnte = Math.max(t.deepestAnte, run.antesSurvived);

  if (run.bestCat > t.bestCat) {
    t.bestCat = run.bestCat;
    t.bestHand = run.bestHand;
  }
  t.omensSeen = [...new Set([...t.omensSeen, ...run.omens])];
  t.relicsOwned = [...new Set([...t.relicsOwned, ...run.relics])];

  save(p);
  return p;
}

export function clearProfile(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export const catName = (cat: number): string =>
  cat >= 0 ? (CAT_NAME[cat as Cat] ?? '') : '';

/** So a run is only ever banked once, even across reconnects and re-renders. */
const banked = new Set<string>();
export function alreadyBanked(key: string): boolean {
  if (banked.has(key)) return true;
  banked.add(key);
  return false;
}
