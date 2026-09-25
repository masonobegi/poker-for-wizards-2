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
  /** The coven this run was played as. See shared/covens.ts. */
  coven: string;
  won: boolean;
}

/** What one coven has done across every run played as it. */
export interface CovenRecord {
  runs: number;
  wins: number;
  deepestAnte: number;
  impossible: number;
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
  /**
   * Per-coven records, keyed by coven id.
   *
   * Deliberately NOT an unlock gate. Hiding six of seven openings from a new
   * player makes the game look thinner than it is on the one launch where
   * that matters most; showing all seven with a record beside each gives the
   * same reason to come back without spending the first impression on it.
   */
  covens: Record<string, CovenRecord>;
}

const EMPTY: Profile = {
  runs: [],
  totals: {
    runs: 0, wins: 0, handsWon: 0, impossible: 0,
    bestCat: -1, bestHand: '', deepestAnte: 0,
    omensSeen: [], relicsOwned: [],
  },
  covens: {},
};

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      totals: { ...EMPTY.totals, ...(parsed.totals ?? {}) },
      // Profiles written before covens existed have no `covens` key, and a
      // save from a week ago must not throw away a week of runs.
      covens: { ...(parsed.covens ?? {}) },
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

  const id = run.coven || 'unaligned';
  const c = p.covens[id] ?? { runs: 0, wins: 0, deepestAnte: 0, impossible: 0 };
  p.covens[id] = {
    runs: c.runs + 1,
    wins: c.wins + (run.won ? 1 : 0),
    deepestAnte: Math.max(c.deepestAnte, run.antesSurvived),
    impossible: c.impossible + run.impossible,
  };

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
