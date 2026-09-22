/**
 * Watching for achievements.
 *
 * Detection is client-side, which is how Steam achievements work anyway, and
 * reads the same view the UI renders plus the server's effect stream. Unlocks
 * are written to local storage immediately and handed to Steam when a desktop
 * build has it — so they survive with or without a Steam session.
 */
import { ACHIEVEMENT_BY_ID, CAT_ACHIEVEMENT, type AchievementId } from '@shared/achievements';
import type { TableView } from '@shared/types';
import type { FxEvent } from '@shared/protocol';
import { onFx } from '@/store/net';

const KEY = 'hexhold.achievements';
const COUNTER_KEY = 'hexhold.counters';

interface Counters { sigilsCast: number; counters: number }

const readSet = (): Set<AchievementId> => {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as AchievementId[]) : []);
  } catch { return new Set(); }
};

const writeSet = (s: Set<AchievementId>): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
    window.dispatchEvent(new Event('hexhold:save-changed'));
  } catch { /* ignore */ }
};

const readCounters = (): Counters => {
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    if (!raw) return { sigilsCast: 0, counters: 0 };
    const parsed = JSON.parse(raw) as Partial<Counters>;
    return { sigilsCast: parsed.sigilsCast ?? 0, counters: parsed.counters ?? 0 };
  } catch { return { sigilsCast: 0, counters: 0 }; }
};

const writeCounters = (c: Counters): void => {
  try { localStorage.setItem(COUNTER_KEY, JSON.stringify(c)); } catch { /* ignore */ }
};

export const earned = (): Set<AchievementId> => readSet();
export const hasEarned = (id: AchievementId): boolean => readSet().has(id);

type Listener = (id: AchievementId) => void;
const listeners = new Set<Listener>();
export function onAchievement(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Steam, when a desktop build has a session. Absent everywhere else. */
interface SteamBridge {
  unlockAchievement?: (api: string) => Promise<boolean>;
  setRichPresence?: (key: string, value: string) => void;
}
const steam = (): SteamBridge | undefined =>
  (window as unknown as { hexhold?: { steam?: SteamBridge } }).hexhold?.steam;

export function unlock(id: AchievementId): void {
  const set = readSet();
  if (set.has(id)) return;
  const def = ACHIEVEMENT_BY_ID[id];
  if (!def) return;

  set.add(id);
  writeSet(set);
  for (const fn of listeners) {
    try { fn(id); } catch { /* a bad listener must not block the unlock */ }
  }
  try { void steam()?.unlockAchievement?.(def.api); } catch { /* no Steam session */ }
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

let eliminationsThisRun = 0;
let castThisRun = 0;
let lastRunKey = '';

/** Facts only the effect stream carries. */
function watchEffects(e: FxEvent, youId: string | null): void {
  if (e.t === 'cast' && e.casterId === youId) {
    castThisRun += 1;
    const c = readCounters();
    c.sigilsCast += 1;
    writeCounters(c);
    const target = ACHIEVEMENT_BY_ID.archmage?.target ?? 100;
    if (c.sigilsCast >= target) unlock('archmage');
  }
  if (e.t === 'counter' && e.casterId === youId) {
    const c = readCounters();
    c.counters += 1;
    writeCounters(c);
    unlock('counterspell');
  }
  if (e.t === 'eliminate') eliminationsThisRun += 1;
}

/** Facts the table view carries. */
function watchView(view: TableView): void {
  const me = view.players.find((p) => p.isYou);
  if (!me) return;

  const runKey = `${view.code}:${view.handNumber === 0 ? 0 : 1}`;
  if (runKey !== lastRunKey && view.handNumber <= 1) {
    lastRunKey = runKey;
    eliminationsThisRun = 0;
    castThisRun = 0;
  }

  if (view.ante >= 5) unlock('ante_five');
  if (view.ante >= 8) unlock('ante_eight');
  if (view.omens.length >= 6) unlock('six_omens');
  if (eliminationsThisRun >= 3) unlock('kingmaker');

  if (view.phase === 'gameover' && view.winnerId === me.id) {
    unlock('first_run');
    if (castThisRun === 0) unlock('purist');
  }

  const payout = view.payout;
  if (!payout) return;

  const mine = payout.entries.find((e) => e.playerId === me.id);
  if (!mine || mine.won <= 0) return;

  unlock('first_blood');
  if (mine.won >= view.bb * 100) unlock('whale');

  const catAchievement = CAT_ACHIEVEMENT[mine.cat as keyof typeof CAT_ACHIEVEMENT];
  if (catAchievement) unlock(catAchievement);

  // Everything below is a property of the specific cards that won.
  const used = new Set(mine.usedIds);
  const winning = [...mine.cards, ...view.board].filter((c) => used.has(c.id));

  for (const card of winning) {
    if (card.marks.includes('wild')) unlock('wildcard');
    if (card.memory >= 3) unlock('long_memory');
    if (card.diverged) unlock('diverged_win');
    if (card.state === 'quantum' || card.possible) unlock('quantum_win');
  }

  // Sealed Rank hides a card from everyone until the showdown; if one of ours
  // was sealed this hand and it scored, that is the achievement.
  if (view.modNotes.some((n) => /sealed/i.test(n))) unlock('sealed_win');

  // The Inversion, or a Reversal relic, makes the worst hand the winner.
  if (view.activeMods.lowWins) unlock('the_inversion');
}

export function installAchievementWatcher(getView: () => TableView | null): () => void {
  const offFx = onFx((e) => {
    try { watchEffects(e, getView()?.youId ?? null); } catch { /* never block the game */ }
  });

  let lastSeen = '';
  const timer = window.setInterval(() => {
    const view = getView();
    if (!view) return;
    // Only re-evaluate when something that could matter has changed.
    const key = `${view.phase}:${view.handNumber}:${view.ante}:${view.omens.length}:${view.winnerId ?? ''}`;
    if (key === lastSeen) return;
    lastSeen = key;
    try { watchView(view); } catch { /* never block the game */ }
  }, 500);

  return () => { offFx(); window.clearInterval(timer); };
}
