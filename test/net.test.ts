/**
 * End-to-end over a real socket.
 *
 * Boots the actual server, connects two real clients, and plays a hand. The
 * point that matters most here is redaction: the server sends every seat a
 * different projection, and a bug that leaks an opponent's hole cards would be
 * invisible in the UI and fatal to the game.
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
  // Every table runs its own game-loop interval; without this the test process
  // never exits.
  rooms.shutdown();
  ioServer.close();
  await new Promise<void>((r) => http.close(() => r()));
});

/** Latest view each socket has received, so `until` never misses an early push. */
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

/**
 * Wait for a table view matching a predicate. Checks the most recent view
 * first — the push that satisfies the condition often lands before the caller
 * has had a chance to subscribe.
 */
function until(s: Socket, pred: (v: TableView) => boolean, ms = 25_000): Promise<TableView> {
  const now = latest.get(s);
  if (now && pred(now)) return Promise.resolve(now);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off('table', on);
      reject(new Error(`condition never held (last phase: ${latest.get(s)?.phase ?? 'none'})`));
    }, ms);
    const on = (v: TableView) => {
      if (!pred(v)) return;
      clearTimeout(timer);
      s.off('table', on);
      resolve(v);
    };
    s.on('table', on);
  });
}

test('two clients can open a table and sit down', async () => {
  const host = client();
  const guest = client();

  const made = await emitAck<{ code: string; youId: string }>(
    host, 'room:create', { name: 'Hostess', config: { magicEnabled: true, actionSeconds: 6 } },
  );
  assert.match(made.code, /^[A-Z0-9]{4}$/);

  const joined = await emitAck<{ code: string; youId: string }>(
    guest, 'room:join', { code: made.code, name: 'Guest' },
  );
  assert.equal(joined.code, made.code);

  const lobby = await until(host, (v) => v.players.length === 2);
  assert.equal(lobby.phase, 'lobby');
  assert.deepEqual(lobby.players.map((p) => p.name).sort(), ['Guest', 'Hostess']);
  assert.equal(lobby.hostId, made.youId);
});

test('joining with a bad code is refused', async () => {
  const s = client();
  await assert.rejects(
    () => emitAck(s, 'room:join', { code: 'ZZZZ', name: 'Nobody' }),
    /No table with that code/,
  );
});

test('a hand deals, redacts, and reaches a showdown', async () => {
  const host = client();
  const guest = client();

  const made = await emitAck<{ code: string; youId: string }>(
    host, 'room:create', { name: 'Hostess', config: { actionSeconds: 5, magicEnabled: true } },
  );
  const joined = await emitAck<{ code: string; youId: string }>(
    guest, 'room:join', { code: made.code, name: 'Guest' },
  );

  host.emit('room:bot', { add: true });
  await until(host, (v) => v.players.length === 3);

  host.emit('room:start');
  const dealt = await until(host, (v) => v.phase === 'preflop' && v.players.every(
    (p) => p.eliminated || p.hole.length === 2,
  ));

  // --- redaction ---------------------------------------------------------
  const you = dealt.players.find((p) => p.isYou);
  assert.ok(you, 'the host should see themselves');
  assert.equal(you.id, made.youId);
  assert.ok(you.sigils, 'you can read your own sigils');
  assert.ok(you.hole.every((c) => c.state === 'faceup' && c.face),
    'you can read your own hole cards');

  for (const other of dealt.players.filter((p) => !p.isYou)) {
    assert.equal(other.sigils, null, `${other.name}'s sigils leaked`);
    assert.ok(other.sigilCount >= 0);
    // `handRead` names the hand a player is holding, and is derived from
    // their hole cards. Saying "Pair of Kings" above an opponent's seat would
    // leak the same secret as showing the cards.
    assert.equal(other.handRead, undefined, `${other.name}'s hand reading leaked`);
    for (const c of other.hole) {
      assert.equal(c.face, null, `${other.name}'s hole card identity leaked`);
      // Not strictly 'facedown': a bot on The Unmoored is dealt a hole card
      // in superposition, and an opponent on Sealed Rank has one veiled. All
      // three hide the card — which is what the line above actually asserts.
      // Pinning the exact state here made covens look like a redaction leak.
      assert.ok(
        ['facedown', 'quantum', 'veiled'].includes(c.state),
        `${other.name}'s hole card was readable (state ${c.state})`,
      );
      assert.equal(c.possible, undefined, `${other.name}'s superposition leaked`);
    }
  }

  // The two clients genuinely receive different projections of one table.
  const guestView = await until(guest, (v) => v.phase !== 'lobby' && v.players.length === 3);
  const guestSelf = guestView.players.find((p) => p.isYou);
  assert.ok(guestSelf);
  assert.equal(guestSelf.id, joined.youId);
  assert.notEqual(guestSelf.id, you.id);

  const hostCardsAsSeenByGuest = guestView.players.find((p) => p.id === made.youId);
  assert.ok(hostCardsAsSeenByGuest);
  assert.ok(hostCardsAsSeenByGuest.hole.every((c) => c.face === null),
    'the guest can read the host\'s cards');
  assert.equal(hostCardsAsSeenByGuest.handRead, undefined,
    'the guest can read what the host is holding');

  // --- play it out -------------------------------------------------------
  const drive = (s: Socket, meId: string) => {
    const on = (v: TableView) => {
      if (v.actingId !== meId || v.stack) return;
      // Call when cheap, otherwise check; never fold, so we reach a showdown.
      setTimeout(() => s.emit('game:action', v.canCheck ? { kind: 'check' } : { kind: 'call' }), 60);
    };
    s.on('table', on);
    return () => s.off('table', on);
  };
  const stopA = drive(host, made.youId);
  const stopB = drive(guest, joined.youId);

  const done = await until(host, (v) => v.phase === 'payout' && !!v.payout, 40_000);
  stopA();
  stopB();

  assert.ok(done.payout);
  assert.ok(done.payout.pots.length > 0, 'somebody has to win the pot');
  const awarded = done.payout.entries.reduce((a, e) => a + e.won, 0);
  assert.ok(awarded > 0, 'chips were never awarded');

  // At showdown, contested hands are finally readable.
  const shown = done.payout.entries.filter((e) => e.cards.length > 0);
  if (shown.length > 1) {
    assert.ok(shown.every((e) => e.cards.every((c) => c.face)),
      'showdown should reveal the contested hands');
    assert.ok(shown.every((e) => e.handName.length > 0));
  }
});

test('a client cannot act out of turn', async () => {
  const host = client();
  const made = await emitAck<{ code: string; youId: string }>(
    host, 'room:create', { name: 'Solo', config: { actionSeconds: 20 } },
  );
  host.emit('room:bot', { add: true });
  host.emit('room:bot', { add: true });
  await until(host, (v) => v.players.length === 3);
  host.emit('room:start');

  const v = await until(host, (v2) => v2.phase === 'preflop');
  const chipsBefore = v.players.find((p) => p.isYou)?.chips ?? 0;

  // Fire an action regardless of whose turn it is; if it is not ours the
  // server must ignore it rather than move chips.
  if (v.actingId !== made.youId) {
    host.emit('game:action', { kind: 'bet', amount: 999999 });
    await new Promise((r) => setTimeout(r, 400));
    const after2 = await until(host, () => true, 5000);
    const me = after2.players.find((p) => p.isYou);
    assert.equal(me?.chips, chipsBefore, 'an out-of-turn bet moved chips');
  }
});
