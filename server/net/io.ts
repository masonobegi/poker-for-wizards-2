/**
 * Socket wiring. Thin on purpose: validate the payload, find the seat, call the
 * engine. No game rules live here — anything that decides an outcome belongs in
 * `game/`, where it can be reasoned about without a socket attached.
 */
import { nanoid } from 'nanoid';
import type { Server, Socket } from 'socket.io';
import type { BetAction, RoomConfig, SigilTargets } from '../../shared/types';
import { Rooms, type Seatholder } from './rooms';

const MAX_NAME = 16;
const CHAT_LIMIT = 200;

const clean = (s: unknown, max: number): string =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';

const num = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(lo, Math.min(hi, n));
};

function sanitizeConfig(raw: unknown): Partial<RoomConfig> {
  if (!raw || typeof raw !== 'object') return {};
  const c = raw as Record<string, unknown>;
  const out: Partial<RoomConfig> = {};
  if (c.name !== undefined) out.name = clean(c.name, 24) || 'Table';
  if (c.maxPlayers !== undefined) out.maxPlayers = num(c.maxPlayers, 2, 6, 6);
  if (c.startingChips !== undefined) out.startingChips = num(c.startingChips, 1000, 1_000_000, 20000);
  if (c.startingShards !== undefined) out.startingShards = num(c.startingShards, 0, 200, 12);
  if (c.baseBlind !== undefined) out.baseBlind = num(c.baseBlind, 10, 10_000, 200);
  if (c.handsPerAnte !== undefined) out.handsPerAnte = num(c.handsPerAnte, 1, 30, 4);
  if (c.actionSeconds !== undefined) out.actionSeconds = num(c.actionSeconds, 8, 180, 30);
  if (c.responseSeconds !== undefined) out.responseSeconds = num(c.responseSeconds, 3, 30, 7);
  if (c.shopSeconds !== undefined) out.shopSeconds = num(c.shopSeconds, 15, 300, 60);
  if (typeof c.magicEnabled === 'boolean') out.magicEnabled = c.magicEnabled;
  if (typeof c.private === 'boolean') out.private = c.private;
  return out;
}

function sanitizeTargets(raw: unknown): SigilTargets {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: SigilTargets = {};
  if (typeof r.playerId === 'string') out.playerId = r.playerId.slice(0, 40);
  if (Array.isArray(r.cardIds)) {
    out.cardIds = r.cardIds.filter((x): x is string => typeof x === 'string').slice(0, 2);
  }
  if (typeof r.rank === 'number') out.rank = num(r.rank, 2, 14, 14);
  if (typeof r.suit === 'string' && ['S', 'H', 'D', 'C'].includes(r.suit)) {
    out.suit = r.suit as SigilTargets['suit'];
  }
  if (typeof r.markId === 'string') out.markId = r.markId as SigilTargets['markId'];
  return out;
}

function sanitizeAction(raw: unknown): BetAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kinds = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];
  if (typeof r.kind !== 'string' || !kinds.includes(r.kind)) return null;
  const amount = typeof r.amount === 'number' && Number.isFinite(r.amount)
    ? Math.max(0, Math.round(r.amount)) : undefined;
  return { kind: r.kind as BetAction['kind'], amount };
}

