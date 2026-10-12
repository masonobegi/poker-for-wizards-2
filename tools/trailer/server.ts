/**
 * The trailer's game server: the real HEXHOLD server, on a clock the recorder
 * turns by hand.
 *
 *   forked by tools/trailer/record_trailer.mjs (never run on its own)
 *
 * It is server/index.ts with three differences, all of them about time and
 * control rather than rules:
 *
 *  - A VIRTUAL CLOCK. `Date.now()` in this process is a number the recorder
 *    advances exactly 1/60 s per captured frame, the same step it gives the
 *    page. Every deadline the engine sets (action clocks, response windows,
 *    bot think time, the payout hold) is read off that clock, so the server
 *    and the page stay in lockstep however slowly the frames are captured.
 *  - MANUAL TICKS. Each table's 120 ms scheduler interval is stopped the
 *    moment the table exists and run from `advance()` instead, on the same
 *    virtual clock.
 *  - A DIRECTOR'S CHANNEL. The recorder sends `{ op: 'eval', src }` over IPC
 *    and the source runs here with the engine in reach. That is how a shot
 *    is set up: which cards the shuffle puts on top, which sigils a seat
 *    holds, when a bot acts. Everything after the setup is the engine's own
 *    code path (`act`, `cast`, `pass`, the showdown), so what the camera sees
 *    is a real hand being played, not a picture of one.
 */
const realNow = Date.now.bind(Date);
let vnow = realNow();
Date.now = () => Math.round(vnow);

process.env.PERSIST = '0';
process.env.NODE_ENV = 'development';

const { createServer } = await import('node:http');
const path = await import('node:path');
const express = (await import('express')).default;
const { Server } = await import('socket.io');
const { attach } = await import('../../server/net/io');
const { Rooms } = await import('../../server/net/rooms');
const { Engine } = await import('../../server/game/engine');
const shared = {
  cards: await import('../../shared/cards'),
  sigils: await import('../../shared/sigils'),
  relics: await import('../../shared/relics'),
  omens: await import('../../shared/omens'),
  hand: await import('../../shared/hand'),
  rng: await import('../../shared/rng'),
  table: await import('../../server/game/table'),
  magic: await import('../../server/game/magic'),
};

const TICK_MS = 120;
type Eng = InstanceType<typeof Engine> & Record<string, any>;
const engines: { e: Eng; next: number }[] = [];

// Every table runs on the virtual clock from the moment it exists.
const create = Rooms.prototype.create;
Rooms.prototype.create = function (this: InstanceType<typeof Rooms>, ...args: Parameters<typeof create>) {
  const e = create.apply(this, args) as Eng;
  e.dispose();
  // A fixed seed: bot names, think times and every unrigged draw come out the
  // same on every recording, so a shot timed once stays timed.
  e.table.seed = 'hexhold-trailer';
  e.rng = new shared.rng.Rng('hexhold-trailer');
  engines.push({ e, next: vnow + TICK_MS });
  return e;
};

/** Packets sent to the page, so the recorder can wait until it has them all. */
let sent = 0;

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: true }, pingInterval: 600_000, pingTimeout: 600_000 });
const rooms = attach(io);
const to = io.to.bind(io);
io.to = ((room: string) => {
  const op = to(room);
  const emit = op.emit.bind(op);
  op.emit = ((ev: string, ...a: unknown[]) => {
    sent += io.sockets.adapter.rooms.get(room)?.size ?? 0;
    return emit(ev, ...a);
  }) as typeof op.emit;
  return op;
}) as typeof io.to;
io.on('connection', (s) => {
  const emit = s.emit.bind(s);
  s.emit = ((ev: string, ...a: unknown[]) => { sent++; return emit(ev, ...a); }) as typeof s.emit;
});

const dist = path.resolve(process.env.CLIENT_DIR ?? 'dist');
app.use(express.static(dist, { index: false }));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

/** Advance the virtual clock, running every table's scheduler on the way. */
function advance(ms: number): void {
  const target = vnow + ms;
  for (;;) {
    let best: { e: Eng; next: number } | null = null;
    for (const x of engines) if (x.next <= target && (!best || x.next < best.next)) best = x;
    if (!best) break;
    vnow = Math.max(vnow, best.next);
    best.next += TICK_MS;
    try { best.e.tick(); } catch (err) { console.error('[trailer] tick threw', err); }
  }
  vnow = target;
}

