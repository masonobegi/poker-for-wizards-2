/**
 * The orchestrator: one instance per table, owning the phase machine, the
 * clocks, and the only mutation path into a Table.
 *
 * Everything here is driven by a single scheduler rather than by scattered
 * setTimeouts, so a hand can be paused, a disconnect can be absorbed, and no
 * two timers can ever race to advance the same street.
 */
import { nanoid } from 'nanoid';
import { config } from '../config';
import { type Face, type Rank, RANK_NAME, isQuantum } from '../../shared/cards';
import type { FxEvent } from '../../shared/protocol';
import { Rng } from '../../shared/rng';
import { RELIC_BY_ID, relicNumber } from '../../shared/relics';
import { OMENS, OMEN_BY_ID, omenNumber, type ActiveOmen } from '../../shared/omens';
import {
  isStreet,
  type BetAction, type Phase, type Player, type RoomConfig, type SigilTargets, type Table,
} from '../../shared/types';
import {
  actable, alive, byId, card, createPlayer, createTable, describeCard,
  freeSeat, live, log, maxManaFor, nextSeat, seated, sigilHandSize,
} from './table';
import {
  castSigil, clearHandMagic, drawId, giveSigil, passResponse,
  randomSigil, reapConjured, resolveStack, stackReady, superposeCard,
  type MagicCtx,
} from './magic';
import { grantInformantVision, runShowdown } from './showdown';
import { buy, payInterest, reroll, rollShop } from './shop';
import { decideAction, decideCast, decideResponse, decideShop, thinkTime } from './bots';

export type Emit = (fx: FxEvent[]) => void;
export type Push = () => void;

const TICK_MS = 120;

export class Engine {
  readonly table: Table;
  private rng: Rng;
  private fx: FxEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  /** Wall-clock deadline for whatever the current phase is waiting on. */
  private deadline = 0;
  private onDeadline: (() => void) | null = null;
  private botClock = new Map<string, number>();
  /** When the table first went quiet with nothing scheduled. 0 means busy. */
  private idleSince = 0;
  /** Sigils each bot has cast in its current action window. */
  private castsThisTurn = new Map<string, number>();