export function attach(io: Server): Rooms {
  const rooms = new Rooms(io);

  io.on('connection', (socket: Socket) => {
    const seat = (): Seatholder | undefined => socket.data.seat as Seatholder | undefined;
    const engine = () => { const s = seat(); return s ? rooms.get(s.code) : undefined; };
    const fail = (cb: unknown, error: string) => {
      if (typeof cb === 'function') (cb as (a: unknown) => void)({ ok: false, error });
    };
    const touch = () => { const e = engine(); if (e) e.table.lastActivity = Date.now(); };

    const join = (code: string, playerId: string) => {
      const token = rooms.issueToken(playerId);
      socket.data.seat = { code, playerId, token } satisfies Seatholder;
      socket.join(code);
      return token;
    };

    // ------------------------------------------------------------- rooms

    socket.on('room:create', (p: unknown, cb: unknown) => {
      const payload = (p ?? {}) as Record<string, unknown>;
      const name = clean(payload.name, MAX_NAME) || 'Host';
      const id = `p_${nanoid(10)}`;
      const e = rooms.create(id, sanitizeConfig(payload.config));
      const player = e.addPlayer(id, name);
      if (!player) return fail(cb, 'Could not seat you');
      const token = join(e.table.code, id);
      if (typeof cb === 'function') {
        (cb as (a: unknown) => void)({ ok: true, data: { code: e.table.code, youId: id, token } });
      }
      rooms.pushTo(socket.id, e.table.code, id);
    });

    socket.on('room:join', (p: unknown, cb: unknown) => {
      const payload = (p ?? {}) as Record<string, unknown>;
      const code = clean(payload.code, 8).toUpperCase();
      const name = clean(payload.name, MAX_NAME) || 'Player';
      const e = rooms.get(code);
      if (!e) return fail(cb, 'No table with that code');
      if (e.table.phase !== 'lobby') return fail(cb, 'That hand is already in progress');
      if (e.table.players.length >= e.table.config.maxPlayers) return fail(cb, 'That table is full');

      const id = `p_${nanoid(10)}`;
      const player = e.addPlayer(id, name);
      if (!player) return fail(cb, 'That table is full');
      const token = join(code, id);
      if (typeof cb === 'function') {
        (cb as (a: unknown) => void)({ ok: true, data: { code, youId: id, token } });
      }
      io.to(code).emit('chat', {
        id: nanoid(6), playerId: 'system', name: 'Table',
        text: `${player.name} joined.`, at: Date.now(), system: true,
      });
      rooms.broadcast(code);
    });

    socket.on('room:rejoin', (p: unknown, cb: unknown) => {
      const payload = (p ?? {}) as Record<string, unknown>;
      const code = clean(payload.code, 8).toUpperCase();
      const youId = clean(payload.youId, 40);
      const token = clean(payload.token, 64);
      const e = rooms.get(code);
      if (!e) return fail(cb, 'That table is gone');
      if (!rooms.checkToken(youId, token)) return fail(cb, 'Seat no longer yours');
      if (!e.table.players.some((q) => q.id === youId)) return fail(cb, 'You are not seated here');

      socket.data.seat = { code, playerId: youId, token } satisfies Seatholder;
      socket.join(code);
      e.setConnected(youId, true);
      if (typeof cb === 'function') {
        (cb as (a: unknown) => void)({ ok: true, data: { code, youId, token } });
      }
      rooms.pushTo(socket.id, code, youId);
    });

    socket.on('room:leave', () => {
      const s = seat();
      const e = engine();
      if (s && e) {
        e.removePlayer(s.playerId);
        socket.leave(s.code);
        if (e.table.players.filter((p) => !p.isBot).length === 0) rooms.destroy(s.code);
      }
      socket.data.seat = undefined;
    });

    socket.on('room:config', (p: unknown) => {
      const s = seat(); const e = engine();
      if (!s || !e || e.table.hostId !== s.playerId) return;
      touch();
      e.setConfig(sanitizeConfig(p));
    });

    socket.on('room:ready', (p: unknown) => {
      const s = seat(); const e = engine();
      if (!s || !e) return;
      touch();
      e.setReady(s.playerId, !!(p as { ready?: boolean })?.ready);
    });

    socket.on('room:start', (cb: unknown) => {
      const s = seat(); const e = engine();
      if (!s || !e) return;
      if (e.table.hostId !== s.playerId) return fail(cb, 'Only the host can start');
      touch();
      const r = e.start();
      if (!r.ok) {
        socket.emit('toast', { text: r.error ?? 'Cannot start', tone: 'warn' });
        return fail(cb, r.error ?? 'Cannot start');
      }
      if (typeof cb === 'function') (cb as (a: unknown) => void)({ ok: true });
    });

    socket.on('room:bot', (p: unknown) => {
      const s = seat(); const e = engine();
      if (!s || !e || e.table.hostId !== s.playerId) return;
      touch();
      if ((p as { add?: boolean })?.add) e.addBot();
      else e.removeBot();
    });

    socket.on('room:kick', (p: unknown) => {
      const s = seat(); const e = engine();
      if (!s || !e || e.table.hostId !== s.playerId) return;
      const target = clean((p as { playerId?: string })?.playerId, 40);
      if (!target || target === s.playerId) return;
      e.removePlayer(target);
      for (const [, sock] of io.sockets.sockets) {
        const held = sock.data.seat as Seatholder | undefined;
        if (held?.playerId === target) {
          sock.emit('kicked', { reason: 'The host removed you from the table' });
          sock.leave(s.code);
          sock.data.seat = undefined;
        }
      }
    });

    // -------------------------------------------------------------- game

    socket.on('game:action', (p: unknown) => {
      const s = seat(); const e = engine();
      if (!s || !e) return;
      const action = sanitizeAction(p);
      if (!action) return;
      touch();
      const r = e.act(s.playerId, action);
      if (!r.ok && r.error) socket.emit('toast', { text: r.error, tone: 'warn' });
    });

    socket.on('game:cast', (p: unknown) => {
      const s = seat(); const e = engine();
      if (!s || !e) return;
      const payload = (p ?? {}) as Record<string, unknown>;
      const uid = clean(payload.uid, 24);
      if (!uid) return;
      touch();
      const r = e.cast(s.playerId, uid, sanitizeTargets(payload.targets));
      if (!r.ok && r.error) socket.emit('toast', { text: r.error, tone: 'warn' });
    });

    socket.on('game:pass', () => {
      const s = seat(); const e = engine();
      if (!s || !e) return;
      touch();
      e.pass(s.playerId);
    });

    socket.on('game:discardSigil', (p: unknown) => {
      const s = seat(); const e = engine();
      if (!s || !e) return;
      const uid = clean((p as { uid?: string })?.uid, 24);
      if (!uid) return;
      touch();
      e.discardSigil(s.playerId, uid);
    });

    // -------------------------------------------------------------- shop

    socket.on('shop:buy', (p: unknown) => {
      const s = seat(); const e = engine();
      if (!s || !e) return;
      const uid = clean((p as { uid?: string })?.uid, 24);
      if (!uid) return;
      touch();
      const r = e.shopBuy(s.playerId, uid);
      if (!r.ok && r.error) socket.emit('toast', { text: r.error, tone: 'warn' });
    });

    socket.on('shop:reroll', () => {
      const s = seat(); const e = engine();
      if (!s || !e) return;
      touch();
      const r = e.shopReroll(s.playerId);
      if (!r.ok && r.error) socket.emit('toast', { text: r.error, tone: 'warn' });
    });

    socket.on('shop:done', () => {
      const s = seat(); const e = engine();
      if (!s || !e) return;
      touch();
      e.shopDone(s.playerId);
    });

    // -------------------------------------------------------------- chat

    socket.on('chat:send', (p: unknown) => {
      const s = seat(); const e = engine();
      if (!s || !e) return;
      const text = clean((p as { text?: string })?.text, CHAT_LIMIT);
      if (!text) return;
      const player = e.table.players.find((q) => q.id === s.playerId);
      touch();
      io.to(s.code).emit('chat', {
        id: nanoid(6), playerId: s.playerId,
        name: player?.name ?? 'Player', text, at: Date.now(),
      });
    });

    socket.on('emote', (p: unknown) => {
      const s = seat();
      if (!s) return;
      const id = clean((p as { id?: string })?.id, 12);
      if (!id) return;
      io.to(s.code).emit('emote', { playerId: s.playerId, id });
    });

    socket.on('disconnect', () => {
      const s = seat();
      const e = engine();
      if (!s || !e) return;
      // Hold the seat — the client can come back with its token.
      e.setConnected(s.playerId, false);
      if (e.table.phase === 'lobby') {
        e.removePlayer(s.playerId);
        if (e.table.players.filter((p) => !p.isBot).length === 0) rooms.destroy(s.code);
      }
    });
  });

  return rooms;
}
