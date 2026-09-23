/**
 * The difficulty and speed selectors have to survive the trip to the server.
 *
 * A setting that is validated on the client, sent over a socket, filtered by a
 * sanitiser and then dropped by the room factory looks exactly like a setting
 * that works — the menu highlights the right button and the game starts. These
 * tests boot the real server, create real rooms over a real socket, and read
 * the config back off the table view the server pushes, which is the only
 * evidence that the button does anything at all.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { attach } from '../server/net/io';
import type { TableView } from '../shared/types';

let http: HttpServer;
let ioServer: Server;
let rooms: ReturnType<typeof attach>;
let url = '';
const clients: Socket[] = [];

before(async () => {
  http = createServer();
  ioServer = new Server(http, { cors: { origin: true } });
  rooms = attach(ioServer);
  await new Promise<void>((r) => http.listen(0, r));
  const addr = http.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  url = `http://127.0.0.1:${port}`;
});

after(async () => {
  for (const c of clients) c.disconnect();
  rooms.shutdown();
  ioServer.close();
  await new Promise<void>((r) => http.close(() => r()));
});

const latest = new WeakMap<Socket, TableView>();

function client(): Socket {
  const s = connect(url, { transports: ['websocket'], forceNew: true });
  s.on('table', (v: TableView) => latest.set(s, v));
  clients.push(s);
  return s;
}

const emitAck = <T>(s: Socket, ev: string, payload: unknown): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${ev} timed out`)), 5000);
    s.emit(ev, payload, (a: { ok: boolean; error?: string; data?: T }) => {
      clearTimeout(timer);
      if (!a.ok) reject(new Error(a.error ?? ev));
      else resolve(a.data as T);
    });
  });

function until(s: Socket, pred: (v: TableView) => boolean, ms = 10_000): Promise<TableView> {
  const now = latest.get(s);
  if (now && pred(now)) return Promise.resolve(now);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a view')), ms);
    const on = (v: TableView): void => {
      if (!pred(v)) return;
      clearTimeout(timer);
      s.off('table', on);
      resolve(v);
    };
    s.on('table', on);
  });
}

/** Create a room with this config and return the config the server kept. */
async function configFor(config: Record<string, unknown>): Promise<TableView['config']> {
  const s = client();
  await emitAck(s, 'room:create', { name: 'Tester', config });
  const view = await until(s, () => true);
  return view.config;
}

test('the practice settings reach the table the server actually runs', async () => {
  const cfg = await configFor({ maxPlayers: 4, private: true, botSkill: 'master', speed: 'blitz' });
  assert.equal(cfg.botSkill, 'master', 'the difficulty never made it to the server');
  assert.equal(cfg.speed, 'blitz', 'the speed never made it to the server');
});

test('every difficulty and speed round-trips', async () => {
  for (const botSkill of ['novice', 'adept', 'master'] as const) {
    const cfg = await configFor({ private: true, botSkill });
    assert.equal(cfg.botSkill, botSkill, `${botSkill} did not round-trip`);
  }
  for (const speed of ['relaxed', 'standard', 'blitz'] as const) {
    const cfg = await configFor({ private: true, speed });
    assert.equal(cfg.speed, speed, `${speed} did not round-trip`);
  }
});

test('a table that sets nothing gets the shipped defaults', async () => {
  const cfg = await configFor({ private: true });
  assert.equal(cfg.botSkill, 'adept');
  assert.equal(cfg.speed, 'standard');
});

test('a junk setting falls back instead of reaching the bot brain', async () => {
  // The sanitiser is the only thing between a socket payload and the code that
  // indexes a lookup table with it.
  const cfg = await configFor({
    private: true,
    botSkill: 'godlike',
    speed: { nope: true },
  } as Record<string, unknown>);
  assert.equal(cfg.botSkill, 'adept', 'an unknown difficulty must fall back');
  assert.equal(cfg.speed, 'standard', 'a non-string speed must fall back');
});