  constructor(
    code: string,
    hostId: string,
    config: Partial<RoomConfig>,
    private emit: Emit,
    private push: Push,
    /** Adopt an existing table instead of dealing a fresh one (restore). */
    restore?: Table,
  ) {
    this.table = restore ?? createTable(code, hostId, config);
    this.rng = new Rng(this.table.seed);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    // A restored hand has no scheduled work; let the stall guard pick it up
    // rather than trying to reconstruct which timer was pending.
    if (restore) this.idleSince = Date.now();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private ctx(): MagicCtx {
    return { t: this.table, rng: this.rng, fx: this.fx };
  }

  private flush(): void {
    if (this.fx.length) {
      this.emit(this.fx);
      this.fx = [];
    }
    this.push();
  }

  private wait(ms: number, then: () => void): void {
    this.deadline = Date.now() + Math.round(ms * (config.pacePercent / 100));
    this.onDeadline = then;
  }

  private clearWait(): void {
    this.deadline = 0;
    this.onDeadline = null;
  }

  // -------------------------------------------------------------------- seats

  addPlayer(id: string, name: string, isBot = false): Player | null {
    const t = this.table;
    const seat = freeSeat(t);
    if (seat < 0) return null;
    const p = createPlayer(id, name, seat, t.config, isBot);
    p.maxMana = maxManaFor(p, t);
    t.players.push(p);
    log(t, `${p.name} takes a seat.`, 'plain', { playerId: p.id });
    this.flush();
    return p;
  }

  removePlayer(id: string): void {
    const t = this.table;
    const p = byId(t, id);
    if (!p) return;

    if (t.phase === 'lobby' || t.phase === 'gameover') {
      t.players = t.players.filter((q) => q.id !== id);
    } else {
      // Mid-hand: fold them out rather than tearing the hand apart.
      p.connected = false;
      p.sittingOut = true;
      if (!p.folded) this.applyAction(p, { kind: 'fold' }, true);
    }
    log(t, `${p.name} leaves the table.`, 'plain');
    if (t.hostId === id) {
      const next = t.players.find((q) => !q.isBot);
      if (next) t.hostId = next.id;
    }
    this.flush();
  }

  setConnected(id: string, connected: boolean): void {
    const p = byId(this.table, id);
    if (!p) return;
    p.connected = connected;
    p.sittingOut = !connected && this.table.phase !== 'lobby';
    this.flush();
  }

  setReady(id: string, ready: boolean): void {
    const p = byId(this.table, id);
    if (!p || this.table.phase !== 'lobby') return;
    p.ready = ready;
    this.flush();
  }

  setConfig(patch: Partial<RoomConfig>): void {
    const t = this.table;
    if (t.phase !== 'lobby') return;
    t.config = { ...t.config, ...patch };
    t.bb = t.config.baseBlind;
    t.sb = Math.floor(t.config.baseBlind / 2);
    for (const p of t.players) p.chips = t.config.startingChips;
    this.flush();
  }

  // --------------------------------------------------------------- game start

  start(): { ok: boolean; error?: string } {
    const t = this.table;
    if (t.phase !== 'lobby' && t.phase !== 'gameover') return { ok: false, error: 'Already playing' };
    if (alive(t).length < 2) return { ok: false, error: 'Two players minimum' };

    t.handNumber = 0;
    t.ante = 1;
    t.bb = t.config.baseBlind;
    t.sb = Math.floor(t.bb / 2);
    t.winnerId = null;
    t.omens = [];
    t.dealerSeat = seated(t)[0]?.seat ?? 0;
    // A new run gets a clean deck: strip anything a previous run inscribed.
    for (const c of t.cards.values()) { c.marks = []; c.memory = 0; }

    for (const p of t.players) {
      p.chips = t.config.startingChips;
      p.shards = t.config.startingShards;
      p.sigils = [];
      p.relics = [];
      p.eliminated = false;
      p.handsWon = 0;
      p.maxMana = maxManaFor(p, t);
      // Everyone opens with one counterspell, so the first bluff is never free.
      giveSigil(t, p, { uid: nanoid(8), defId: 'nullify' });
      giveSigil(t, p, randomSigil(this.rng));
    }

    log(t, 'The table is set. Ante 1.', 'magic');
    this.fx.push({ t: 'music', mood: 'table' });
    this.beginHand();
    return { ok: true };
  }

  // ---------------------------------------------------------------- hand flow

  private beginHand(): void {
    const t = this.table;

    clearHandMagic(t);
    reapConjured(t);

    t.handNumber += 1;
    t.payout = null;
    t.pot = 0;
    t.pots = [];
    t.currentBet = 0;
    t.minRaise = t.bb;
    t.board = [];
    t.discard = [];
    t.lastAggressorId = null;
    t.actedThisStreet = new Set();

    // Fold the whole card population back into a fresh draw pile. Entities
    // persist across hands, which is what lets inscriptions and memory stick.
    const contestants = alive(t);
    if (contestants.length < 2) { this.endGame(); return; }

    t.deck = this.rng.shuffle([...t.cards.keys()]);

    // Move the button.
    const next = nextSeat(t, t.dealerSeat, (p) => !p.eliminated);
    t.dealerSeat = next?.seat ?? t.dealerSeat;

    for (const p of t.players) {
      p.bet = 0;
      p.committed = 0;
      p.folded = p.eliminated || p.sittingOut;
      p.allIn = false;
      p.hole = [];
      p.lastAction = undefined;
      p.shopDone = false;
      p.maxMana = maxManaFor(p, t);
      // Two at the top of the hand, not three. At three, a measured session
      // ended every hand with four unspent mana per player out of a ceiling
      // of eight — which means casting was never a choice, only a chore you
      // could skip. Scarcity is what makes a sigil a decision.
      p.mana = Math.min(p.maxMana, p.mana + 2);

      // Two a hand, not one: the spell layer is the reason to play, and one
      // draw meant most sigils never came up in a whole run.
      const extra = relicNumber(p.relics, (r) => r.sigils?.drawPerHand)
        + omenNumber(t.omens, (o) => o.sigilDraw);
      const draws = 2 + extra;
      for (let i = 0; i < draws; i++) {
        if (p.sigils.length < sigilHandSize(p)) giveSigil(t, p, randomSigil(this.rng));
      }
    }

    t.phase = 'deal';
    log(t, `— Hand ${t.handNumber} —`, 'plain');
    this.fx.push({ t: 'sfx', name: 'deal_start' });
    this.fx.push({ t: 'sfx', name: 'card_shuffle' });

    this.dealHoleCards();
    this.postBlinds();

    t.phase = 'preflop';
    this.beginStreet(true);
  }

  private dealHoleCards(): void {
    const t = this.table;
    const ctx = this.ctx();
    const players = alive(t).filter((p) => !p.sittingOut);

    // Relics that rewrite the deal, applied before a single card moves.
    for (const p of players) {
      const seal = p.relics.map((id) => RELIC_BY_ID[id]?.deal?.sealRank).find(Boolean);
      if (seal === 'high' && !t.sealedRanks.includes(13)) {
        t.sealedRanks.push(13);
        t.modNotes.push('Kings are sealed');
        log(t, `${p.name}'s Crowned seals every King before the deal.`, 'impossible', { playerId: p.id });
        this.fx.push({ t: 'seal', rank: 13 });
      }
    }

    // Omens that change the shape of the deal itself.
    for (const a of t.omens) {
      const def = OMEN_BY_ID[a.id];
      const seal = def?.deal?.sealRank;
      if (seal && !t.sealedRanks.includes(seal)) {
        t.sealedRanks.push(seal);
        t.modNotes.push(`${RANK_NAME[seal]}s are sealed`);
      }
    }

    const omenHole = omenNumber(t.omens, (o) => o.deal?.extraHole);
    const perPlayer = players.map(
      (p) => 2 + omenHole + relicNumber(p.relics, (r) => r.deal?.extraHole),
    );
    const maxCards = Math.max(...perPlayer, 0);

    for (let round = 0; round < maxCards; round++) {
      players.forEach((p, i) => {
        if (round >= perPlayer[i]) return;
        const id = drawId(ctx);
        if (!id) return;
        p.hole.push(id);
      });
    }

    const omenQuantumHole = omenNumber(t.omens, (o) => o.deal?.quantumHole);
    for (const p of players) {
      const quantum = omenQuantumHole + relicNumber(p.relics, (r) => r.deal?.quantumHole);
      for (let i = 0; i < quantum && i < p.hole.length; i++) {
        const c = card(t, p.hole[i]);
        if (c) superposeCard(ctx, c);
      }
      const mark = p.relics.map((id) => RELIC_BY_ID[id]?.deal?.markOwn).find(Boolean);
      if (mark && p.hole.length) {
        const c = card(t, p.hole[0]);
        if (c && !c.marks.includes(mark)) {
          c.marks.push(mark);
          t.tempMarks.push({ cardId: c.id, markId: mark });
        }
      }
      this.fx.push({ t: 'deal', cardIds: p.hole, to: p.id, stagger: 80 });
    }
  }

  private postBlinds(): void {
    const t = this.table;
    const contenders = alive(t).filter((p) => !p.sittingOut);
    const heads = contenders.length === 2;

    // Heads up, the button is the small blind.
    const sbPlayer = heads
      ? contenders.find((p) => p.seat === t.dealerSeat) ?? contenders[0]
      : nextSeat(t, t.dealerSeat, (p) => !p.eliminated && !p.sittingOut) ?? contenders[0];
    const bbPlayer = nextSeat(t, sbPlayer.seat, (p) => !p.eliminated && !p.sittingOut && p.id !== sbPlayer.id)
      ?? contenders.find((p) => p.id !== sbPlayer.id) ?? contenders[0];

    this.commit(sbPlayer, Math.min(t.sb, sbPlayer.chips));
    this.commit(bbPlayer, Math.min(t.bb, bbPlayer.chips));
    t.currentBet = t.bb;
    t.minRaise = t.bb;
    t.lastAggressorId = bbPlayer.id;

    log(t, `${sbPlayer.name} posts ${t.sb.toLocaleString()}, ${bbPlayer.name} posts ${t.bb.toLocaleString()}.`, 'bet');
    this.fx.push({ t: 'chips', playerId: sbPlayer.id, amount: t.sb });
    this.fx.push({ t: 'chips', playerId: bbPlayer.id, amount: t.bb });

    const first = nextSeat(t, bbPlayer.seat, (p) => !p.folded && !p.allIn && !p.eliminated);
    t.actingId = first?.id ?? null;
  }

  private commit(p: Player, amount: number): number {
    const paid = Math.min(amount, p.chips);
    p.chips -= paid;
    p.bet += paid;
    p.committed += paid;
    if (p.chips === 0) p.allIn = true;
    return paid;
  }

  // ------------------------------------------------------------------ streets

  private beginStreet(first = false): void {
    const t = this.table;
    if (!first) {
      t.currentBet = 0;
      t.minRaise = t.bb;
      t.lastAggressorId = null;
      for (const p of t.players) { t.pot += p.bet; p.bet = 0; }
      const firstToAct = nextSeat(t, t.dealerSeat, (p) => !p.folded && !p.allIn && !p.eliminated);
      t.actingId = firstToAct?.id ?? null;
    }
    t.actedThisStreet = new Set();

    for (const p of alive(t)) {
      if (p.severed) continue;
      const regen = Math.max(0,
        1 + relicNumber(p.relics, (r) => r.mana?.regen)
          + omenNumber(t.omens, (o) => o.mana?.regen));
      p.mana = Math.min(p.maxMana, p.mana + (first ? 0 : regen));
    }

    if (actable(t).length <= 1 && live(t).length > 1) {
      // Everyone is all-in; run the rest of the board out with no more betting.
      this.runOut();
      return;
    }
    this.startActionClock();
  }

  private startActionClock(): void {
    const t = this.table;
    const p = byId(t, t.actingId);
    if (!p) { this.advanceStreet(); return; }

    this.castsThisTurn.delete(p.id);
    t.actingUntil = Date.now() + t.config.actionSeconds * 1000;
    this.wait(t.config.actionSeconds * 1000, () => {
      // Time is a fold, unless checking is free.
      const toCall = t.currentBet - p.bet;
      this.applyAction(p, toCall > 0 ? { kind: 'fold' } : { kind: 'check' }, true);
    });

    if (p.isBot) this.botClock.set(p.id, Date.now() + thinkTime(this.rng));
    else this.fx.push({ t: 'sfx', name: 'your_turn' });

    this.flush();
  }

  private streetAfter(phase: Phase): Phase {
    switch (phase) {
      case 'preflop': return 'flop';
      case 'flop': return 'turn';
      case 'turn': return 'river';
      default: return 'showdown';
    }
  }

  private dealStreet(phase: Phase): void {
    const t = this.table;
    const ctx = this.ctx();
    const extraBoard = phase === 'river' ? omenNumber(t.omens, (o) => o.deal?.extraBoard) : 0;
    const count = (phase === 'flop' ? 3 : 1) + extraBoard;
    const dealt: string[] = [];

    for (let i = 0; i < count; i++) {
      const id = drawId(ctx);
      if (!id) break;
      t.board.push(id);
      dealt.push(id);
      if (phase === 'flop' && t.quantumFlop) {
        const c = card(t, id);
        if (c) superposeCard(ctx, c);
      }
    }
    if (phase === 'flop') {
      t.quantumFlop = false;
      // Entropy Rising: one board card arrives undecided, every hand.
      const undecided = omenNumber(t.omens, (o) => o.deal?.quantumBoard);
      for (let i = 0; i < undecided && i < dealt.length; i++) {
        const c = card(t, dealt[i]);
        if (c) superposeCard(ctx, c);
      }
    }

    // The Amber Age puts one card beyond the reach of every sigil.
    const amber = omenNumber(t.omens, (o) => o.deal?.amberBoard);
    for (let i = 0; i < amber && i < dealt.length; i++) {
      const c = card(t, dealt[i]);
      if (c) c.amber = true;
    }

    this.fx.push({ t: 'deal', cardIds: dealt, to: 'board', stagger: 140 });
    this.fx.push({ t: 'sfx', name: `street_${phase}` });
    log(t, `${phase[0].toUpperCase()}${phase.slice(1)}: ${dealt.map((id) => describeCard(t, id)).join(' ')}`, 'plain');

    if (phase === 'river') grantInformantVision(t, this.rng);
  }

  private advanceStreet(): void {
    const t = this.table;
    t.actingId = null;
    t.actingUntil = null;
    this.clearWait();

    if (live(t).length <= 1) { this.toShowdown(); return; }

    const next = this.streetAfter(t.phase);
    if (next === 'showdown') { this.toShowdown(); return; }

    t.phase = next;
    this.dealStreet(next);
    this.flush();
    this.wait(320, () => this.beginStreet());
  }

  /** Everyone is committed; deal the remaining board with a beat between cards. */
  private runOut(): void {
    const t = this.table;
    t.actingId = null;
    t.actingUntil = null;
    for (const p of t.players) { t.pot += p.bet; p.bet = 0; }
    this.fx.push({ t: 'music', mood: 'tension' });
    this.flush();

    const step = () => {
      if (t.phase === 'river' || t.board.length >= 5) { this.toShowdown(); return; }
      const next = this.streetAfter(t.phase);
      if (next === 'showdown') { this.toShowdown(); return; }
      t.phase = next;
      this.dealStreet(next);
      this.flush();
      this.wait(750, step);
    };
    this.wait(600, step);
  }

  private toShowdown(): void {
    const t = this.table;
    t.phase = 'showdown';
    t.actingId = null;
    t.actingUntil = null;
    this.clearWait();

    // Anything still undecided has to decide now. That is what a showdown is.
    const ctx = this.ctx();
    for (const p of live(t)) {
      for (const id of p.hole) {
        const c = card(t, id);
        if (c && isQuantum(c)) {
          const best = this.bestFaceFor(c.faces);
          const f = c.faces[best];
          c.collapsed = best;
          this.fx.push({ t: 'collapse', cardId: id, face: f });
        }
      }
    }
    for (const id of t.board) {
      const c = card(t, id);
      if (c && isQuantum(c)) {
        const idx = this.rng.int(c.faces.length);
        c.collapsed = idx;
        this.fx.push({ t: 'collapse', cardId: id, face: c.faces[idx] });
      }
    }
    void ctx;

    this.fx.push({ t: 'music', mood: 'showdown' });
    for (const p of live(t)) this.fx.push({ t: 'reveal', playerId: p.id });

    const { payout, fx } = runShowdown(t, this.rng);
    t.payout = payout;
    this.fx.push(...fx);

    t.phase = 'payout';
    this.flush();
    this.wait(live(t).length > 1 ? 3200 : 1400, () => this.endHand());
  }

  private bestFaceFor(faces: Face[]): number {
    let best = 0;
    for (let i = 1; i < faces.length; i++) if (faces[i].rank > faces[best].rank) best = i;
    return best;
  }

  private endHand(): void {
    const t = this.table;

    for (const p of t.players) {
      if (!p.eliminated && p.chips <= 0) {
        p.eliminated = true;
        p.folded = true;
        log(t, `${p.name} is out.`, 'warn', { playerId: p.id });
        this.fx.push({ t: 'eliminate', playerId: p.id });
        this.fx.push({ t: 'sfx', name: 'eliminate' });
        for (const q of t.players) {
          const bonus = relicNumber(q.relics, (r) => r.economy?.onEliminate);
          if (bonus > 0 && q.id !== p.id && !q.eliminated) {
            q.shards += bonus + Math.floor(p.shards / 2);
            log(t, `${q.name} inherits from ${p.name}.`, 'magic', { playerId: q.id });
          }
        }
      }
    }

    if (alive(t).length <= 1) { this.endGame(); return; }

    const antePassed = t.handNumber % t.config.handsPerAnte === 0;
    if (antePassed) { this.openShop(); return; }

    this.fx.push({ t: 'music', mood: 'table' });
    this.flush();
    this.wait(520, () => this.beginHand());
  }

  private endGame(): void {
    const t = this.table;
    const last = alive(t)[0];
    t.phase = 'gameover';
    t.winnerId = last?.id ?? null;
    t.actingId = null;
    this.clearWait();
    if (last) {
      log(t, `${last.name} takes the table.`, 'win', { playerId: last.id });
      this.fx.push({ t: 'banner', text: `${last.name} WINS`, sub: 'The table is closed', tone: 'win' });
      this.fx.push({ t: 'sfx', name: 'victory' });
    }
    this.fx.push({ t: 'music', mood: 'menu' });
    this.flush();
  }

  // --------------------------------------------------------------------- shop

  /**
   * The ante break, staged rather than dumped all at once.
   *
   * Announcing the ante, revealing the new omen and opening the market in the
   * same frame put two full-screen banners on top of the shop, hiding the
   * prices behind them. Each beat now gets its own moment, and the market only
   * opens once the screen is clear.
   */
  private openShop(): void {
    const t = this.table;
    t.ante += 1;
    // Doubling Down adds steps to the climb, permanently.
    const steps = (t.ante - 1) + omenNumber(t.omens, (o) => o.blindSteps) * Math.max(0, t.ante - 1);
    t.bb = Math.round((t.config.baseBlind * Math.pow(1.6, steps)) / 50) * 50;
    t.sb = Math.floor(t.bb / 2);

    log(t, `Ante ${t.ante}. Blinds are now ${t.sb.toLocaleString()} / ${t.bb.toLocaleString()}.`, 'magic');
    this.fx.push({
      t: 'banner', text: `ANTE ${t.ante}`,
      sub: `Blinds ${t.sb.toLocaleString()} / ${t.bb.toLocaleString()}`, tone: 'magic',
    });
    this.fx.push({ t: 'sfx', name: 'level_up' });
    this.fx.push({ t: 'music', mood: 'shop' });
    this.flush();

    this.wait(2000, () => {
      this.rollOmen();
      this.flush();
      // Give the omen its own beat before the market covers the screen.
      this.wait(t.omens.length ? 2400 : 200, () => this.openMarket());
    });
  }

  private openMarket(): void {
    const t = this.table;
    t.phase = 'shop';

    payInterest(t);
    for (const p of alive(t)) {
      p.shopDone = false;
      t.shop.set(p.id, rollShop(t, p, this.rng));
      if (p.isBot) this.botClock.set(p.id, Date.now() + 800 + this.rng.int(1500));
    }

    this.fx.push({ t: 'sfx', name: 'shop_open' });
    this.flush();
    this.wait(t.config.shopSeconds * 1000, () => this.closeShop());
  }

  /**
   * One new permanent rule per ante. They stack and never come off, so the
   * last hands of a run are played under a rulebook nobody sat down to.
   */
  private rollOmen(): void {
    const t = this.table;
    const taken = new Set(t.omens.map((o) => o.id));
    const pool = OMENS.filter((o) => !taken.has(o.id) && o.minAnte <= t.ante);
    if (pool.length === 0) return;

    const bag: typeof pool = [];
    for (const o of pool) for (let i = 0; i < o.weight; i++) bag.push(o);
    const def = this.rng.pick(bag);

    const omen: ActiveOmen = { id: def.id, ante: t.ante };
    if (def.killsRank) {
      // Strike a rank nobody is currently holding a pair of, for fairness.
      const all: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
      omen.rank = this.rng.pick(all);
    }
    t.omens.push(omen);

    // Omens that permanently edit the shared deck do it once, on arrival.
    const ins = def.deal?.inscribe;
    if (ins) {
      const plain = [...t.cards.values()].filter(
        (c) => c.marks.length === 0 && c.origin !== 'conjured',
      );
      for (const c of this.rng.sample(plain, ins.count)) {
        if (!c.marks.includes(ins.markId)) c.marks.push(ins.markId);
      }
    }

    for (const p of t.players) p.maxMana = maxManaFor(p, t);

    const detail = omen.rank ? `${RANK_NAME[omen.rank]}s` : '';
    log(t, `OMEN — ${def.name}: ${def.text}${detail ? ` (${detail})` : ''}`, 'impossible');
    this.fx.push({ t: 'banner', text: def.name.toUpperCase(), sub: 'A new rule, permanently', tone: 'impossible' });
    this.fx.push({ t: 'sfx', name: 'seal' });
    this.fx.push({ t: 'shake', power: 0.6 });
    this.fx.push({ t: 'flash', color: '#b98cff', power: 0.45 });
  }

  /**
   * Leave the market.
   *
   * The phase has to change *here*, not later in `beginHand`. While it stayed
   * 'shop' the bot loop matched the market branch on every tick, called this
   * again, and reset its own 320ms timer — so the timer could never elapse and
   * the table span forever between two lines of code.
   */
  private closeShop(): void {
    const t = this.table;
    if (t.phase !== 'shop') return;
    t.phase = 'deal';
    t.shop.clear();
    this.clearWait();
    this.fx.push({ t: 'music', mood: 'table' });
    this.flush();
    this.wait(320, () => this.beginHand());
  }

  shopBuy(id: string, uid: string): { ok: boolean; error?: string } {
    const p = byId(this.table, id);
    if (!p || this.table.phase !== 'shop') return { ok: false, error: 'The market is closed' };
    const r = buy(this.table, p, uid, this.rng);
    if (r.ok) this.fx.push({ t: 'sfx', name: 'shop_buy' });
    this.flush();
    return r;
  }

  shopReroll(id: string): { ok: boolean; error?: string } {
    const p = byId(this.table, id);
    if (!p || this.table.phase !== 'shop') return { ok: false, error: 'The market is closed' };
    const r = reroll(this.table, p, this.rng);
    if (r.ok) this.fx.push({ t: 'sfx', name: 'shop_reroll' });
    this.flush();
    return r;
  }

  shopDone(id: string): void {
    const t = this.table;
    const p = byId(t, id);
    if (!p || t.phase !== 'shop') return;
    p.shopDone = true;
    this.flush();
    if (alive(t).every((q) => q.shopDone)) this.closeShop();
  }

  // ------------------------------------------------------------------ betting

  act(id: string, action: BetAction): { ok: boolean; error?: string } {
    const t = this.table;
    if (t.stack) return { ok: false, error: 'A sigil is resolving' };
    const p = byId(t, id);
    if (!p) return { ok: false, error: 'Not seated' };
    if (t.actingId !== id) return { ok: false, error: 'Not your turn' };
    return this.applyAction(p, action, false);
  }

  private applyAction(p: Player, action: BetAction, auto: boolean): { ok: boolean; error?: string } {
    const t = this.table;
    const toCall = Math.max(0, t.currentBet - p.bet);
    let kind = action.kind;
    let amount = action.amount ?? 0;

    if (kind === 'check' && toCall > 0) return { ok: false, error: 'You cannot check' };
    if (kind === 'call' && toCall === 0) kind = 'check';
    if (kind === 'allin') { amount = p.chips + p.bet; kind = toCall > 0 ? 'raise' : 'bet'; }

    if (kind === 'bet' || kind === 'raise') {
      const minTotal = kind === 'bet' ? Math.max(t.bb, t.minRaise) : t.currentBet + t.minRaise;
      const maxTotal = p.bet + p.chips;
      if (amount >= maxTotal) amount = maxTotal;
      else if (amount < minTotal) {
        if (!auto) return { ok: false, error: `Minimum is ${minTotal.toLocaleString()}` };
        amount = Math.min(minTotal, maxTotal);
      }
    }

    this.clearWait();
    t.actedThisStreet.add(p.id);

    switch (kind) {
      case 'fold': {
        p.folded = true;
        p.lastAction = { kind: 'fold', amount: 0, at: Date.now() };
        log(t, `${p.name} folds.`, 'bet', { playerId: p.id });
        this.fx.push({ t: 'sfx', name: 'card_slide' });
        if (t.phase === 'preflop') {
          const bonus = relicNumber(p.relics, (r) => r.economy?.perFold);
          if (bonus > 0) p.shards += bonus;
        }
        break;
      }
      case 'check': {
        p.lastAction = { kind: 'check', amount: 0, at: Date.now() };
        log(t, `${p.name} checks.`, 'bet', { playerId: p.id });
        this.fx.push({ t: 'sfx', name: 'ui_tick' });
        break;
      }
      case 'call': {
        const paid = this.commit(p, toCall);
        p.lastAction = { kind: p.allIn ? 'allin' : 'call', amount: paid, at: Date.now() };
        log(t, `${p.name} calls ${paid.toLocaleString()}${p.allIn ? ' and is all in' : ''}.`, 'bet', { playerId: p.id });
        this.fx.push({ t: 'chips', playerId: p.id, amount: paid, allIn: p.allIn });
        this.fx.push({ t: 'sfx', name: p.allIn ? 'chip_allin' : 'chip_stack' });
        break;
      }
      case 'bet':
      case 'raise': {
        const delta = amount - p.bet;
        const paid = this.commit(p, delta);
        const raiseBy = p.bet - t.currentBet;
        const full = raiseBy >= t.minRaise;
        if (full) t.minRaise = raiseBy;
        t.currentBet = Math.max(t.currentBet, p.bet);
        t.lastAggressorId = p.id;
        // A full raise reopens the action for everyone behind. An all-in that
        // falls short of a full raise does not — players who already acted owe
        // only the difference, and do not get a fresh betting round for it.
        if (full) t.actedThisStreet = new Set([p.id]);
        else t.actedThisStreet.add(p.id);
        p.lastAction = { kind: p.allIn ? 'allin' : kind, amount: p.bet, at: Date.now() };
        const verb = p.allIn ? 'is all in for' : kind === 'bet' ? 'bets' : 'raises to';
        const hidden = p.betVeiled;
        log(t, `${p.name} ${verb} ${hidden ? '???' : p.bet.toLocaleString()}.`, hidden ? 'magic' : 'bet', { playerId: p.id });
        this.fx.push({ t: 'chips', playerId: p.id, amount: paid, allIn: p.allIn });
        this.fx.push({ t: 'sfx', name: p.allIn ? 'chip_allin' : 'chip_stack' });
        if (p.allIn) this.fx.push({ t: 'music', mood: 'tension' });
        break;
      }
      default:
        return { ok: false, error: 'Unknown action' };
    }

    this.afterAction();
    return { ok: true };
  }

  private roundComplete(): boolean {
    const t = this.table;
    if (live(t).length <= 1) return true;
    const canAct = actable(t);
    if (canAct.length === 0) return true;
    return canAct.every((p) => t.actedThisStreet.has(p.id) && p.bet === t.currentBet);
  }

  /** Take everyone off the clock. Nothing may act until a phase re-arms it. */
  private standDown(): void {
    this.table.actingId = null;
    this.table.actingUntil = null;
    this.botClock.clear();
    this.castsThisTurn.clear();
  }

  private afterAction(): void {
    const t = this.table;

    // The moment a transition is queued the clock has to be surrendered.
    // Leaving `actingId` set lets the bot loop act again in the gap before the
    // transition fires, which is an infinite loop of free checks.
    if (live(t).length <= 1) {
      this.standDown();
      this.flush();
      this.wait(320, () => this.toShowdown());
      return;
    }
    if (this.roundComplete()) {
      this.standDown();
      this.flush();
      this.wait(260, () => this.advanceStreet());
      return;
    }

    const current = byId(t, t.actingId);
    const next = nextSeat(t, current?.seat ?? t.dealerSeat, (p) => !p.folded && !p.allIn && !p.eliminated);
    if (!next) {
      this.standDown();
      this.flush();
      this.wait(260, () => this.advanceStreet());
      return;
    }
    t.actingId = next.id;
    this.startActionClock();
  }

  // -------------------------------------------------------------------- magic

  cast(id: string, uid: string, targets: SigilTargets): { ok: boolean; error?: string } {
    const t = this.table;
    const p = byId(t, id);
    if (!p) return { ok: false, error: 'Not seated' };

    const wasIdle = !t.stack;
    const r = castSigil(this.ctx(), p, uid, targets);
    if (!r.ok) { this.flush(); return r; }

    // Casting freezes the betting clock until the stack settles.
    if (wasIdle) t.actingUntil = null;
    this.clearWait();

    if (t.stack && t.stack.pending.length > 0) {
      this.wait(t.config.responseSeconds * 1000, () => this.settleStack());
      for (const rid of t.stack.pending) {
        const bot = byId(t, rid);
        if (bot?.isBot) this.botClock.set(rid, Date.now() + thinkTime(this.rng, true));
      }
      this.flush();
    } else {
      // Nobody can answer this, so there is nothing to wait for. Magic is
      // frequent; a fixed beat per cast is most of a hand's running time.
      this.flush();
      this.wait(140, () => this.settleStack());
    }
    return { ok: true };
  }

  pass(id: string): void {
    const t = this.table;
    if (!t.stack) return;
    passResponse(t, id);
    if (t.stack.pending.length === 0) {
      this.clearWait();
      this.flush();
      this.wait(300, () => this.settleStack());
    } else {
      this.flush();
    }
  }

  private settleStack(): void {
    const t = this.table;
    if (!t.stack) return;
    this.clearWait();
    resolveStack(this.ctx());
    this.flush();

    // Hand back to whoever was on the clock. Every branch here must either
    // schedule something or hand the clock to a player — an exit that does
    // neither wedges the table permanently.
    this.wait(180, () => {
      if (t.phase === 'showdown' || t.phase === 'payout' || t.phase === 'gameover'
        || t.phase === 'shop' || t.phase === 'lobby') {
        this.flush();
        return;
      }
      if (live(t).length <= 1) { this.toShowdown(); return; }
      if (this.roundComplete()) { this.standDown(); this.advanceStreet(); return; }
      if (t.actingId) { this.startActionClock(); return; }
      this.advanceStreet();
    });
  }

  discardSigil(id: string, uid: string): void {
    const p = byId(this.table, id);
    if (!p) return;
    const before = p.sigils.length;
    p.sigils = p.sigils.filter((s) => s.uid !== uid);
    if (p.sigils.length < before) {
      p.mana = Math.min(p.maxMana, p.mana + 1);
      log(this.table, `${p.name} unmakes a sigil for mana.`, 'magic', { playerId: p.id });
    }
    this.flush();
  }

  // --------------------------------------------------------------------- tick

  private tick(): void {
    const t = this.table;
    t.lastActivity = Math.max(t.lastActivity, Date.now() - 60_000);

    // Stack windows close on their own.
    if (t.stack && stackReady(t) && this.onDeadline) {
      this.fire();
      return;
    }

    if (this.onDeadline && Date.now() >= this.deadline) {
      this.fire();
      return;
    }

    if (this.onDeadline) {
      this.idleSince = 0;
      this.safely(() => this.runBots());
      return;
    }

    this.guardStall();
    this.safely(() => this.runBots());
  }

  /** Run a scheduled callback, surviving anything it throws. */
  private fire(): void {
    const due = this.onDeadline;
    this.clearWait();
    this.idleSince = 0;
    if (due) this.safely(due);
  }

  /**
   * A throw inside a scheduled callback escapes setInterval and kills the
   * process, taking every other table on the server with it. Contain it, log
   * it, and let the stall guard push the hand forward.
   */
  private safely(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error(`[hexhold] table ${this.table.code} threw in phase ${this.table.phase}:`, err);
      log(this.table, 'Something went wrong resolving that. The hand continues.', 'warn');
      this.clearWait();
      try { this.flush(); } catch { /* the emit path is already broken */ }
    }
  }

