/**
 * Steam Cloud.
 *
 * Everything this game saves is small and local: a run history, a set of
 * achievement ids, a few settings. That fits in one JSON blob, so the sync is
 * deliberately a whole-file read and write rather than a merge protocol.
 *
 * Conflicts are resolved by a monotonically increasing revision plus a
 * timestamp. A player who plays on a second machine while offline will keep
 * whichever save has seen more — which for this game means more runs played —
 * rather than silently losing a night's progress to a clock skew.
 */
const FILE = 'hexhold-save.json';
const REV_KEY = 'hexhold.saveRev';

/** The local storage keys that make up a save. */
const KEYS = [
  'hexhold.profile',
  'hexhold.achievements',
  'hexhold.counters',
  'hexhold.audio',
  'hexhold.prefs',
  'hexhold.particles',
  'hexhold.uiScale',
  'hexhold.reducedMotion',
  'hexhold.seenIntro',
  'hexhold.hints.seen',
  'hexhold.name',
];

interface SaveBlob {
  v: 1;
  rev: number;
  at: number;
  /** How much play this save represents, for conflict resolution. */
  weight: number;
  data: Record<string, string>;
}

interface SteamBridge {
  cloudRead?: (file: string) => Promise<string | null>;
  cloudWrite?: (file: string, contents: string) => Promise<boolean>;
  status?: () => Promise<{ enabled: boolean }>;
}

const steam = (): SteamBridge | undefined =>
  (window as unknown as { hexhold?: { steam?: SteamBridge } }).hexhold?.steam;

const readLocalRev = (): number => {
  try { return Number.parseInt(localStorage.getItem(REV_KEY) ?? '0', 10) || 0; } catch { return 0; }
};

const bumpRev = (): number => {
  const next = readLocalRev() + 1;
  try { localStorage.setItem(REV_KEY, String(next)); } catch { /* ignore */ }
  return next;
};

/** Runs played plus achievements earned — a rough measure of "more progress". */
function localWeight(): number {
  try {
    const profile = JSON.parse(localStorage.getItem('hexhold.profile') ?? '{}') as
      { totals?: { runs?: number; handsWon?: number } };
    const achievements = JSON.parse(localStorage.getItem('hexhold.achievements') ?? '[]') as unknown[];
    return (profile.totals?.runs ?? 0) * 10
      + (profile.totals?.handsWon ?? 0)
      + achievements.length * 5;
  } catch { return 0; }
}

function collect(): SaveBlob {
  const data: Record<string, string> = {};
  for (const key of KEYS) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) data[key] = v;
    } catch { /* ignore */ }
  }
  return { v: 1, rev: readLocalRev(), at: Date.now(), weight: localWeight(), data };
}

function apply(blob: SaveBlob): void {
  for (const [key, value] of Object.entries(blob.data)) {
    if (!KEYS.includes(key)) continue;
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  }
  try { localStorage.setItem(REV_KEY, String(blob.rev)); } catch { /* ignore */ }
}

function parse(text: string | null): SaveBlob | null {
  if (!text) return null;
  try {
    const blob = JSON.parse(text) as SaveBlob;
    if (blob?.v !== 1 || typeof blob.data !== 'object') return null;
    return blob;
  } catch { return null; }
}

/**
 * Pull the cloud save at startup. Returns true when the local save was
 * replaced, which means the UI should re-read anything it cached.
 */
export async function pullCloudSave(): Promise<boolean> {
  const bridge = steam();
  if (!bridge?.cloudRead) return false;
  try {
    const remote = parse(await bridge.cloudRead(FILE));
    if (!remote) return false;

    const localRev = readLocalRev();
    const mine = localWeight();

    // The cloud is only authoritative if it has genuinely seen more play.
    const remoteWins = remote.rev > localRev
      ? remote.weight >= mine
      : remote.weight > mine;

    if (!remoteWins) return false;
    apply(remote);
    return true;
  } catch {
    return false;
  }
}

/** Push the local save. Debounced by the caller. */
export async function pushCloudSave(): Promise<boolean> {
  const bridge = steam();
  if (!bridge?.cloudWrite) return false;
  try {
    const blob = collect();
    blob.rev = bumpRev();
    return await bridge.cloudWrite(FILE, JSON.stringify(blob));
  } catch {
    return false;
  }
}

/**
 * Sync on the events that actually change a save — finishing a run, earning an
 * achievement — rather than on a timer, and coalesce bursts of them.
 */
export function installCloudSync(): () => void {
  if (!steam()?.cloudWrite) return () => {};

  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void pushCloudSave(); }, 4000);
  };

  const onStorage = (e: StorageEvent) => {
    if (e.key && KEYS.includes(e.key)) schedule();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('hexhold:save-changed', schedule);
  // A last write on the way out, so quitting immediately after a win still syncs.
  window.addEventListener('beforeunload', () => { void pushCloudSave(); });

  return () => {
    window.clearTimeout(timer);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('hexhold:save-changed', schedule);
  };
}

/** Anything that writes a save calls this so the sync knows to run. */
export const saveChanged = (): void => {
  try { window.dispatchEvent(new Event('hexhold:save-changed')); } catch { /* ignore */ }
};
