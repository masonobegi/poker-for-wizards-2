/**
 * Room registry. One Engine per table, plus the bookkeeping that lets a player
 * drop their connection and come back into the same seat.
 */
import type { Server } from 'socket.io';
import { Engine } from '../game/engine';
import { viewFor } from '../game/table';
import type { RoomConfig } from '../../shared/types';
import type { FxEvent } from '../../shared/protocol';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const IDLE_MS = 1000 * 60 * 45;

export interface Seatholder {
  code: string;
  playerId: string;
  token: string;
}

export class Rooms {
  private engines = new Map<string, Engine>();
  /** playerId -> reconnect token, so a dropped client cannot be impersonated. */
  private tokens = new Map<string, string>();
  private reaper: NodeJS.Timeout;

  constructor(private io: Server) {
    this.reaper = setInterval(() => this.reap(), 60_000);
    // Housekeeping should never be the reason the process stays alive.
    this.reaper.unref?.();
  }

  /** Close every table and release the timers holding the event loop open. */
  shutdown(): void {
    clearInterval(this.reaper);
    for (const code of [...this.engines.keys()]) this.destroy(code);
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.engines.has(code)) return code;
    }
    return `X${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  get(code: string): Engine | undefined {
    return this.engines.get(code.toUpperCase());
  }

  create(hostId: string, config: Partial<RoomConfig>): Engine {
    const code = this.newCode();
    const engine = new Engine(
      code,
      hostId,
      config,
      (fx: FxEvent[]) => this.io.to(code).emit('fx', fx),
      () => this.broadcast(code),
    );
    this.engines.set(code, engine);
    return engine;
  }

  /** Every seat gets its own projection — this is the only place views ship from. */
  broadcast(code: string): void {
    const engine = this.engines.get(code);
    if (!engine) return;
    const room = this.io.sockets.adapter.rooms.get(code);
    if (!room) return;

    for (const socketId of room) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (!socket) continue;
      const holder = socket.data.seat as Seatholder | undefined;
      if (!holder) continue;
      socket.emit('table', viewFor(engine.table, holder.playerId));
    }
  }

  pushTo(socketId: string, code: string, playerId: string): void {
    const engine = this.engines.get(code);
    const socket = this.io.sockets.sockets.get(socketId);
    if (!engine || !socket) return;
    socket.emit('table', viewFor(engine.table, playerId));
  }

  issueToken(playerId: string): string {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.tokens.set(playerId, token);
    return token;
  }

  checkToken(playerId: string, token: string): boolean {
    return this.tokens.get(playerId) === token;
  }

  destroy(code: string): void {
    const engine = this.engines.get(code);
    if (!engine) return;
    engine.dispose();
    this.engines.delete(code);
    for (const p of engine.table.players) this.tokens.delete(p.id);
  }

  /** Close tables nobody has touched in a while so the process does not grow. */
  private reap(): void {
    const now = Date.now();
    for (const [code, engine] of this.engines) {
      const humans = engine.table.players.filter((p) => !p.isBot && p.connected);
      const idle = now - engine.table.lastActivity > IDLE_MS;
      if (humans.length === 0 && idle) this.destroy(code);
    }
  }

  get count(): number {
    return this.engines.size;
  }

  stats(): { rooms: number; players: number } {
    let players = 0;
    for (const e of this.engines.values()) {
      players += e.table.players.filter((p) => !p.isBot).length;
    }
    return { rooms: this.engines.size, players };
  }
}