  /**
   * Nothing scheduled, mid-hand, nobody on the clock: that is a bug, not a
   * state. Rather than leave a table dead until everyone quits, notice it and
   * push the hand forward.
   */
  private guardStall(): void {
    const t = this.table;
    const idle = t.phase !== 'lobby' && t.phase !== 'gameover' && !t.stack;
    if (!idle) { this.idleSince = 0; return; }

    const now = Date.now();
    if (this.idleSince === 0) { this.idleSince = now; return; }
    // The market legitimately sits still while people shop, so give it longer
    // than a betting round before deciding it is wedged.
    const grace = t.phase === 'shop' ? t.config.shopSeconds * 1000 + 4000 : 4000;
    if (now - this.idleSince < grace) return;

    this.idleSince = 0;
    log(t, 'The table stalled and was nudged forward.', 'warn');
    console.warn(`[hexhold] stall recovered in phase=${t.phase} acting=${t.actingId ?? 'none'}`);

    if (t.phase === 'shop') { this.closeShop(); return; }
    if (live(t).length <= 1) { this.toShowdown(); return; }
    if (t.actingId) { this.startActionClock(); return; }
    if (isStreet(t.phase)) { this.advanceStreet(); return; }
    if (t.phase === 'payout') { this.endHand(); return; }
    this.beginHand();
  }

