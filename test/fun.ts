/**
 * Fun, measured from the player's chair.
 *
 * `metrics` and `runs` watch all-bot tables. A player's run is not that: it
 * is one human seat at a solo table, so the run ends the moment they bust,
 * the Market waits for them, and every second a bot spends thinking is a
 * second the player spends watching. This harness plays that run.
 *
 * The "player" is a real human seat (not `isBot`), so every solo rule
 * applies, driven by the bots' own decision code with a human's pace: a few
 * seconds per decision and time to read the Market. Everything runs on a
 * simulated clock (the engine's real 120ms tick), so a 10-minute run takes
 * seconds and the times reported are game time, not harness time.
 *
 * It reports what predicts fun: the run arc (does it build to a climax), the
 * difficulty curve by ante, build diversity by coven, how often the
 * impossible hands show up, decision density, and dead time.
 *
 * Run: npx tsx test/fun.ts [runs] [first-seed] [--json out.json] [--coven id]
 *      [--skill novice|adept|master] [--hex n] [--demo] [--demo-antes n]
 *      [--player adept|cautious] [--no-phylactery] [--wall]
 *
 * --demo plays the Next Fest demo's table: its three covens, and the run cut
 * off after DEMO_ANTES antes (or --demo-antes). --no-phylactery plays the same
 * code with the player's Hex I buy-back taken away, for a same-seed A/B.
 */
import { mock } from 'node:test';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Engine, bigBlindAt } from '../server/game/engine';
import { decideAction, decideCast, decideResponse, decideScribe, decideShop, previewClock } from '../server/game/bots';
import { alive, byId, castableSigils, handCards, live, modsFor, totalPot } from '../server/game/table';
import { evaluate } from '../shared/hand';
import { COVENS } from '../shared/covens';
import { RELICS, RELIC_BY_ID, type RelicDef } from '../shared/relics';
import { SIGIL_BY_ID, defOf } from '../shared/sigils';
import { Rng } from '../shared/rng';
import { DEFAULT_CONFIG, type BotSkill, type RoomConfig } from '../shared/types';
import { DEMO_ANTES, DEMO_COVENS } from '../shared/demo';
import { LINGER_MS, lingerFor } from '../src/components/shell/prefs';
import type { FxEvent } from '../shared/protocol';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const VALUED = new Set(['--json', '--coven', '--skill', '--hex', '--merge', '--player', '--demo-antes']);
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(args[i - 1])));
const RUNS = Number(positional[0] ?? 12);
const FIRST = Number(positional[1] ?? 0);
const JSON_OUT = flag('--json');
const ONLY_COVEN = flag('--coven');
const SKILL = (flag('--skill') ?? 'adept') as BotSkill;
const HEX = Number(flag('--hex') ?? 1);
const DEMO = args.includes('--demo');
const DEMO_LEN = Number(flag('--demo-antes') ?? DEMO_ANTES);
const NO_PHYLACTERY = args.includes('--no-phylactery');
const WALL = args.includes('--wall');
/**
 * Who sits in the player's chair. `adept` plays the bots' own decision code at
 * full heat: aggressive, the hardest case. `cautious` is a newcomer still
 * learning the table: the same code, but at the bots' opening warmth for the
 * first two antes (fewer bets, raises and bluffs, smaller sizes).
 */
const PLAYER = (flag('--player') ?? 'adept') as 'adept' | 'cautious';

const STEP = 120;
/** A human's pace. Generous to the game: real players are slower. */
const THINK_MS = 3500;
const RESPOND_MS = 2500;
const BROWSE_MS = 20000;
const RUN_CAP_MS = 60 * 60_000;
const IMPOSSIBLE = /Five of a Kind|Flush House|Flush Five/;
const YOU = 'you';

export interface AnteRow {
  ante: number;
  hands: number;
  /** Your stack at the first hand of the ante, in big blinds. */
  stackBB: number;
  /** Mean pot at payout, in big blinds and in chips. */
  potBB: number;
  potChips: number;
  allIns: number;
  casts: number;
  impossible: number;
  /** The big blind at the ante's first hand. */
  bb?: number;
  /** Seconds of game time when the ante's first hand was dealt. */
  atS?: number;
}

export interface RunReport {
  seed: string;
  coven: string;
  won: boolean;
  bustAnte: number | null;
  finalAnte: number;
  hands: number;
  minutes: number;
  /** Seconds of game time to the first moment worth telling someone about. */
  firstMomentS: number | null;
  firstMomentKind: string | null;
  firstMarketS: number | null;
  impossibleSeen: number;
  impossibleYours: number;
  firstImpossibleAnte: number | null;
  impossibleCtx?: Array<{ ante: number; hand: string; yours: boolean; omens: string[] }>;
  biggestPotChips: number;
  biggestPotAnte: number;
  biggestPotHand: number;
  /** Seconds of game time, by what the player was doing. */
  time: Record<string, number>;
  decisions: { bets: number; facingBet: number; checkOnly: number; casts: number; castChances: number;
    responses: number; responseChances: number; buys: number; writes: number; markets: number };
  relics: string[];
  castSchools: Record<string, number>;
  castIds: string[];
  omens: string[];
  antes: AnteRow[];
  /**
   * Wall time the engine held the thread per 120ms tick (bot decisions, deals,
   * showdowns). The server is one thread, so a long tick is a frozen table.
   * Measured on whatever machine runs this, under batch load: compare runs,
   * not absolutes.
   */
  stall?: { ticks: number; maxMs: number; over100: number; over500: number; totalMs: number };
  /** A bust the phylactery caught (Hex I, before ante 3): the run went on. */
  revived?: { ante: number; hand: number; by: string; theirs: string; you: string[]; facedAllIn: boolean };
  /** A demo run that reached its last ante and the wishlist screen. */
  demoComplete?: boolean;
  /**
   * Seconds a spell card covered the middle of the table, at each Spell cards
   * setting's linger (StackOverlay LINGER_MS): in all, and while it was your
   * turn to act. A live stack always shows; a resolved one lingers, until the
   * next hand clears it.
   */
  overlay?: Record<string, { total: number; yourTurn: number }>;
  /**
   * Every relic the Market offered you, what it cost, what you held, and
   * whether you bought it. The harness's player buys greedily (bots.ts
   * decideShop: a relic first, whenever it can afford one), so a pick rate
   * here measures what a relic costs against the shards in hand, not how much
   * a player wants it.
   */
  offers?: Array<{ ante: number; relic: string; price: number; shards: number; bought: boolean }>;
  /**
   * How often each relic (or coven creed) you owned changed something: an
   * engine rule logged under its id, or, for a relic that rewrites how hands
   * are read, a showdown you reached where your hand read differently without
   * it. Keyed by relic id.
   */
  fires?: Record<string, number>;
  /** Showdowns you reached, by the category your hand read as. */
  madeCats?: Record<string, number>;
  /** Pots you won, by the category named (uncontested pots as "Uncontested"). */
  wonCats?: Record<string, number>;
  /** How the run ended, when it ended in a bust: the hand, and what you did in it. */
  bust?: { ante: number; hand: number; by: string; theirs: string; yours: string | null; you: string[]; facedAllIn: boolean };
}

