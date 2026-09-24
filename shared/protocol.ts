import type { Face, MarkId } from './cards';
import type {
  BetAction, RoomConfig, SigilTargets, TableView,
} from './types';

export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Transient effects.
//
// The client is not asked to diff two snapshots to work out that a card flew
// across the table. The server says so explicitly, and the client animates it.
// ---------------------------------------------------------------------------

export type FxEvent =
  | { t: 'deal'; cardIds: string[]; to: 'board' | string; stagger?: number }
  | { t: 'flip'; cardIds: string[] }
  | { t: 'chips'; playerId: string; amount: number; allIn?: boolean }
  | { t: 'pot_to'; playerId: string; amount: number }
  | { t: 'cast'; sigilId: string; casterId: string; school: string; targetIds?: string[] }
  | { t: 'counter'; sigilId: string; casterId: string }
  | { t: 'fizzle'; sigilId: string }
  | { t: 'collapse'; cardId: string; face: Face }
  | { t: 'superpose'; cardId: string }
  | { t: 'diverge'; cardId: string }
  | { t: 'entangle'; cardIds: string[] }
  | { t: 'inscribe'; cardId: string; markId: MarkId }
  | { t: 'burn'; cardId: string }
  | { t: 'seal'; rank: number }
  | { t: 'rewind'; cardId?: string }
  | { t: 'shake'; power: number }
  | { t: 'flash'; color: string; power?: number }
  | { t: 'banner'; text: string; sub?: string; tone?: 'neutral' | 'magic' | 'impossible' | 'win' | 'danger' }
  | { t: 'reveal'; playerId: string }
  | { t: 'win'; playerId: string; handName: string; impossible: boolean; amount: number }
  | { t: 'eliminate'; playerId: string }
  | { t: 'sfx'; name: string; vol?: number; pitch?: number }
  | { t: 'music'; mood: 'menu' | 'table' | 'tension' | 'showdown' | 'shop' | 'none' };

export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  at: number;
  system?: boolean;
}

// ---------------------------------------------------------------------------
// Socket contract
// ---------------------------------------------------------------------------

export interface Ack<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface ClientToServer {
  'room:create': (p: { name: string; coven?: string; config?: Partial<RoomConfig> }, cb: (a: Ack<{ code: string; youId: string }>) => void) => void;
  'room:join': (p: { code: string; name: string; coven?: string }, cb: (a: Ack<{ code: string; youId: string }>) => void) => void;
  'room:rejoin': (p: { code: string; youId: string; token: string }, cb: (a: Ack<{ code: string; youId: string }>) => void) => void;
  'room:leave': () => void;
  'room:config': (p: Partial<RoomConfig>) => void;
  'room:ready': (p: { ready: boolean }) => void;
  'room:start': () => void;
  'room:bot': (p: { add: boolean }) => void;
  'room:kick': (p: { playerId: string }) => void;

  'game:action': (p: BetAction) => void;
  'game:cast': (p: { uid: string; targets: SigilTargets }) => void;
  'game:pass': () => void;
  'game:discardSigil': (p: { uid: string }) => void;

  'shop:buy': (p: { uid: string }) => void;
  'shop:reroll': () => void;
  'shop:done': () => void;

  'chat:send': (p: { text: string }) => void;
  'emote': (p: { id: string }) => void;
}

export interface ServerToClient {
  table: (view: TableView) => void;
  fx: (events: FxEvent[]) => void;
  chat: (msg: ChatMessage) => void;
  toast: (p: { text: string; tone?: 'info' | 'warn' | 'error' | 'good' }) => void;
  kicked: (p: { reason: string }) => void;
  emote: (p: { playerId: string; id: string }) => void;
}

export const EMOTES = [
  { id: 'think', glyph: '🤔', label: 'Thinking' },
  { id: 'laugh', glyph: '😂', label: 'Nice' },
  { id: 'rage', glyph: '😤', label: 'Rigged' },
  { id: 'clap', glyph: '👏', label: 'Well played' },
  { id: 'skull', glyph: '💀', label: 'Dead' },
  { id: 'eyes', glyph: '👀', label: 'Watching' },
] as const;
