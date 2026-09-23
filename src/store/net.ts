/**
 * The single socket, the single store, and a tiny bus for transient effects.
 *
 * Game state is whatever the server last said it was — the client never
 * predicts a card or a chip. Animations are driven off the explicit `fx` stream
 * instead of diffing snapshots, which keeps "why did that card flip?" a
 * question with one answer.
 */
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { ChatMessage, FxEvent } from '@shared/protocol';
import type { BetAction, RoomConfig, SigilTargets, TableView } from '@shared/types';
import { readServerUrl, writeServerUrl } from '@/lib/server';

const SEAT_KEY = 'hexhold.seat';
const NAME_KEY = 'hexhold.name';

interface StoredSeat { code: string; youId: string; token: string }

const readSeat = (): StoredSeat | null => {
  try {
    const raw = localStorage.getItem(SEAT_KEY);
    return raw ? (JSON.parse(raw) as StoredSeat) : null;
  } catch { return null; }
};
const writeSeat = (s: StoredSeat | null) => {
  try {
    if (s) localStorage.setItem(SEAT_KEY, JSON.stringify(s));
    else localStorage.removeItem(SEAT_KEY);
  } catch { /* private mode */ }
};

export const readName = (): string => {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
};
export const writeName = (n: string) => {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ }
};

// ---------------------------------------------------------------------------
// Effect bus
// ---------------------------------------------------------------------------

type FxHandler = (e: FxEvent) => void;
const handlers = new Set<FxHandler>();

export function onFx(fn: FxHandler): () => void {
  handlers.add(fn);
  return () => { handlers.delete(fn); };
}