// ── The director's hands ──────────────────────────────────────────────────────
// Setup only: what is in the deck, in a hand, in a mana pool. Play itself
// (bets, casts, answers, the showdown) goes through the engine's own methods.

const RANK: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
const parseCode = (code: string) => ({
  rank: RANK[code[0]] ?? Number(code.slice(0, -1)),
  suit: code[code.length - 1] as 'S' | 'H' | 'D' | 'C',
});

const eng = (): Eng => engines[engines.length - 1]?.e;
const tbl = () => eng().table;
const hero = () => tbl().players.find((p: any) => !p.isBot);
const bots = () => tbl().players.filter((p: any) => p.isBot);
const seatOf = (who: number | string) => (typeof who === 'string'
  ? tbl().players.find((p: any) => p.id === who || p.name === who)
  : who === 0 ? hero() : bots()[who - 1]);

/** The printed card with this face ("KS", "7D", "TH"). */
function cardId(code: string): string {
  const { rank, suit } = parseCode(code);
  for (const c of tbl().cards.values() as Iterable<any>) {
    if (c.origin !== 'conjured' && c.faces.length === 1 && c.faces[0].rank === rank && c.faces[0].suit === suit) return c.id;
  }
  throw new Error(`no card ${code}`);
}

/**
 * The next shuffle deals these faces first, in draw order: hole cards go
 * round the table one at a time (hero first, then each bot), then the board,
 * then whatever a Rewind or a Twin draws. The rest of the deck follows in a
 * fixed order.
 */
function rigNextDeal(plan: { hole: string[][]; board: string[]; extra?: string[] }): void {
  const e = eng();
  const seats = tbl().players.filter((p: any) => !p.eliminated && !p.sittingOut);
  // Every seat's hole cards must be given in full: a seat draws one card a
  // round for as many rounds as it is dealt (two, or three with a relic).
  const order: string[] = [];
  const rounds = Math.max(...plan.hole.map((h) => h.length));
  for (let r = 0; r < rounds; r++) {
    for (const p of seats) {
      const code = plan.hole[p.isBot ? bots().indexOf(p) + 1 : 0]?.[r];
      if (code) order.push(code);
    }
  }
  order.push(...plan.board, ...(plan.extra ?? []));
  rig(e, 'deck:', (name) => {
    const deck = order.map(cardId);
    const used = new Set(deck);
    const rest = new shared.rng.Rng(`trailer:${name}`).shuffle([...tbl().cards.keys()].filter((id: string) => !used.has(id)));
    return { shuffle: () => [...deck, ...rest] };
  });
}

/**
 * The engine draws every deal, omen and Market offer from a named random
 * stream (Engine.stream). A rig answers the next stream of one kind, once;
 * every other draw is the engine's own.
 */
function rig(e: Eng, prefix: string, make: (name: string, real: any) => any): void {
  if (!e.__rigs) {
    const own = e.stream.bind(e);
    e.__rigs = new Map<string, (name: string, real: any) => any>();
    e.stream = (name: string) => {
      for (const [p, fn] of e.__rigs) {
        if (!name.startsWith(p)) continue;
        e.__rigs.delete(p);
        return fn(name, own(name));
      }
      return own(name);
    };
  }
  e.__rigs.set(prefix, make);
}

/** The next omen to land is this one. Everything else about it is rollOmen's own. */
function rigNextOmen(id: string): void {
  const def = shared.omens.OMEN_BY_ID[id];
  if (!def) throw new Error(`no omen ${id}`);
  rig(eng(), 'omen:', (_name, real) => Object.assign(Object.create(Object.getPrototypeOf(real)), real, { pick: () => def }));
}

/** Replace what a seat holds: sigils by id, mana, relics. Pushes the view. */
function setHand(who: number | string, h: { sigils?: string[]; mana?: number; maxMana?: number; relics?: string[]; chips?: number; shards?: number }): void {
  const p = seatOf(who);
  if (h.sigils) p.sigils = h.sigils.map((defId, i) => ({ uid: `tr${defId}${i}${Math.round(vnow) % 1e6}`, defId }));
  if (h.relics) p.relics = [...h.relics];
  if (h.maxMana !== undefined) p.maxMana = h.maxMana;
  if (h.mana !== undefined) p.mana = h.mana;
  if (h.chips !== undefined) p.chips = h.chips;
  if (h.shards !== undefined) p.shards = h.shards;
  eng().flush();
}

