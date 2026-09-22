/**
 * A restart must not end everyone's game.
 *
 * Boots a server, plays part of a hand, tears the process state down as a
 * deploy would, brings it back up against the same file, and checks that the
 * table, the cards, the chips and — the part most likely to be forgotten — the
 * reconnect tokens all came back.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, type Server as HttpServer } from 'node:http';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { attach } from '../server/net/io';
import type { TableView } from '../shared/types';

const DB = path.resolve('hexhold-test.db');
process.env.PERSIST = 'true';
process.env.PERSIST_FILE = DB;

interface Boot { http: HttpServer; io: Server; rooms: ReturnType<typeof attach>; url: string }

async function boot(): Promise<Boot> {
  const http = createServer();
  const io = new Server(http, { cors: { origin: true } });
  const rooms = attach(io);
  await new Promise<void>((r) => http.listen(0, r));
  const addr = http.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { http, io, rooms, url: `http://127.0.0.1:${port}` };
}

async function halt(b: Boot): Promise<void> {
  b.rooms.shutdown();
  b.io.close();
  await new Promise<void>((r) => b.http.close(() => r()));
}

const clients: Socket[] = [];
function client(url: string): Socket {
  const s = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(s);
  return s;
}

const ack = <T>(s: Socket, ev: string, payload: unknown): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${ev} timed out`)), 5000);
    s.emit(ev, payload, (a: { ok: boolean; error?: string; data?: T }) => {
      clearTimeout(timer);
      if (!a.ok) reject(new Error(a.error ?? ev));
      else resolve(a.data as T);
    });
  });

const until = (s: Socket, pred: (v: TableView) => boolean, ms = 15_000): Promise<TableView> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => { s.off('table', on); reject(new Error('condition never held')); }, ms);
    const on = (v: TableView) => {
      if (!pred(v)) return;
      clearTimeout(timer);
      s.off('table', on);
      resolve(v);
    };
    s.on('table', on);
  });

before(() => { rmSync(DB, { force: true }); });
after(() => {
  for (const c of clients) c.disconnect();
  rmSync(DB, { force: true });
  rmSync(`${DB}.tmp`, { force: true });
});

test('a table in progress survives a restart, and seats are still claimable', async () => {
  // --- first process --------------------------------------------------------
  const first = await boot();
  const host = client(first.url);

  const seat = await ack<{ code: string; youId: string; token: string }>(
    host, 'room:create', { name: 'Keeper', config: { actionSeconds: 30, handsPerAnte: 3 } },
  );
  host.emit('room:bot', { add: true });
  host.emit('room:bot', { add: true });
  await until(host, (v) => v.players.length === 3);
  host.emit('room:start');

  const dealt = await until(host, (v) => v.phase === 'preflop' && v.board.length >= 0
    && v.players.every((p) => p.hole.length > 0));
  const chipsBefore = dealt.players.find((p) => p.isYou)?.chips ?? 0;
  const handBefore = dealt.handNumber;
  const myCardsBefore = dealt.players.find((p) => p.isYou)?.hole.map((c) => c.id).join(',');

  assert.ok(chipsBefore > 0);
  assert.ok(myCardsBefore && myCardsBefore.length > 0);

  // Deploy.
  await halt(first);
  host.disconnect();

  // --- second process -------------------------------------------------------
  const second = await boot();
  assert.ok(second.rooms.get(seat.code), 'the table did not come back');

  const returning = client(second.url);
  const rejoined = await ack<{ code: string; youId: string }>(
    returning, 'room:rejoin', { code: seat.code, youId: seat.youId, token: seat.token },
  );
  assert.equal(rejoined.youId, seat.youId, 'the seat was not reclaimable with the old token');

  const view = await until(returning, (v) => v.players.some((p) => p.isYou));
  const me = view.players.find((p) => p.isYou);

  assert.ok(me, 'the restored table does not know who I am');
  assert.equal(me.chips, chipsBefore, 'chips changed across the restart');
  assert.equal(view.handNumber, handBefore, 'the hand number changed across the restart');
  assert.equal(
    me.hole.map((c) => c.id).join(','), myCardsBefore,
    'my cards are not the ones I was dealt',
  );
  assert.notEqual(view.phase, 'lobby', 'the hand in progress was lost');

  await halt(second);
});

test('a stranger cannot claim a restored seat', async () => {
  const b = await boot();
  const host = client(b.url);
  const seat = await ack<{ code: string; youId: string; token: string }>(
    host, 'room:create', { name: 'Keeper' },
  );
  host.emit('room:bot', { add: true });
  await until(host, (v) => v.players.length === 2);
  host.emit('room:start');
  await until(host, (v) => v.phase !== 'lobby');

  await halt(b);
  host.disconnect();

  const b2 = await boot();
  const thief = client(b2.url);
  await assert.rejects(
    () => ack(thief, 'room:rejoin', { code: seat.code, youId: seat.youId, token: 'not-the-token' }),
    /Seat no longer yours/,
  );
  await halt(b2);
});

test('a save from a different version is ignored rather than half-loaded', async () => {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(DB, JSON.stringify({ v: 999, at: Date.now(), tables: [{ nonsense: true }], tokens: [] }));
  const b = await boot();
  assert.equal(b.rooms.count, 0, 'a future save version was loaded anyway');
  await halt(b);
});
