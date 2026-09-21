/**
 * Dismissal state for the contextual first-time hints, persisted under
 * `localStorage['hexhold.hints.seen']`. Standalone from the game store so
 * `<Hints />` stays a fully self-contained import — see `Hints.tsx`.
 */
import { create } from 'zustand';

const KEY = 'hexhold.hints.seen';

function readSeen(): Record<string, true> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, true>;
  } catch {
    return {};
  }
}

function writeSeen(seen: Record<string, true>): void {
  try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch { /* private mode */ }
}

interface HintsState {
  seen: Record<string, true>;
  markSeen(id: string): void;
}

export const useHints = create<HintsState>((set, get) => ({
  seen: readSeen(),
  markSeen(id) {
    if (get().seen[id]) return;
    const next = { ...get().seen, [id]: true as const };
    writeSeen(next);
    set({ seen: next });
  },
}));