/**
 * Who acts by themselves. Bots never cast or buy on their own here: the
 * trailer decides every spell. They check or call, or take the next action
 * queued for them; the hero does the same when `hero` is on.
 */
const auto = { bots: true, hero: false, holdHero: [] as string[], queue: new Map<string, any[]>() };
function autopilot(this: Eng): void {
  const t = this.table;
  const now = Date.now();
  const mine = (p: any) => p && (p.isBot ? auto.bots : auto.hero && !auto.holdHero.includes(t.phase));
  if (t.stack) {
    for (const id of [...t.stack.pending]) {
      const p = shared.table.byId(t, id);
      if (!mine(p)) continue;
      if (now < (this.botClock.get(id) ?? 0)) continue;
      this.botClock.delete(id);
      this.pass(id);
      return;
    }
    return;
  }
  if (t.phase === 'shop') {
    for (const p of t.players) if (p.isBot && !p.shopDone) p.shopDone = true;
    if (t.players.every((q: any) => q.eliminated || q.shopDone)) this.closeShop();
    return;
  }
  const acting = shared.table.byId(t, t.actingId);
  if (!mine(acting)) return;
  if (!acting.isBot && !this.botClock.has(acting.id)) this.botClock.set(acting.id, now + 500);
  if (now < (this.botClock.get(acting.id) ?? 0)) return;
  this.botClock.delete(acting.id);
  const queued = auto.queue.get(acting.id)?.shift();
  const toCall = t.currentBet - acting.bet;
  this.applyAction(acting, queued ?? (toCall > 0 ? { kind: 'call' } : { kind: 'check' }), true);
}

/**
 * Everyone still to act checks, now: the street closes on the frame the
 * director chose instead of after each bot's think time.
 */
function checkAround(): void {
  const e = eng();
  const t = tbl();
  const street = t.phase;
  for (let guard = 0; guard < 12 && t.phase === street && t.actingId && !t.stack; guard++) {
    const p = shared.table.byId(t, t.actingId);
    const toCall = t.currentBet - (p?.bet ?? 0);
    const r = e.act(t.actingId, toCall > 0 ? { kind: 'call' } : { kind: 'check' });
    if (!r.ok) break;
  }
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const ctx = {
  rooms, engines, shared, advance, cardId, rigNextDeal, rigNextOmen, setHand, auto, seatOf, checkAround,
  /** The newest table: the trailer only ever has one. */
  get engine(): Eng { return eng(); },
  get table() { return tbl(); },
  get hero() { return hero(); },
  get bots() { return bots(); },
  get now() { return vnow; },
  /** Take over the bots (and, when asked, the hero) on this table. */
  direct(): void { const e = eng(); e.runBots = autopilot.bind(e); },
  /** One seat's cards as codes, for logs. */
  faces(ids: string[]): string[] {
    return ids.map((id) => {
      const c = tbl().cards.get(id);
      if (!c) return '?';
      const f = c.faces[c.collapsed ?? 0];
      return `${({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T' } as Record<number, string>)[f.rank] ?? f.rank}${f.suit}${c.faces.length > 1 && c.collapsed === null ? '~' : ''}`;
    });
  },
};

process.on('message', async (m: { id: number; op: string; src?: string; arg?: unknown; ms?: number }) => {
  try {
    let value: unknown;
    if (m.op === 'advance') { advance(m.ms ?? 0); value = sent; }
    else if (m.op === 'eval') value = await new AsyncFunction('ctx', 'arg', m.src)(ctx, m.arg);
    else if (m.op === 'sent') value = sent;
    else if (m.op === 'now') value = vnow;
    process.send!({ id: m.id, ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) });
  } catch (err) {
    process.send!({ id: m.id, ok: false, error: String((err as Error)?.stack ?? err) });
  }
});
process.on('disconnect', () => process.exit(0));

http.listen(Number(process.env.PORT ?? 3419), '127.0.0.1', () => {
  process.send!({ type: 'listening', port: (http.address() as { port: number }).port, now: vnow });
});