/**
 * Auto's memory of sigils seen, kept across the runs of one process: a chunk
 * of seven seeds replays one player's first seven runs, in order, so the Auto
 * figure is the average over a player's first week, not their first hour.
 */
const seenAcrossRuns = new Map<string, number>();

function playRun(seed: string, coven: string): RunReport {
  const fxLog: FxEvent[] = [];
  const cfg: Partial<RoomConfig> = { ...DEFAULT_CONFIG, seed, botSkill: SKILL, hex: HEX, ...(DEMO ? { demoAntes: DEMO_LEN } : {}) };
  const e = new Engine('FUN1', YOU, cfg, (fx) => { for (const f of fx) fxLog.push(f); }, () => {});
  const t = e.table;
  const rng = new Rng(`fun:${seed}`);
  const t0 = Date.now();
  const time: Record<string, number> = {};
  const add = (k: string, ms: number): void => { time[k] = (time[k] ?? 0) + ms / 1000; };
  const dec = { bets: 0, facingBet: 0, checkOnly: 0, casts: 0, castChances: 0, responses: 0, responseChances: 0, buys: 0, writes: 0, markets: 0 };
  const antes = new Map<number, AnteRow & { pots: number[] }>();
  const row = (a: number) => {
    let r = antes.get(a);
    if (!r) { r = { ante: a, hands: 0, stackBB: 0, potBB: 0, potChips: 0, allIns: 0, casts: 0, impossible: 0, pots: [] }; antes.set(a, r); }
    return r;
  };
  const castIds: string[] = [];
  const castSchools: Record<string, number> = {};
  const impossibleCtx: Array<{ ante: number; hand: string; yours: boolean; omens: string[] }> = [];
  let impossibleSeen = 0;
  let impossibleYours = 0;
  let firstImpossibleAnte: number | null = null;
  let biggest = { chips: 0, ante: 0, hand: 0 };
  let firstMoment: { s: number; kind: string } | null = null;
  let firstMarketS: number | null = null;
  let bustAnte: number | null = null;
  const moment = (kind: string) => { if (!firstMoment) firstMoment = { s: (Date.now() - t0) / 1000, kind }; };

  e.addPlayer(YOU, 'You');
  const me = byId(t, YOU)!;
  /**
   * A cautious player takes the bots' opening warmth (bots.ts `warmth`), which
   * the decision code only applies to a seat marked as a bot. The flag is
   * set for the length of one synchronous decision; nothing else runs then.
   */
  const asPlayer = <T>(decide: () => T): T => {
    if (PLAYER !== 'cautious') return decide();
    me.isBot = true;
    try { return decide(); } finally { me.isBot = false; }
  };
  me.coven = coven;
  for (let i = 0; i < 3; i++) e.addBot();
  if (!e.start().ok) throw new Error('start failed');
  if (NO_PHYLACTERY) me.phylactery = false;
  let revived: RunReport['revived'];
  // The spell overlay, replayed at each setting's linger.
  const overlay: Record<string, { total: number; yourTurn: number }> = {};
  for (const k of [...Object.keys(LINGER_MS), 'auto']) overlay[k] = { total: 0, yourTurn: 0 };
  let resolvedAt = -Infinity;
  let resolvedHand = -1;
  let stackWasLive = false;
  // Auto remembers across runs (seenAcrossRuns below).
  const seenCount = seenAcrossRuns;
  let liveTop: { sigilId: string; scribed: boolean } | null = null;
  let autoMs = 0;

  const offers: NonNullable<RunReport['offers']> = [];
  const fires: Record<string, number> = {};
  const fire = (id: string, n = 1): void => { fires[id] = (fires[id] ?? 0) + n; };
  const madeCats: Record<string, number> = {};
  const wonCats: Record<string, number> = {};
  const seenLog = new Set<string>();

  let lastHand = 0;
  let nextAt = 0;
  let castsThisTurn = 0;
  let turnKey = '';
  let respondedTo = '';
  let marketKey = '';
  let foldedThisHand = false;
  let myActions: string[] = [];
  let facedAllIn = false;
  let elapsed = 0;
  const stall = { ticks: 0, maxMs: 0, over100: 0, over500: 0, totalMs: 0 };

  while (t.phase !== 'gameover' && elapsed < RUN_CAP_MS) {
    // ---- bookkeeping on what the engine just said
    for (const f of fxLog.splice(0)) {
      if (f.t === 'win') {
        if (f.playerId === YOU) {
          const cat = f.handName === 'Last one standing' ? 'Uncontested' : catOf(f.handName);
          wonCats[cat] = (wonCats[cat] ?? 0) + 1;
        }
        const r = row(t.ante);
        if (IMPOSSIBLE.test(f.handName)) {
          impossibleSeen++; r.impossible++;
          if (f.playerId === YOU) impossibleYours++;
          impossibleCtx.push({ ante: t.ante, hand: f.handName, yours: f.playerId === YOU, omens: t.omens.map((o) => o.id) });
          if (firstImpossibleAnte === null) firstImpossibleAnte = t.ante;
          moment('impossible hand');
        }
      }
      if (f.t === 'cast') {
        row(t.ante).casts++;
        if (f.casterId === YOU) {
          moment('you cast a sigil');
          castIds.push(f.sigilId);
          const d = SIGIL_BY_ID[f.sigilId];
          if (d) castSchools[d.school] = (castSchools[d.school] ?? 0) + 1;
        }
      }
      if (f.t === 'counter') moment('a counterspell');
      if (f.t === 'chips' && f.allIn) row(t.ante).allIns++;
      if (f.t === 'eliminate' && f.playerId === YOU) bustAnte = t.ante;
      if (f.t === 'banner' && /A new rule/.test(f.sub ?? '')) moment('an omen');
    }
    // Rules that log under a relic's id (log entries carry `rule`).
    for (let i = t.log.length - 1; i >= 0; i--) {
      const l = t.log[i] as { id: string; playerId?: string; rule?: string };
      if (seenLog.has(l.id)) break;
      seenLog.add(l.id);
      if (l.rule && l.playerId === YOU) fire(l.rule);
    }
    if (t.handNumber !== lastHand) {
      lastHand = t.handNumber;
      foldedThisHand = false;
      myActions = []; facedAllIn = false;
      const r = row(t.ante);
      if (r.hands === 0) { r.stackBB = me.chips / t.bb; r.bb = t.bb; r.atS = (Date.now() - t0) / 1000; }
      r.hands++;
    }
    if (t.phase === 'payout' && t.payout && !(t.payout as { _seen?: boolean })._seen) {
      (t.payout as { _seen?: boolean })._seen = true;
      const amt = t.payout.pots.reduce((a, p) => a + p.amount, 0);
      // A showdown you reached: what your hand read as, and which of your
      // relics changed that reading.
      const mine = t.payout.entries.find((x) => x.playerId === YOU && x.cards.length > 0);
      if (mine && !me.folded) {
        const cat = catOf(mine.handName);
        madeCats[cat] = (madeCats[cat] ?? 0) + 1;
        const read = () => evaluate({ cards: handCards(t, me), viewerId: YOU, mods: modsFor(t, me) }).score;
        const full = read();
        const owned = [...me.relics];
        for (const id of owned) {
          if (!RELIC_BY_ID[id]?.mods) continue;
          me.relics = owned.filter((x) => x !== id);
          try { if (read() !== full) fire(id); } finally { me.relics = owned; }
        }
      }
      row(t.ante).pots.push(amt);
      if (amt > biggest.chips) biggest = { chips: amt, ante: t.ante, hand: t.handNumber };
    }
    if (me.folded && !me.eliminated) foldedThisHand = true;
    if (me.revived && !revived) {
      revived = { ante: me.revived.ante, hand: me.revived.hand, by: me.revived.name, theirs: me.revived.handName, you: [...myActions], facedAllIn };
    }

    // ---- what the player is doing right now, for the time ledger
    const now = Date.now();
    const pendingMe = !!t.stack && t.stack.pending.includes(YOU);
    let state: string;
    if (t.phase === 'shop') {
      if (firstMarketS === null) firstMarketS = (now - t0) / 1000;
      state = me.shopDone ? 'market: waiting on bots' : 'market: you shopping';
    } else if (t.actingId === YOU && !t.stack) state = 'your turn';
    else if (pendingMe) state = 'your response window';
    else if (t.stack) state = foldedThisHand ? 'watching spells (folded)' : 'watching spells';
    else if (t.actingId) state = foldedThisHand ? 'watching bots bet (folded)' : 'watching bots bet';
    else if (t.phase === 'payout' || t.phase === 'showdown') state = 'showdown and payout';
    else state = 'deal, streets, banners';
    add(state, STEP);

    // ---- the spell overlay: what it would cover at each setting
    const stackLive = !!t.stack && t.stack.entries.length > 0;
    if (stackLive) {
      const top = t.stack!.entries[t.stack!.entries.length - 1];
      liveTop = { sigilId: top.sigilId, scribed: !!top.scribed };
    }
    if (stackWasLive && !stackLive) {
      resolvedAt = now; resolvedHand = t.handNumber;
      if (liveTop) {
        const n = seenCount.get(liveTop.sigilId) ?? 0;
        autoMs = lingerFor('auto', n, liveTop.scribed);
        seenCount.set(liveTop.sigilId, n + 1);
      }
    }
    stackWasLive = stackLive;
    for (const [k, ms] of [...Object.entries(LINGER_MS), ['auto', autoMs] as const]) {
      // Off shows a live stack only when you can answer it.
      const showsLive = stackLive && (k !== 'off' || pendingMe);
      const lingers = !stackLive && resolvedHand === t.handNumber && now - resolvedAt < ms;
      if (showsLive || lingers) {
        overlay[k].total += STEP / 1000;
        if (state === 'your turn') overlay[k].yourTurn += STEP / 1000;
      }
    }

    // ---- the player acts, at a human pace
    if (t.phase === 'shop' && !me.shopDone && !me.eliminated) {
      const key = `m${t.ante}`;
      if (marketKey !== key) {
        marketKey = key; nextAt = now + BROWSE_MS; dec.markets++;
        for (const it of t.shop.get(YOU)?.items ?? []) {
          if (it.kind === 'relic') offers.push({ ante: t.ante, relic: it.id, price: it.price, shards: me.shards, bought: false });
        }
      }
      if (now >= nextAt) {
        for (let guard = 0; guard < 8; guard++) {
          const page = decideScribe(t, me, rng);
          if (page && e.shopScribe(YOU, page.uid, page.text, page.replace).ok) { dec.writes++; continue; }
          const uid = decideShop(t, me, rng);
          if (uid && e.shopBuy(YOU, uid).ok) { dec.buys++; continue; }
          break;
        }
        for (const o of offers) if (o.ante === t.ante && me.relics.includes(o.relic)) o.bought = true;
        e.shopDone(YOU);
      }
    } else if (pendingMe) {
      const key = `${t.stack!.entries.length}:${t.stack!.entries[t.stack!.entries.length - 1]?.id}`;
      if (respondedTo !== key) { respondedTo = key; nextAt = now + RESPOND_MS; }
      if (now >= nextAt) {
        const hasAnswer = me.sigils.some((s) => defOf(s)?.timing.includes('response'));
        if (hasAnswer) dec.responseChances++;
        const r = decideResponse(t, me, rng);
        if (r && e.cast(YOU, r.uid, r.targets).ok) { dec.responses++; moment('you countered'); } else e.pass(YOU);
      }
    } else if (t.actingId === YOU && !t.stack) {
      const key = `${t.handNumber}:${t.phase}:${t.currentBet}:${me.bet}`;
      if (turnKey !== key) {
        turnKey = key; nextAt = now + THINK_MS;
        castsThisTurn = 0;
        if (castableSigils(t, me).length > 0) dec.castChances++;
      }
      if (now >= nextAt) {
        const spell = castsThisTurn < 2 ? asPlayer(() => decideCast(t, me, rng)) : null;
        if (spell && e.cast(YOU, spell.uid, spell.targets).ok) {
          castsThisTurn++; dec.casts++;
          const def = SIGIL_BY_ID[me.sigils.find((s) => s.uid === spell.uid)?.defId ?? ''] ?? null;
          void def;
          nextAt = now + 1200;
        } else {
          const toCall = t.currentBet - me.bet;
          if (t.players.some((q) => q.id !== YOU && q.allIn && !q.folded)) facedAllIn = true;
          const a = asPlayer(() => decideAction(t, me, rng));
          myActions.push(`${t.phase}:${a.kind}`);
          if (e.act(YOU, a).ok) {
            dec.bets++;
            if (toCall > 0) dec.facingBet++; else dec.checkOnly++;
          } else e.act(YOU, toCall > 0 ? { kind: 'fold' } : { kind: 'check' });
          turnKey = '';
        }
      }
    }

    const w0 = performance.now();
    mock.timers.tick(STEP);
    const took = performance.now() - w0;
    stall.ticks++; stall.totalMs += took;
    if (took > stall.maxMs) stall.maxMs = took;
    if (took > 100) stall.over100++;
    if (took > 500) stall.over500++;
    elapsed += STEP;
  }

  if (process.env.FUN_LOG) for (const l of t.log) process.stdout.write(`    | ${l.text}
`);
  const won = t.winnerId === YOU;
  const finalAnte = t.ante;
  const res: RunReport = {
    seed, coven, won, bustAnte: won ? null : (bustAnte ?? finalAnte), finalAnte,
    hands: t.handNumber,
    minutes: (Date.now() - t0) / 60000,
    firstMomentS: firstMoment ? (firstMoment as { s: number }).s : null,
    firstMomentKind: firstMoment ? (firstMoment as { kind: string }).kind : null,
    firstMarketS,
    impossibleSeen, impossibleYours, firstImpossibleAnte, impossibleCtx,
    biggestPotChips: biggest.chips, biggestPotAnte: biggest.ante, biggestPotHand: biggest.hand,
    time, decisions: dec,
    relics: [...me.relics],
    castSchools, castIds,
    omens: t.omens.map((o) => o.id),
    stall: { ...stall, maxMs: Math.round(stall.maxMs), totalMs: Math.round(stall.totalMs) },
    revived,
    demoComplete: t.demoComplete,
    overlay,
    offers, fires, madeCats, wonCats,
    bust: !won && me.bustedBy ? {
      ante: me.bustedBy.ante, hand: me.bustedBy.hand, by: me.bustedBy.name, theirs: me.bustedBy.handName,
      yours: me.bustedBy.yourHand ?? null, you: myActions, facedAllIn,
    } : undefined,
    antes: [...antes.values()].sort((a, b) => a.ante - b.ante).map(({ pots, ...r }) => ({
      ...r,
      potChips: pots.length ? Math.round(pots.reduce((a, b) => a + b, 0) / pots.length) : 0,
      potBB: pots.length ? +(pots.reduce((a, b) => a + b, 0) / pots.length / (r.bb || bbAt(r.ante))).toFixed(1) : 0,
      stackBB: +r.stackBB.toFixed(1),
    })),
  };
  e.dispose();
  return res;
}

