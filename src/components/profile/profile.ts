/**
 * A local record of everything you have done at this table.
 *
 * There is no account system and no server persistence — this is deliberately
 * a single localStorage blob. Its whole job is to make finishing a run mean
 * something: the first Flush Five you ever land should still be sitting on the
 * menu a week later.
 */
import { CAT_NAME, type Cat } from '@shared/hand';
import { MAX_HEX } from '@shared/hexes';

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
  /** The hex it was played at. Absent on runs banked before hexes existed. */
  hex?: number;
  /** The day, for a Daily Rite. See shared/hexes.ts. */
  daily?: string;
}

/** The best a player has done at one day's rite. */
export interface DailyRecord {
  won: boolean;
  placement: number;
  players: number;
  antesSurvived: number;
  bestHand: string;
  attempts: number;
}

/** What one coven has done across every run played as it. */
export interface CovenRecord {
  runs: number;
  wins: number;
  deepestAnte: number;
  impossible: number;
  /** Highest hex open to this coven. A win at the top open hex opens the next. */
  hex: number;
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
  /** Daily Rite results by day, newest kept. */
  daily: Record<string, DailyRecord>;
}

const MAX_DAYS = 30;

const EMPTY: Profile = {
  runs: [],
  totals: {
    runs: 0, wins: 0, handsWon: 0, impossible: 0,
    bestCat: -1, bestHand: '', deepestAnte: 0,
    omensSeen: [], relicsOwned: [],
  },
  covens: {},
  daily: {},
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
      covens: Object.fromEntries(
        Object.entries(parsed.covens ?? {}).map(([id, c]) => [id, { ...c, hex: c.hex ?? 1 }]),
      ),
      daily: { ...(parsed.daily ?? {}) },
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
  const c = p.covens[id] ?? { runs: 0, wins: 0, deepestAnte: 0, impossible: 0, hex: 1 };
  p.covens[id] = {
    runs: c.runs + 1,
    wins: c.wins + (run.won ? 1 : 0),
    deepestAnte: Math.max(c.deepestAnte, run.antesSurvived),
    impossible: c.impossible + run.impossible,
    hex: nextHex(c.hex, run),
  };

  if (run.daily) {
    const prev = p.daily[run.daily];
    const mine: DailyRecord = {
      won: run.won, placement: run.placement, players: run.players,
      antesSurvived: run.antesSurvived, bestHand: run.bestHand, attempts: (prev?.attempts ?? 0) + 1,
    };
    p.daily[run.daily] = prev && !betterDaily(mine, prev) ? { ...prev, attempts: mine.attempts } : mine;
    const days = Object.keys(p.daily).sort().reverse();
    for (const d of days.slice(MAX_DAYS)) delete p.daily[d];
  }

  save(p);
  return p;
}

/**
 * The hex a coven has open after this run. Only a win at the top open hex
 * opens the next one; a Daily Rite is played at a fixed hex and never counts.
 */
export function nextHex(open: number, run: Pick<RunRecord, 'won' | 'hex' | 'daily'>): number {
  if (!run.won || run.daily || (run.hex ?? 1) < open) return open;
  return Math.min(MAX_HEX, open + 1);
}

/** A win beats a loss, then a better placement, then a deeper run. */
function betterDaily(a: DailyRecord, b: DailyRecord): boolean {
  if (a.won !== b.won) return a.won;
  if (a.placement !== b.placement) return a.placement < b.placement;
  return a.antesSurvived > b.antesSurvived;
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