function dispatchFx(events: FxEvent[]): void {
  for (const e of events) for (const h of handlers) h(e);
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export interface Toast { id: number; text: string; tone: 'info' | 'warn' | 'error' | 'good' }
let toastSeq = 0;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type Screen = 'menu' | 'lobby' | 'game';

interface GameStore {
  socket: Socket | null;
  connected: boolean;
  screen: Screen;
  view: TableView | null;
  chat: ChatMessage[];
  toasts: Toast[];
  joining: boolean;
  error: string | null;
  /** Emote bubbles keyed by player id, with an expiry. */
  emotes: Record<string, { id: string; at: number }>;

  connect(): void;
  createRoom(name: string, config?: Partial<RoomConfig>): Promise<string | null>;
  joinRoom(code: string, name: string): Promise<boolean>;
  tryRejoin(): Promise<boolean>;
  leave(): void;

  setConfig(patch: Partial<RoomConfig>): void;
  setReady(ready: boolean): void;
  startGame(): void;
  addBot(add: boolean): void;
  kick(playerId: string): void;

  act(action: BetAction): void;
  cast(uid: string, targets: SigilTargets): void;
  pass(): void;
  discardSigil(uid: string): void;

  buy(uid: string): void;
  reroll(): void;
  shopDone(): void;

  say(text: string): void;
  emote(id: string): void;
  /** Point this client at a different server and reconnect. */
  useServer(url: string | null): void;
  toast(text: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
  clearError(): void;
}

/**
 * A read-only snapshot of the latest table view on `window`, for the Playwright
 * harnesses in `test/` and for asking a player what their client actually saw
 * when something goes wrong. `test/playthrough.mjs` has read this since it was
 * written; nothing ever published it, so every check it built on the result was
 * silently inert.
 *
 * Read-only by convention — nothing in the app reads it back.
 */
function publishView(view: TableView | null): void {
  if (typeof window === 'undefined') return;
  try { (window as unknown as { __hexholdView: TableView | null }).__hexholdView = view; }
  catch { /* ignore */ }
}

export const useGame = create<GameStore>((set, get) => ({
  socket: null,
  connected: false,
  screen: 'menu',
  view: null,
  chat: [],
  toasts: [],
  joining: false,
  error: null,
  emotes: {},

  connect() {
    if (get().socket) return;
    const socket = io(readServerUrl(), {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
    });

    socket.on('connect', () => {
      set({ connected: true });
      // Reclaim the seat we were holding before the drop.
      const seat = readSeat();
      if (seat && get().screen !== 'menu') void get().tryRejoin();
      else if (seat) void get().tryRejoin();
    });

    socket.on('disconnect', () => set({ connected: false }));

    socket.on('table', (view: TableView) => {
      const screen: Screen = view.phase === 'lobby' ? 'lobby' : 'game';
      set({ view, screen, joining: false });
      publishView(view);
    });

    socket.on('fx', (events: FxEvent[]) => dispatchFx(events));

    socket.on('chat', (msg: ChatMessage) => {
      set((s) => ({ chat: [...s.chat.slice(-80), msg] }));
    });

    socket.on('emote', ({ playerId, id }: { playerId: string; id: string }) => {
      set((s) => ({ emotes: { ...s.emotes, [playerId]: { id, at: Date.now() } } }));
      window.setTimeout(() => {
        set((s) => {
          const next = { ...s.emotes };
          if (next[playerId]?.at && Date.now() - next[playerId].at >= 2800) delete next[playerId];
          return { emotes: next };
        });
      }, 3000);
    });

    socket.on('toast', ({ text, tone }: { text: string; tone?: Toast['tone'] }) => {
      get().toast(text, tone ?? 'info');
    });

    socket.on('kicked', ({ reason }: { reason: string }) => {
      writeSeat(null);
      set({ screen: 'menu', view: null, error: reason }); publishView(null);
    });

    set({ socket });
  },

  async createRoom(name, config) {
    const s = get().socket;
    if (!s) return null;
    writeName(name);
    set({ joining: true, error: null });
    return new Promise((resolve) => {
      s.emit('room:create', { name, config }, (a: { ok: boolean; error?: string; data?: StoredSeat }) => {
        if (a.ok && a.data) {
          writeSeat(a.data);
          set({ screen: 'lobby', joining: false, chat: [] });
          resolve(a.data.code);
        } else {
          set({ joining: false, error: a.error ?? 'Could not open a table' });
          resolve(null);
        }
      });
    });
  },

  async joinRoom(code, name) {
    const s = get().socket;
    if (!s) return false;
    writeName(name);
    set({ joining: true, error: null });
    return new Promise((resolve) => {
      s.emit('room:join', { code: code.toUpperCase(), name },
        (a: { ok: boolean; error?: string; data?: StoredSeat }) => {
          if (a.ok && a.data) {
            writeSeat(a.data);
            set({ screen: 'lobby', joining: false, chat: [] });
            resolve(true);
          } else {
            set({ joining: false, error: a.error ?? 'Could not join' });
            resolve(false);
          }
        });
    });
  },

  async tryRejoin() {
    const s = get().socket;
    const seat = readSeat();
    if (!s || !seat) return false;
    return new Promise((resolve) => {
      s.emit('room:rejoin', seat, (a: { ok: boolean }) => {
        if (!a.ok) { writeSeat(null); set({ screen: 'menu', view: null }); } publishView(null);
        resolve(a.ok);
      });
    });
  },

  leave() {
    get().socket?.emit('room:leave');
    writeSeat(null);
    set({ screen: 'menu', view: null, chat: [], error: null }); publishView(null);
  },

  setConfig(patch) { get().socket?.emit('room:config', patch); },
  setReady(ready) { get().socket?.emit('room:ready', { ready }); },
  startGame() { get().socket?.emit('room:start'); },
  addBot(add) { get().socket?.emit('room:bot', { add }); },
  kick(playerId) { get().socket?.emit('room:kick', { playerId }); },

  act(action) { get().socket?.emit('game:action', action); },
  cast(uid, targets) { get().socket?.emit('game:cast', { uid, targets }); },
  pass() { get().socket?.emit('game:pass'); },
  discardSigil(uid) { get().socket?.emit('game:discardSigil', { uid }); },

  buy(uid) { get().socket?.emit('shop:buy', { uid }); },
  reroll() { get().socket?.emit('shop:reroll'); },
  shopDone() { get().socket?.emit('shop:done'); },

  useServer(url) {
    writeServerUrl(url);
    const old = get().socket;
    if (old) { old.removeAllListeners(); old.disconnect(); }
    writeSeat(null);
    set({ socket: null, connected: false, view: null, screen: 'menu', chat: [], error: null }); publishView(null);
    get().connect();
  },

  say(text) { get().socket?.emit('chat:send', { text }); },
  emote(id) { get().socket?.emit('emote', { id }); },

  toast(text, tone = 'info') {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    window.setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  clearError() { set({ error: null }); },
}));

// ---------------------------------------------------------------------------
// Convenience selectors
// ---------------------------------------------------------------------------

export const useView = () => useGame((s) => s.view);
export const useMe = () => useGame((s) => s.view?.players.find((p) => p.isYou) ?? null);
export const useIsHost = () =>
  useGame((s) => !!s.view && s.view.hostId === s.view.youId);