  private runBots(): void {
    const t = this.table;
    const now = Date.now();

    // Responding to a sigil takes priority over everything else.
    if (t.stack) {
      for (const id of [...t.stack.pending]) {
        const p = byId(t, id);
        if (!p?.isBot) continue;
        const at = this.botClock.get(id) ?? 0;
        if (now < at) continue;
        this.botClock.delete(id);
        const choice = decideResponse(t, p, this.rng);
        if (choice) this.cast(id, choice.uid, choice.targets);
        else this.pass(id);
        return;
      }
      return;
    }

    if (t.phase === 'shop') {
      for (const p of alive(t)) {
        if (!p.isBot || p.shopDone) continue;
        const at = this.botClock.get(p.id) ?? 0;
        if (now < at) continue;
        const uid = decideShop(t, p, this.rng);
        if (uid) {
          buy(t, p, uid, this.rng);
          this.botClock.set(p.id, now + 500 + this.rng.int(900));
        } else {
          p.shopDone = true;
        }
        this.flush();
        return;
      }
      if (alive(t).every((q) => q.shopDone)) this.closeShop();
      return;
    }

    const acting = byId(t, t.actingId);
    if (!acting?.isBot) return;
    const at = this.botClock.get(acting.id) ?? 0;
    if (now < at) return;
    this.botClock.delete(acting.id);

    // Two sigils in one window is a flourish; five is a cutscene.
    const spell = (this.castsThisTurn.get(acting.id) ?? 0) < 2
      ? decideCast(t, acting, this.rng)
      : null;
    if (spell) {
      this.cast(acting.id, spell.uid, spell.targets);
      this.castsThisTurn.set(acting.id, (this.castsThisTurn.get(acting.id) ?? 0) + 1);
      // They still owe the table a betting decision afterwards.
      this.botClock.set(acting.id, Date.now() + 600);
      return;
    }

    this.applyAction(acting, decideAction(t, acting, this.rng), true);
  }

  addBot(): Player | null {
    const t = this.table;
    if (t.phase !== 'lobby') return null;
    const r = new Rng(`${t.seed}:${t.players.length}`);
    const names = ['Mordent', 'Vesper', 'Kestrel', 'Nyx', 'Sable', 'Corvid', 'Ashgrave', 'Wren', 'Thorn', 'Quill'];
    const taken = new Set(t.players.map((p) => p.name));
    const free = names.filter((n) => !taken.has(n));
    const name = free.length ? r.pick(free) : `Bot ${t.players.length}`;
    return this.addPlayer(`bot_${nanoid(6)}`, name, true);
  }

  removeBot(): void {
    const t = this.table;
    if (t.phase !== 'lobby') return;
    const last = [...t.players].reverse().find((p) => p.isBot);
    if (last) this.removePlayer(last.id);
  }
}