/** A hand's category from the name the showdown gives it ("Pair of Kings" -> "Pair"). */
function catOf(name: string): string {
  const head = name.split(',')[0];
  if (/^Pair of /.test(head)) return 'Pair';
  if (/^\w+ High$/.test(head)) return 'High Card';
  if (head === 'Royal Flush') return 'Straight Flush';
  return head;
}

/** The big blind at an ante, as the engine computes it with no omen in play. */
function bbAt(ante: number): number {
  return bigBlindAt(200, ante - 1);
}

// The player's own casts are counted from the fx stream; this tags schools.
const castHook = (id: string, out: RunReport) => {
  const d = SIGIL_BY_ID[id];
  if (d) out.castSchools[d.school] = (out.castSchools[d.school] ?? 0) + 1;
};
void castHook;

// --merge <dir>: summarise the part*.json files a parallel batch wrote.
const MERGE = flag('--merge');
if (MERGE) {
  const all: RunReport[] = readdirSync(MERGE).filter((f) => /^part\d+\.json$/.test(f))
    .flatMap((f) => JSON.parse(readFileSync(join(MERGE, f), 'utf8')) as RunReport[]);
  summarise(all);
  process.exit(0);
}

mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: Date.UTC(2026, 9, 9, 12) });
// The bots' look-ahead budget (30ms a decision) reads a clock. On the wall
// clock a loaded machine (ten of these in parallel) skipped previews an idle
// one would run, so the same seed played differently from batch to batch.
// Here every read of the clock costs 6ms, so a decision gets five previews,
// about what an idle machine fits in its budget, and a seed replays exactly.
// --wall uses the real clock instead, to measure how long the engine holds
// the thread the way the shipped game would.
let previewTicks = 0;
if (!WALL) previewClock.now = () => (previewTicks += 6);
const warn = console.warn; const err = console.error;
console.warn = () => {}; console.error = () => {};

const covens = ONLY_COVEN ? [ONLY_COVEN] : DEMO ? [...DEMO_COVENS] : COVENS.map((c) => c.id);
const reports: RunReport[] = [];
for (let i = FIRST; i < FIRST + RUNS; i++) {
  const coven = covens[i % covens.length];
  reports.push(playRun(`fun-${i}`, coven));
}
mock.timers.reset();
console.warn = warn; console.error = err;

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(reports, null, 1));
summarise(reports);
void alive; void live; void totalPot; void RELIC_BY_ID;

export function summarise(rs: RunReport[]): void {
  const n = rs.length;
  const avg = (f: (r: RunReport) => number) => rs.reduce((a, r) => a + f(r), 0) / Math.max(1, n);
  const pct = (k: number, d = n) => `${d ? Math.round((k / d) * 100) : 0}%`;
  console.log(`\n════ HEXHOLD from the player's chair · ${n} solo runs · ${SKILL} bots · Hex ${HEX} · ${PLAYER} player${NO_PHYLACTERY ? ' · no phylactery' : ''}${DEMO ? ` · demo, ${DEMO_LEN} antes` : ''} ════`);
  console.log(`  won ${rs.filter((r) => r.won).length}/${n} · avg ${avg((r) => r.hands).toFixed(1)} hands · ${avg((r) => r.minutes).toFixed(1)} min · final ante ${avg((r) => r.finalAnte).toFixed(1)}`);
  const firsts = rs.filter((r) => r.firstMomentS !== null);
  console.log(`  first moment worth telling a friend: median ${median(firsts.map((r) => r.firstMomentS!)).toFixed(0)}s (${tally(firsts.map((r) => r.firstMomentKind!))})`);
  console.log(`  first Market: median ${median(rs.filter((r) => r.firstMarketS !== null).map((r) => r.firstMarketS!)).toFixed(0)}s`);
  console.log(`  impossible hand seen: ${pct(rs.filter((r) => r.impossibleSeen > 0).length)} of runs · yours ${pct(rs.filter((r) => r.impossibleYours > 0).length)} · first at ante ${median(rs.filter((r) => r.firstImpossibleAnte).map((r) => r.firstImpossibleAnte!)).toFixed(1)} (median)`);

  const early = (a: number) => rs.filter((r) => r.antes.some((x) => x.ante <= a && x.impossible > 0)).length;
  console.log(`  impossible hand by ante 2: ${pct(early(2))} · by ante 3: ${pct(early(3))} · by ante 4: ${pct(early(4))} · per run ${(rs.reduce((a, r) => a + r.impossibleSeen, 0) / n).toFixed(2)}`);
  const ante1 = rs.filter((r) => r.bust && r.bust.ante === 1);
  if (ante1.length) {
    const shoved = ante1.filter((r) => r.bust!.you.some((a) => /allin|raise|bet/.test(a))).length;
    console.log(`  ante-1 busts: ${ante1.length} · you bet or raised in the hand ${shoved} · you only called/checked ${ante1.length - shoved} · facing an all-in ${ante1.filter((r) => r.bust!.facedAllIn).length} · lost to ${tally(ante1.map((r) => r.bust!.theirs.split(',')[0]), 4)}`);
  }
  console.log(`  run over before the first Market ${pct(rs.filter((r) => r.bustAnte === 1).length)} · before ante 3 ${pct(rs.filter((r) => r.bustAnte !== null && r.bustAnte < 3).length)} · survived 3 antes ${pct(rs.filter((r) => r.finalAnte >= 4 || r.won || (r.demoComplete && r.finalAnte >= 3)).length)}`);
  // Every bust, whether it ended the run or the phylactery caught it.
  const firstBust = (r: RunReport): number | null => r.revived?.ante ?? r.bustAnte;
  const caught = rs.filter((r) => r.revived);
  console.log(`  busted (caught or not) before the first Market ${pct(rs.filter((r) => firstBust(r) === 1).length)} · before ante 3 ${pct(rs.filter((r) => (firstBust(r) ?? 99) < 3).length)} · phylactery caught ${caught.length} (at ante 1: ${caught.filter((r) => r.revived!.ante === 1).length}) · of those, reached ante 3 ${caught.filter((r) => r.finalAnte >= 3).length}, saw a Market ${caught.filter((r) => r.finalAnte >= 2).length}, won ${caught.filter((r) => r.won).length}`);
  if (DEMO) {
    console.log(`  demo: reached the wishlist screen ${pct(rs.filter((r) => r.demoComplete).length)} · impossible hand inside the demo ${pct(rs.filter((r) => r.impossibleSeen > 0).length)} · yours ${pct(rs.filter((r) => r.impossibleYours > 0).length)} · minutes ${avg((r) => r.minutes).toFixed(1)}`);
  }
  const ov = rs.filter((r) => r.overlay);
  if (ov.length) {
    const yt = avg((r) => r.time['your turn'] ?? 0);
    const tt = avg((r) => Object.values(r.time).reduce((a, b) => a + b, 0));
    const parts = [...Object.keys(LINGER_MS), 'auto'].map((k) => {
      const tot = ov.reduce((a, r) => a + r.overlay![k].total, 0) / ov.length;
      const yours = ov.reduce((a, r) => a + r.overlay![k].yourTurn, 0) / ov.length;
      return `${k === 'auto' ? 'auto (first 7 runs)' : k} ${((tot / tt) * 100).toFixed(0)}% of the run, ${((yours / Math.max(1, yt)) * 100).toFixed(0)}% of your turns`;
    });
    console.log(`  a spell card covers the table: ${parts.join(' · ')}`);
  }
  console.log('\n  DIFFICULTY (bust hazard by ante: busted here / reached)');
  const maxA = Math.max(...rs.map((r) => r.finalAnte));
  for (let a = 1; a <= maxA; a++) {
    const reached = rs.filter((r) => r.finalAnte >= a).length;
    const bust = rs.filter((r) => r.bustAnte === a).length;
    const ar = rs.flatMap((r) => r.antes.filter((x) => x.ante === a));
    const sbb = ar.length ? ar.reduce((s, x) => s + x.stackBB, 0) / ar.length : 0;
    const pot = ar.length ? ar.reduce((s, x) => s + x.potBB, 0) / ar.length : 0;
    const potc = ar.length ? ar.reduce((s, x) => s + x.potChips, 0) / ar.length : 0;
    const ai = ar.length ? ar.reduce((s, x) => s + x.allIns / Math.max(1, x.hands), 0) / ar.length : 0;
    const casts = ar.length ? ar.reduce((s, x) => s + x.casts / Math.max(1, x.hands), 0) / ar.length : 0;
    const imp = ar.reduce((s, x) => s + x.impossible, 0);
    console.log(`    ante ${String(a).padStart(2)}  reached ${String(reached).padStart(3)}  bust ${pct(bust, reached).padStart(4)}  your stack ${sbb.toFixed(0).padStart(3)}bb  pot ${pot.toFixed(1).padStart(5)}bb (${Math.round(potc).toLocaleString().padStart(6)})  all-ins/hand ${ai.toFixed(2)}  casts/hand ${casts.toFixed(1)}  impossible ${imp}`);
  }

  const st = rs.filter((r) => r.stall);
  if (st.length) {
    const ticks = st.reduce((a, r) => a + r.stall!.ticks, 0);
    const maxes = st.map((r) => r.stall!.maxMs);
    console.log(`  server stalls: ticks over 100ms ${(st.reduce((a, r) => a + r.stall!.over100, 0) / ticks * 100).toFixed(2)}% · over 500ms ${st.reduce((a, r) => a + r.stall!.over500, 0)} in ${st.length} runs · worst tick per run median ${median(maxes).toFixed(0)}ms, max ${Math.max(...maxes).toFixed(0)}ms · engine wall time per run ${(st.reduce((a, r) => a + r.stall!.totalMs, 0) / st.length / 1000).toFixed(0)}s`);
  }

  console.log('\n  RUN ARC');
  console.log(`    biggest pot lands at ${avg((r) => r.biggestPotHand / Math.max(1, r.hands) * 100).toFixed(0)}% of the run on average; in the last 3 hands in ${pct(rs.filter((r) => r.hands - r.biggestPotHand < 3).length)} of runs`);

  console.log('\n  WHERE THE PLAYER\'S TIME GOES');
  const keys = [...new Set(rs.flatMap((r) => Object.keys(r.time)))];
  const tot = avg((r) => Object.values(r.time).reduce((a, b) => a + b, 0));
  for (const k of keys.sort((a, b) => avg((r) => r.time[b] ?? 0) - avg((r) => r.time[a] ?? 0))) {
    const s = avg((r) => r.time[k] ?? 0);
    console.log(`    ${k.padEnd(28)} ${s.toFixed(0).padStart(5)}s  ${((s / tot) * 100).toFixed(0).padStart(3)}%`);
  }

  console.log('\n  DECISIONS (per run)');
  const d = (k: keyof RunReport['decisions']) => avg((r) => r.decisions[k]);
  const mins = avg((r) => r.minutes);
  console.log(`    bets ${d('bets').toFixed(1)} (facing a bet ${d('facingBet').toFixed(1)}, free ${d('checkOnly').toFixed(1)}) · turns with a castable sigil ${d('castChances').toFixed(1)} · casts ${d('casts').toFixed(1)}`);
  console.log(`    response windows holding an answer ${d('responseChances').toFixed(1)} · answered ${d('responses').toFixed(1)} · markets ${d('markets').toFixed(1)} · buys ${d('buys').toFixed(1)} · pages written ${d('writes').toFixed(1)}`);
  const choices = d('facingBet') + d('castChances') + d('responseChances') + d('markets');
  console.log(`    real choices per minute ${(choices / Math.max(0.1, mins)).toFixed(1)}`);

  console.log('\n  BUILDS (by coven)');
  for (const c of COVENS) {
    const cr = rs.filter((r) => r.coven === c.id);
    if (!cr.length) continue;
    const relics = tally(cr.flatMap((r) => r.relics.filter((x) => x !== c.relic)), 3);
    console.log(`    ${c.name.padEnd(16)} runs ${cr.length}  won ${cr.filter((r) => r.won).length}  ante ${(cr.reduce((a, r) => a + r.finalAnte, 0) / cr.length).toFixed(1)}  impossible ${pct(cr.filter((r) => r.impossibleSeen > 0).length, cr.length)}  bought ${relics || '—'}`);
  }
  relicReport(rs);
  covenFeel(rs);
  const sets = rs.map((r) => new Set(r.relics));
  let sim = 0; let pairs = 0;
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
    const a = sets[i]; const b = sets[j];
    const inter = [...a].filter((x) => b.has(x)).length;
    const uni = new Set([...a, ...b]).size;
    if (uni) { sim += inter / uni; pairs++; }
  }
  console.log(`    relic-set overlap between runs (Jaccard) ${(pairs ? sim / pairs : 0).toFixed(2)} · distinct relics owned across runs ${new Set(rs.flatMap((r) => r.relics)).size}`);
  console.log(`    omens seen across runs ${new Set(rs.flatMap((r) => r.omens)).size} · most common ${tally(rs.flatMap((r) => r.omens), 4)}`);
}

/** What kind of thing a relic is, read from the fields it sets. */
export function relicKind(r: RelicDef): 'number' | 'information' | 'rule' {
  const rec = r as unknown as Record<string, unknown>;
  if (rec.rule || r.mods || r.deal) return 'rule';
  if (r.onWin && (r.onWin as Record<string, unknown>).engrave) return 'rule';
  if (r.vision) return 'information';
  return 'number';
}

/**
 * Relics from the player's chair: what the Market offered, what was bought
 * (a greedy buyer: see RunReport.offers), and, for every relic owned, how
 * often its rule changed something in a run that held it.
 */
function relicReport(rs: RunReport[]): void {
  const withOffers = rs.filter((r) => r.offers);
  if (!withOffers.length) return;
  const covenRelic = new Set(COVENS.map((c) => c.relic).filter(Boolean) as string[]);
  const offered = new Map<string, number>();
  const bought = new Map<string, number>();
  for (const r of withOffers) for (const o of r.offers!) {
    offered.set(o.relic, (offered.get(o.relic) ?? 0) + 1);
    if (o.bought) bought.set(o.relic, (bought.get(o.relic) ?? 0) + 1);
  }
  const owners = new Map<string, RunReport[]>();
  for (const r of rs) for (const id of new Set(r.relics)) owners.set(id, [...(owners.get(id) ?? []), r]);
  const kinds = { number: 0, information: 0, rule: 0 };
  for (const x of RELICS) kinds[relicKind(x)]++;
  console.log("\n  RELICS (the Market's shelf; coven relics and creeds are counted where owned)");
  console.log(`    the shelf: ${RELICS.length} relics, ${kinds.rule} change a rule, ${kinds.information} give information, ${kinds.number} are a number`);
  const offers = withOffers.reduce((a, r) => a + r.offers!.length, 0);
  const buys = withOffers.reduce((a, r) => a + r.offers!.filter((o) => o.bought).length, 0);
  console.log(`    offered ${offers} (${(offers / withOffers.length).toFixed(1)} a run), bought ${buys} (${Math.round((buys / Math.max(1, offers)) * 100)}%); a greedy buyer, so this is affordability, not appeal`);
  // Per Market visit (one a run per ante; the harness never rerolls): how
  // often a relic was bought, and how often the shelf put two relics the
  // player could afford side by side, which is a choice between relics.
  const visits = withOffers.flatMap((r) => [...new Set(r.offers!.map((o) => o.ante))]
    .map((a) => r.offers!.filter((o) => o.ante === a)));
  const choiceVisits = visits.filter((v) => v.filter((o) => o.price <= o.shards).length >= 2).length;
  console.log(`    Market visits ${visits.length}: a relic bought at ${Math.round(visits.filter((v) => v.some((o) => o.bought)).length / Math.max(1, visits.length) * 100)}% · two affordable relics side by side at ${Math.round(choiceVisits / Math.max(1, visits.length) * 100)}% (${(choiceVisits / withOffers.length).toFixed(1)} a run)`);
  const boughtIds = withOffers.flatMap((r) => r.offers!.filter((o) => o.bought).map((o) => o.relic));
  const boughtKinds = { number: 0, information: 0, rule: 0 };
  for (const id of boughtIds) { const d = RELIC_BY_ID[id]; if (d) boughtKinds[relicKind(d)]++; }
  console.log(`    bought, by kind: rule ${boughtKinds.rule}, information ${boughtKinds.information}, number ${boughtKinds.number} · distinct bought ${new Set(boughtIds).size} of ${RELICS.length}`);
  // Shannon entropy of what was bought, against the most it could be.
  const counts = [...new Set(boughtIds)].map((id) => boughtIds.filter((x) => x === id).length);
  const H = -counts.reduce((a, c) => a + (c / boughtIds.length) * Math.log2(c / boughtIds.length), 0);
  console.log(`    spread of purchases: ${H.toFixed(2)} bits of ${Math.log2(RELICS.length).toFixed(2)} possible`);
  const ownedRuns = rs.map((r) => r.relics.filter((id) => !covenRelic.has(id) && !(RELIC_BY_ID[id] as unknown as { coven?: string })?.coven));
  const ruleOwned = ownedRuns.map((ids) => ids.filter((id) => RELIC_BY_ID[id] && relicKind(RELIC_BY_ID[id]) === 'rule').length);
  console.log(`    a run's bought relics that change a rule: ${(ruleOwned.reduce((a, b) => a + b, 0) / rs.length).toFixed(2)} of ${(ownedRuns.reduce((a, b) => a + b.length, 0) / rs.length).toFixed(2)} · runs owning at least one rule relic beyond the coven's ${Math.round(ruleOwned.filter((n) => n > 0).length / rs.length * 100)}%`);
  const firedRuns = rs.filter((r) => Object.entries(r.fires ?? {}).some(([id, n]) => n > 0 && !covenRelic.has(id) && !(RELIC_BY_ID[id] as unknown as { coven?: string })?.coven));
  console.log(`    runs where a bought relic's rule visibly fired: ${Math.round(firedRuns.length / rs.length * 100)}%`);
  const ids = [...new Set([...offered.keys(), ...owners.keys()])]
    .sort((a, b) => (owners.get(b)?.length ?? 0) - (owners.get(a)?.length ?? 0));
  console.log('    relic                       kind         offered  bought  owned-runs  fires/run  won');
  for (const id of ids) {
    const d = RELIC_BY_ID[id];
    if (!d) continue;
    const own = owners.get(id) ?? [];
    const fired = own.reduce((a, r) => a + (r.fires?.[id] ?? 0), 0);
    const tag = covenRelic.has(id) ? ' (coven)' : (d as unknown as { coven?: string }).coven ? ' (creed)' : '';
    console.log(`    ${(d.name + tag).padEnd(28)} ${relicKind(d).padEnd(11)} ${String(offered.get(id) ?? 0).padStart(7)}  ${String(bought.get(id) ?? 0).padStart(6)}  ${String(own.length).padStart(10)}  ${(own.length ? fired / own.length : 0).toFixed(2).padStart(9)}  ${String(own.filter((r) => r.won).length).padStart(3)}`);
  }
}

/**
 * Whether a run as one coven plays differently from a run as another: the
 * hands you make, the pots you win, and the schools you cast, by coven, and
 * how far apart the covens sit (total variation distance, 0 = identical,
 * 1 = nothing in common), averaged over every pair of covens.
 */
function covenFeel(rs: RunReport[]): void {
  if (!rs.some((r) => r.madeCats)) return;
  const BUCKET = (cat: string): string => {
    if (/Five of a Kind|Flush House|Flush Five/.test(cat)) return 'impossible';
    if (/Full House|Four of a Kind|Straight Flush/.test(cat)) return 'full+';
    if (/^Flush$/.test(cat)) return 'flush';
    if (/^Straight$/.test(cat)) return 'straight';
    if (/Three of a Kind|Two Pair/.test(cat)) return 'two pair/trips';
    if (/^Pair$/.test(cat)) return 'pair';
    if (cat === 'Uncontested') return 'uncontested';
    return 'high card';
  };
  const dist = (xs: Array<Record<string, number> | undefined>, f: (k: string) => string): Record<string, number> => {
    const out: Record<string, number> = {};
    let n = 0;
    for (const x of xs) for (const [k, v] of Object.entries(x ?? {})) { const b = f(k); out[b] = (out[b] ?? 0) + v; n += v; }
    for (const k of Object.keys(out)) out[k] /= Math.max(1, n);
    return out;
  };
  const tvd = (a: Record<string, number>, b: Record<string, number>): number => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let d = 0;
    for (const k of keys) d += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
    return d / 2;
  };
  console.log('\n  COVEN FEEL (per coven: the hands you made at showdown, your casts by school, rules fired a run)');
  const made: Record<string, Record<string, number>> = {};
  const schools: Record<string, Record<string, number>> = {};
  for (const c of COVENS) {
    const cr = rs.filter((r) => r.coven === c.id);
    if (!cr.length) continue;
    made[c.id] = dist(cr.map((r) => r.madeCats), BUCKET);
    schools[c.id] = dist(cr.map((r) => r.castSchools), (k) => k);
    const showdowns = cr.reduce((a, r) => a + Object.values(r.madeCats ?? {}).reduce((x, y) => x + y, 0), 0);
    const fires = cr.reduce((a, r) => a + Object.values(r.fires ?? {}).reduce((x, y) => x + y, 0), 0);
    const creed = (c as unknown as { creed?: string }).creed;
    const creedFires = creed ? cr.reduce((a, r) => a + (r.fires?.[creed] ?? 0), 0) : 0;
    const fmt = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ');
    console.log(`    ${c.name.padEnd(16)} won ${cr.filter((r) => r.won).length}/${cr.length} · ante ${(cr.reduce((a, r) => a + r.finalAnte, 0) / cr.length).toFixed(1)} · showdowns ${(showdowns / cr.length).toFixed(1)}/run · own impossible ${Math.round(cr.filter((r) => r.impossibleYours > 0).length / cr.length * 100)}% · first bust at ante 1 ${Math.round(cr.filter((r) => (r.revived?.ante ?? r.bustAnte) === 1).length / cr.length * 100)}% · rules fired ${(fires / cr.length).toFixed(1)}/run${creed ? ` (its creed ${(creedFires / cr.length).toFixed(1)})` : ''}`);
    console.log(`      made: ${fmt(made[c.id])}`);
    console.log(`      cast: ${fmt(schools[c.id])}`);
  }
  const ids = Object.keys(made);
  let dm = 0; let ds = 0; let pairs = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    dm += tvd(made[ids[i]], made[ids[j]]); ds += tvd(schools[ids[i]], schools[ids[j]]); pairs++;
  }
  if (pairs) console.log(`    covens apart (mean total variation distance between two covens): hands made ${(dm / pairs).toFixed(2)} · schools cast ${(ds / pairs).toFixed(2)}`);
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

function tally(xs: string[], top = 3): string {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => `${k} ${v}`).join(', ');
}

process.exit(0);
