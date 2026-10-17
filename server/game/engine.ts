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
import { type CardEntity, type Face, type Rank, RANKS, RANK_NAME, isQuantum, rankPlural, standardDeck } from '../../shared/cards';
import { Cat, evaluate } from '../../shared/hand';
import type { FxEvent } from '../../shared/protocol';
import { Rng } from '../../shared/rng';
import { RELICS, RELIC_BY_ID, hasRule, hasVision, isCreed, relicNumber } from '../../shared/relics';
import {
  HEXES, PHYLACTERY_BEFORE_ANTE, PHYLACTERY_STACK, dailyCoven, hasPhylactery, isDailySeed,
} from '../../shared/hexes';
import {
  IMPOSSIBLE_BY_ANTE, OMEN_BY_ID, OMEN_POOL, keepsPromise, omenNumber, type ActiveOmen,
} from '../../shared/omens';
import {
  isStreet,
  type BetAction, type BustedBy, type PayoutInfo, type Phase, type Player, type RoomConfig, type SigilTargets, type Table,
} from '../../shared/types';
import {
  actable, alive, anteLength, byId, card, createPlayer, createTable, describeCard,
  contenders, freeSeat, handCards, live, log, maxManaFor, modsFor, nextSeat, refreshMaxMana, ruleRelic, seated, sigilHandSize,
} from './table';
import {
  applySeal, bindInscribedPairs, castSigil, clearHandMagic, drawId, giveSigil, passResponse,
  randomSigil, reapConjured, resolveStack, stackReady, superposeCard,
  type MagicCtx,
} from './magic';
import { grantInformantVision, runShowdown } from './showdown';
import { buy, payInterest, reroll, rollShop, scribe } from './shop';
import {
  decideAction, decideCast, decideResponse, decideScribe, decideShop, thinkTime, TEMPO,
} from './bots';
import { COVENS, COVEN_CHOICE, COVEN_LEAN, COVEN_LEAN_FROM_ANTE, DEFAULT_COVEN, covenOf, creedAwake, creedOf, leanOf } from '../../shared/covens';
import { SIGIL_BY_ID, defOf } from '../../shared/sigils';

export type Emit = (fx: FxEvent[]) => void;
export type Push = () => void;

const TICK_MS = 120;

/** A solo pause lets go on its own after this long. */
const PAUSE_MAX_MS = 30 * 60_000;

/**
 * A solo table's Market has no clock: it closes when the player presses Done.
 * This cap only exists so a Market left open in an abandoned window still
 * lets the table be reaped, the same as a pause.
 */
const SOLO_MARKET_MAX_MS = PAUSE_MAX_MS;

/**
 * Once every human has pressed Done, nobody is browsing: the bots stop pausing
 * between purchases and the Market closes within this long. Without it a solo
 * player who pressed Done waited on the bots, and the only clock left was the
 * thirty-minute cap.
 */
const BOTS_AFTER_DONE_MS = 4000;

/**
 * How much the blinds climb per ante step.
 *
 * At 1.6 the big blind went 200, 300, 500, 800, 1300, 2100, 3350, 5350, and
 * the run arc was upside down: measured from the player's chair (`npm run
 * fun`, 140 runs, 2026-10-10) your stack was 100 big blinds at ante 1 and 9
 * at ante 7, so the antes where the omens have stacked up and the build is
 * finished were push-or-fold, with 1.8 casts a hand against 6.8 at the start.
 * At 1.4 (200, 300, 400, 550, 750, 1100, 1500, 2100) the late antes keep
 * enough depth to play the spells, and runs still end: Doubling Down and the
 * Quickening add steps on top, and Hex V makes every ante two hands long.
 */
export const BLIND_GROWTH = 1.4;

/** The big blind after `steps` climbs from `base`, in whole 50s. */
export const bigBlindAt = (base: number, steps: number): number =>
  Math.round((base * Math.pow(BLIND_GROWTH, steps)) / 50) * 50;

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
  /** When the only human at the table paused it from the menu. 0 = running. */
  private pausedAt = 0;

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

  /**
   * A random stream for one decision, derived from the table seed.
   *
   * The shared engine stream is consumed by everything, including bot
   * deliberation, so on a seeded table the third hand's deck would depend on
   * how long the first two took to play. Deals, omens, openings and Market
   * offers each draw from their own named stream instead, which is what lets
   * a Daily Rite be the same table for everyone.
   */
  private stream(name: string): Rng {
    return new Rng(`${this.table.seed}:${name}`);
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

  /**
   * A bot's own pause, scaled by the same pacing dial as every table clock.
   * The Market's browsing pauses used to be fixed milliseconds while the
   * Market's own clock scaled, so at HEXHOLD_PACE=10 the Market shut in 0.3s
   * before any bot had looked at it, and every fast harness run measured a
   * game in which bots never bought anything.
   */
  private paced(ms: number): number {
    return Math.round(ms * (config.pacePercent / 100));
  }

  private wait(ms: number, then: () => void): void {
    this.deadline = Date.now() + Math.round(ms * (config.pacePercent / 100));
    this.onDeadline = then;
  }

  private clearWait(): void {
    this.deadline = 0;
    this.onDeadline = null;
  }

  /**
   * The street transition a cast interrupted, if one did.
   *
   * A street is dealt and then waits a beat before its betting round opens.
   * In that beat the street exists but its round does not: `actedThisStreet`
   * still holds the PREVIOUS street's actors, and nobody's bet has been swept
   * into the pot, so `roundComplete()` reads true for a round that never
   * started. Anyone may cast into that beat — a response does not wait its
   * turn — and `cast()` kills the pending timer, because a sigil cast on
   * someone's turn has to stop that turn's clock.
   *
   * The result was two streets for one cast: the turn was bet, the river
   * arrived with no betting round at all, and a Burning turn card made the
   * river look like a second turn. So the beat is remembered rather than
   * guessed at — whatever was scheduled runs when the stack settles, and
   * nothing else does.
   *
   * It is stamped with the hand and street it was armed in, which is what
   * makes it safe to leave lying around: an owed beat can only be claimed at
   * the exact point it was armed for. A timer cancelled by anything else —
   * a showdown, a new hand, the Market — can never resurrect it.
   */
  private interrupted: { go: () => void; hand: number; phase: Phase } | null = null;

  /** Schedule a transition that survives a cast landing inside its beat. */
  private beat(ms: number, go: () => void): void {
    const owed = { go, hand: this.table.handNumber, phase: this.table.phase };
    this.interrupted = owed;
    this.wait(ms, () => {
      if (this.interrupted === owed) this.interrupted = null;
      go();
    });
  }

  /** The transition still owed at this exact point of this exact hand. */
  private owedBeat(): (() => void) | null {
    const owed = this.interrupted;
    if (!owed) return null;
    const t = this.table;
    if (owed.hand !== t.handNumber || owed.phase !== t.phase) {
      this.interrupted = null;
      return null;
    }
    return owed.go;
  }

  // -------------------------------------------------------------------- seats

  addPlayer(id: string, name: string, isBot = false): Player | null {
    const t = this.table;
    const seat = freeSeat(t);
    if (seat < 0) return null;
    // A daily table's deck order follows from a public seed, so it seats one
    // human. Two people sharing it would be playing against someone who can
    // know the deck.
    if (!isBot && isDailySeed(t.config.seed) && t.players.some((q) => !q.isBot)) return null;
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

  /**
   * Pause, for a table with exactly one human: practice against bots, which is
   * how the desktop game is played offline. Opening the menu there stops the
   * hand, the way any single-player game's pause does. A table with two humans
   * never pauses: one player cannot stop another's game. Every clock that was
   * running is pushed back by however long the pause lasted, and a pause left
   * alone past PAUSE_MAX_MS lets go so an abandoned table is still reaped.
   */
  setPaused(id: string, on: boolean): boolean {
    const humans = this.table.players.filter((p) => !p.isBot);
    if (!this.solo || humans[0].id !== id) return false;
    if (on) {
      if (!this.pausedAt) this.pausedAt = Date.now();
      return true;
    }
    this.resume();
    return true;
  }

  get paused(): boolean { return this.pausedAt > 0; }

  /**
   * Exactly one human at the table: practice against bots or the Daily Rite.
   * Such a table can pause, its Market waits for the player, and it ends the
   * moment that player is out. Two humans never get any of this.
   */
  get solo(): boolean {
    return this.table.players.filter((p) => !p.isBot).length === 1;
  }

  /** At least one human sat down, and every one of them is out. */
  private everyHumanOut(): boolean {
    const humans = this.table.players.filter((p) => !p.isBot);
    return humans.length > 0 && humans.every((p) => p.eliminated);
  }

  /** How long the Market stays open: the configured clock, or none when solo. */
  private marketMs(): number {
    return this.solo ? SOLO_MARKET_MAX_MS : this.table.config.shopSeconds * 1000;
  }

  private resume(): void {
    if (!this.pausedAt) return;
    const held = Date.now() - this.pausedAt;
    this.pausedAt = 0;
    const t = this.table;
    if (this.deadline) this.deadline += held;
    for (const [k, v] of this.botClock) this.botClock.set(k, v + held);
    if (t.actingUntil) t.actingUntil += held;
    if (t.stack?.closesAt) t.stack.closesAt += held;
    for (const sh of t.shop.values()) if (sh.closesAt) sh.closesAt += held;
    this.idleSince = 0;
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
    t.demoComplete = false;
    t.omens = [];
    t.dealerSeat = seated(t)[0]?.seat ?? 0;
    // A new run gets a clean deck. Stripping marks was not enough: Graft,
    // Mirror and Tessellate rewrite a card's face for the rest of the run, and
    // Unprint takes a card out for good, so "Deal again" used to start the
    // next run on the last one's duplicates and missing cards. Same order as
    // a fresh table's deck, so a seeded run deals the same faces.
    t.cards = new Map(standardDeck().map((c) => [c.id, c]));
    t.tempMarks = [];

    for (const p of t.players) {
      p.chips = t.config.startingChips;
      p.shards = t.config.startingShards;
      p.sigils = [];
      p.relics = [];
      p.eliminated = false;
      p.bustedBy = undefined;
      // Hex I gives a solo player one buy-back before ante 3 (shared/hexes.ts).
      // A table with two humans does not end on one bust, so it has none.
      p.phylactery = !p.isBot && this.solo && hasPhylactery(t.config.hex);
      p.revived = undefined;
      p.handsWon = 0;
      p.attuned = 0;
      p.maxMana = maxManaFor(p, t);

      // The coven is the run's opening decision, and it is expressed entirely
      // in things the engine already knows how to hold: a list of sigil ids
      // and one relic id. A coven cannot introduce behaviour — if one needs to
      // do something new, the relic has to learn it first.
      // The Daily Rite is played as the day's coven, whatever the client sent,
      // or it is not the same run as everyone else's.
      if (!p.isBot && isDailySeed(t.config.seed)) p.coven = dailyCoven(t.config.seed.slice('daily:'.length));
      const coven = covenOf(p.coven);
      // The creed first: it is the coven's rule, and the relic is its kit.
      const creed = creedOf(coven);
      if (creed && creedAwake(p.isBot, t.config.hex, t.ante)) p.relics.push(creed);
      if (coven.relic) p.relics.push(coven.relic);
      for (const defId of coven.sigils) {
        if (SIGIL_BY_ID[defId]) giveSigil(t, p, { uid: nanoid(8), defId });
      }
      // Top up to a full opening hand with the draft pool, so every coven
      // still meets cards it did not choose.
      const opening = this.stream(`open:${p.seat}`);
      // Bounded, not `while`: giveSigil refuses once the hand is full, so a
      // hand size below two would spin this on the server's only thread. Every
      // relic that touches hand size currently adds to it, which is the only
      // reason that is not already a hang.
      for (let i = 0; i < 2 && p.sigils.length < 2; i++) {
        if (!giveSigil(t, p, randomSigil(opening))) break;
      }
      // Hex II: the opponents arrive already equipped.
      if (p.isBot && t.config.hex >= 2) {
        const pool = RELICS.filter((r) => !p.relics.includes(r.id) && r.rarity !== 'mythic');
        if (pool.length) p.relics.push(opening.pick(pool).id);
      }
      // The relic may raise the ceiling or the hand size.
      p.maxMana = maxManaFor(p, t);
    }

    log(t, 'The table is set. Ante 1.', 'magic');
    if (t.config.hex > 1) log(t, `${HEXES[t.config.hex - 1].name}, and every hex below it. ${HEXES[t.config.hex - 1].text}`, 'magic');
    // Hex III: the table opens under an omen, drawn as if it were ante two.
    if (t.config.hex >= 3) this.rollOmen(2);
    this.fx.push({ t: 'music', mood: 'table' });
    this.beginHand();
    return { ok: true };
  }

  // ---------------------------------------------------------------- hand flow

  private beginHand(): void {
    const t = this.table;
    if (!this.canDealHand()) return;

    clearHandMagic(t);
    reapConjured(t);
    bindInscribedPairs(t);

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

    // Its own stream per hand, so a seeded table deals the same cards on the
    // same hand number whatever happened in between.
    t.deck = this.stream(`deck:${t.handNumber}`).shuffle([...t.cards.keys()]);

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
      // A bot's creed wakes when the table stops opening warm (Hex I).
      const creed = creedOf(covenOf(p.coven));
      if (creed && p.isBot && !p.eliminated && !p.relics.includes(creed) && creedAwake(p.isBot, t.config.hex, t.ante)) {
        p.relics.unshift(creed);
        log(t, `${p.name}'s creed wakes: ${RELIC_BY_ID[creed]?.name}. ${RELIC_BY_ID[creed]?.text}`, 'magic', { playerId: p.id });
      }
      refreshMaxMana(p, t);
      // Two at the top of the hand, not three. At three, a measured session
      // ended every hand with four unspent mana per player out of a ceiling
      // of eight — which means casting was never a choice, only a chore you
      // could skip. Scarcity is what makes a sigil a decision.
      p.mana = Math.min(p.maxMana, p.mana + 2 + relicNumber(p.relics, (r) => r.mana?.start));

      // Two a hand, not one: the spell layer is the reason to play, and one
      // draw meant most sigils never came up in a whole run.
      const extra = relicNumber(p.relics, (r) => r.sigils?.drawPerHand)
        + omenNumber(t.omens, (o) => o.sigilDraw);
      const draws = 2 + extra;
      // The first draw leans to the coven's school (COVEN_LEAN), so a coven
      // is a pool for the whole run and not only its opening hand.
      const lean = leanOf(covenOf(p.coven));
      const leans = !!lean && t.ante >= COVEN_LEAN_FROM_ANTE && this.rng.chance(COVEN_LEAN);
      for (let i = 0; i < draws; i++) {
        if (p.sigils.length < sigilHandSize(p)) {
          giveSigil(t, p, randomSigil(this.rng, true, i === 0 && leans ? lean! : undefined));
        }
      }
      // The Unaligned's creed: a hand never starts without an answer. The
      // Nullify comes after the draws and past the hand's limit: the first
      // version took a draw's place in a full hand (FUN-REVIEW.md, round 4).
      if (hasRule(p.relics, 'last_word') && !p.eliminated
        && !p.sigils.some((s) => defOf(s)?.timing.includes('response'))) {
        p.sigils.push({ uid: nanoid(8), defId: 'nullify' });
        log(t, `${p.name}'s Last Word: a Nullify comes to hand.`, 'magic', { playerId: p.id, rule: ruleRelic(p, 'last_word') });
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
        t.modNotes.push(`${rankPlural(seal)} are sealed`);
      }
    }

    // The Keepsake: a hole card folded before the flop last hand is dealt
    // back first. It is taken out of the draw pile so nobody else can draw it.
    for (const p of players) {
      const kept = p.keepsake;
      p.keepsake = undefined;
      if (!kept || !hasRule(p.relics, 'keepsake') || !t.cards.has(kept)) continue;
      const at = t.deck.indexOf(kept);
      if (at < 0) continue;
      t.deck.splice(at, 1);
      p.hole.push(kept);
      const kc = card(t, kept);
      if (kc) kc.origin = 'deck';
      applySeal(t, kept);
      log(t, `${p.name}'s Keepsake: ${describeCard(t, kept)} comes back to them.`, 'magic', { playerId: p.id, rule: ruleRelic(p, 'keepsake') });
    }

    const omenHole = omenNumber(t.omens, (o) => o.deal?.extraHole);
    const perPlayer = players.map(
      (p) => 2 + omenHole + relicNumber(p.relics, (r) => r.deal?.extraHole),
    );
    const maxCards = Math.max(...perPlayer, 0);

    for (let round = 0; round < maxCards; round++) {
      players.forEach((p, i) => {
        if (round >= perPlayer[i] || p.hole.length >= perPlayer[i]) return;
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

    // The Lodestone: a rank for this hand, drawn in front of the table, Wild
    // for its owner (table.ts modsFor).
    for (const p of players) {
      if (!hasRule(p.relics, 'lodestone')) continue;
      const rank = this.stream(`lodestone:${t.handNumber}:${p.seat}`).pick(RANKS);
      p.lodestone = rank;
      t.modNotes.push(`${rankPlural(rank)} are Wild for ${p.name}`);
      log(t, `${p.name}'s Lodestone draws ${rankPlural(rank)}: every ${RANK_NAME[rank]} is Wild for them this hand.`, 'impossible', {
        playerId: p.id, rule: ruleRelic(p, 'lodestone'),
      });
    }

    // Cold Read: one hole card of every other player, from the deal. A sealed
    // card stays unreadable, as it does for every other way of seeing one.
    for (const p of players) {
      if (!hasVision(p.relics, 'every_hole')) continue;
      for (const q of players) {
        if (q.id === p.id) continue;
        const id = q.hole.find((h) => card(t, h)?.veil !== 'sealed');
        if (id && !p.foreknowledge.seenHole.includes(id)) p.foreknowledge.seenHole.push(id);
      }
    }
  }

  private postBlinds(): void {
    const t = this.table;
    const seats = contenders(t);
    // beginHand holds the table until this is true. Saying so here means a
    // route that ever gets round it reports what is wrong, rather than a
    // TypeError on `undefined.seat` eleven frames down.
    if (seats.length < 2) {
      throw new Error(`postBlinds with ${seats.length} player(s) able to post`);
    }
    const heads = seats.length === 2;

    // Heads up, the button is the small blind.
    const sbPlayer = heads
      ? seats.find((p) => p.seat === t.dealerSeat) ?? seats[0]
      : nextSeat(t, t.dealerSeat, (p) => !p.eliminated && !p.sittingOut) ?? seats[0];
    const bbPlayer = nextSeat(t, sbPlayer.seat, (p) => !p.eliminated && !p.sittingOut && p.id !== sbPlayer.id)
      ?? seats.find((p) => p.id !== sbPlayer.id) ?? seats[0];

    // Published, so every seat can say what position it is in without the
    // client re-deriving it. See Table.sbId.
    t.sbId = sbPlayer.id;
    t.bbId = bbPlayer.id;

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

  /**
   * Put the acting player on the clock.
   *
   * `resume` is the same turn picking up again after a sigil resolved. It
   * must not count as a fresh turn: resetting the cast tally there made the
   * two-casts-a-turn cap unreachable, and paying a bot's full deliberation
   * again after every cast was a large share of a hand's running time. The
   * bot already thought before it cast; what follows is a beat.
   */
  private startActionClock(resume = false): void {
    const t = this.table;
    const p = byId(t, t.actingId);
    if (!p) { this.advanceStreet(); return; }

    if (!resume) this.castsThisTurn.delete(p.id);
    t.actingUntil = Date.now() + t.config.actionSeconds * 1000;
    this.wait(t.config.actionSeconds * 1000, () => {
      // Time is a fold, unless checking is free.
      const toCall = t.currentBet - p.bet;
      this.applyAction(p, toCall > 0 ? { kind: 'fold' } : { kind: 'check' }, true);
    });

    if (p.isBot) {
      const think = thinkTime(this.rng, { fast: resume, actors: live(t).length, speed: t.config.speed });
      this.botClock.set(p.id, Date.now() + think);
    } else if (!resume) this.fx.push({ t: 'sfx', name: 'your_turn' });

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

    this.resolveMirrored(dealt);

    this.fx.push({ t: 'deal', cardIds: dealt, to: 'board', stagger: 140 });
    this.fx.push({ t: 'sfx', name: `street_${phase}` });
    log(t, `${phase[0].toUpperCase()}${phase.slice(1)}: ${dealt.map((id) => describeCard(t, id)).join(' ')}`, 'plain');

    if (phase === 'river') grantInformantVision(t, this.rng);
    if (phase === 'flop') this.foreknown();
    if (phase === 'river') this.secondRiver();
  }

  /**
   * The Long Now's creed: with the flop down, the river is the second card
   * of the draw pile (the turn is the first). Its owner sees it the way
   * Foresight shows it, and a Rewind or a Burn can still change what comes.
   */
  private foreknown(): void {
    const t = this.table;
    const river = t.deck[1];
    if (!river) return;
    for (const p of live(t)) {
      if (!hasRule(p.relics, 'foreknown') || p.foreknowledge.deckPeek.includes(river)) continue;
      p.foreknowledge.deckPeek = [...p.foreknowledge.deckPeek, river];
      log(t, `${p.name} has already seen the river.`, 'magic', { playerId: p.id, rule: ruleRelic(p, 'foreknown') });
    }
  }

  /**
   * The Second River: once a hand, the first owner in seat order whose seven
   * cards read as High Card has the river dealt again, in front of the table.
   * Under a worst-hand-wins rule a High Card is not a miss, so it stands.
   */
  private secondRiver(): void {
    const t = this.table;
    const id = t.board[t.board.length - 1];
    if (!id || card(t, id)?.amber) return;
    for (const p of live(t)) {
      if (!hasRule(p.relics, 'second_river')) continue;
      const mods = modsFor(t, p);
      if (mods.lowWins) continue;
      if (evaluate({ cards: handCards(t, p), viewerId: p.id, mods }).cat !== Cat.HighCard) continue;
      const fresh = drawId(this.ctx());
      if (!fresh) return;
      t.board[t.board.length - 1] = fresh;
      t.discard.push(id);
      this.fx.push({ t: 'rewind', cardId: fresh });
      this.fx.push({ t: 'sfx', name: 'rewind' });
      log(t, `${p.name}'s Second River: ${describeCard(t, id)} is unmade and the river runs again (${describeCard(t, fresh)}).`, 'impossible', {
        playerId: p.id, rule: ruleRelic(p, 'second_river'),
      });
      return;
    }
  }

  /**
   * The Twinned inscribes cards Mirrored and promises each one copies the
   * community card to its left. The mark alone is inert — `mirror` and `graft`
   * copy the faces themselves and carry it only as a tag — so a card the omen
   * inscribed has to take its neighbour's identity as it lands.
   *
   * Resolved in deal order, so two mirrored cards in a row chain down the board
   * rather than both copying the same original. The leftmost community card has
   * nothing to its left and stays itself.
   */
  private resolveMirrored(dealt: string[]): void {
    const t = this.table;
    for (const id of dealt) {
      const i = t.board.indexOf(id);
      if (i <= 0) continue;
      const dst = card(t, id);
      if (!dst || !dst.marks.includes('mirrored')) continue;
      const src = card(t, t.board[i - 1]);
      if (!src || src.id === dst.id) continue;
      dst.faces = src.faces.map((f) => ({ ...f }));
      dst.collapsed = src.collapsed;
      dst.veil = src.veil;
      this.fx.push({ t: 'entangle', cardIds: [src.id, dst.id] });
      log(t, `The board holds two of ${describeCard(t, src.id)}.`, 'impossible');
    }
  }

  /**
   * The Kindling: a card inscribed Burning leaves the board at the end of the
   * street it landed on. Same mechanics as the `burn` sigil — the slot is
   * remembered so the gap stays visible.
   *
   * The floor is what keeps a showdown evaluable: a hand needs five cards, and
   * two of them are the hole, so the board has to reach showdown holding three.
   * Streets still to come each bring one, so the board may fall to one at the
   * end of the flop, two at the end of the turn, and three on the river.
   */
  private burnOffBoard(): void {
    const t = this.table;
    const toCome = t.phase === 'flop' ? 2 : t.phase === 'turn' ? 1 : 0;
    const floor = Math.max(0, 3 - toCome);

    for (const id of [...t.board]) {
      if (t.board.length <= floor) break;
      const c = card(t, id);
      if (!c || !c.marks.includes('burning') || c.amber) continue;
      const slot = t.board.indexOf(id);
      if (slot < 0) continue;
      t.board.splice(slot, 1);
      t.burnedSlots.push(slot);
      t.discard.push(id);
      this.fx.push({ t: 'burn', cardId: id });
      this.fx.push({ t: 'sfx', name: 'card_burn' });
      log(t, `${describeCard(t, id)} burns away.`, 'impossible');
    }
  }

  private advanceStreet(): void {
    const t = this.table;
    t.actingId = null;
    t.actingUntil = null;
    this.clearWait();

    this.burnOffBoard();
    if (live(t).length <= 1) { this.toShowdown(); return; }

    const next = this.streetAfter(t.phase);
    if (next === 'showdown') { this.toShowdown(); return; }

    t.phase = next;
    this.dealStreet(next);
    this.flush();
    this.beat(320, () => this.beginStreet());
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
      // A street still ends here, so a Burning card still leaves on it —
      // otherwise the one rule The Kindling adds quietly stops applying the
      // moment the table is all in.
      this.burnOffBoard();
      if (t.phase === 'river' || t.board.length >= 5) { this.toShowdown(); return; }
      const next = this.streetAfter(t.phase);
      if (next === 'showdown') { this.toShowdown(); return; }
      t.phase = next;
      this.dealStreet(next);
      this.flush();
      this.beat(750, step);
    };
    this.beat(600, step);
  }

  private toShowdown(): void {
    const t = this.table;
    t.phase = 'showdown';
    t.actingId = null;
    t.actingUntil = null;
    this.clearWait();

    // Anything still undecided has to decide now. That is what a showdown is.
    // A hole card settles on the face that helps its holder most, as
    // Superpose's card says, read against the board it is settling into.
    const ctx = this.ctx();
    for (const p of live(t)) {
      for (const id of p.hole) {
        const c = card(t, id);
        if (c && isQuantum(c)) {
          const best = this.kindestFace(p, c);
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
    this.wait(this.payoutHold(payout), () => this.endHand());
  }

  /**
   * How long the table sits on the result before the next hand starts.
   *
   * This used to be a flat 3.2 seconds for anything contested, which was
   * shorter than the client's own reveal: it deals the winning cards in one
   * at a time, and an impossible hand does it slowly and deliberately, so the
   * biggest moment in the game was reliably cut off part-way through and
   * replaced by the next deal. The hold has to be at least as long as the
   * animation it is holding for, plus enough time afterwards to actually read
   * what happened.
   */
  private payoutHold(payout: PayoutInfo): number {
    const t = this.table;
    const revealed = payout.entries.filter((e) => e.cards.length > 0);
    // Nobody showed a hand — everyone folded. There is nothing to read.
    if (revealed.length === 0) return 1400;

    // Matches ShowdownPanel: a 320ms lead-in, then one card every 90ms, or
    // every 300ms when the hand is one of the impossible categories.
    const impossible = payout.entries.some((e) => e.impossible);
    const step = impossible ? 300 : 90;
    const longestReveal = Math.max(0, ...payout.entries.map((e) => e.usedIds.length));
    const revealMs = 320 + longestReveal * step;

    // Each extra hand on screen is another line to read before the deal.
    const readMs = 1500 + revealed.length * 450;

    // The impossible categories are the payoff the whole deck exists for.
    // They get to breathe.
    const ceremony = impossible ? 1800 : 0;

    /*
     * Speed scales the time spent *reading* the result. It deliberately does
     * not scale `revealMs`: that is the length of an animation the client is
     * already playing, and cutting the hold below it deals the next hand over
     * the top of the winning hand being turned over — the exact bug this
     * method was written to fix. A blitz table gets a shorter pause after the
     * reveal, never a truncated reveal.
     */
    const tempo = TEMPO[t.config.speed] ?? TEMPO.standard;

    /*
     * The winning hand's *name* also animates: `ShowdownPanel` runs it
     * through `DecodeText` at a 430ms lead plus 42ms a character, so
     * "Straight Flush, Ace High" takes about 1.4s to resolve — longer than
     * the five-card reveal it sits beside. These two were written on
     * different branches and neither knew about the other, so the floor
     * covered the cards and would have cut the name off on a blitz table.
     */
    const longestName = Math.max(
      0,
      ...payout.entries.filter((e) => e.won > 0).map((e) => e.handName.length),
    );
    const decodeMs = longestName > 0 ? 430 + longestName * 42 : 0;

    const scaled = revealMs + Math.round((readMs + ceremony) * tempo.hold);
    const floor = Math.max(revealMs, decodeMs) + 450;
    return Math.min(9000, Math.max(floor, scaled));
  }

  private bestFaceFor(faces: Face[]): number {
    let best = 0;
    for (let i = 1; i < faces.length; i++) if (faces[i].rank > faces[best].rank) best = i;
    return best;
  }

  /**
   * The face of an undecided hole card that makes its holder's hand best
   * (lowest, under a worst-hand-wins rule).
   *
   * Showdown used to settle every undecided hole card on its highest rank,
   * whatever the hand needed: a card that was the Seven of Spades or the King
   * of Hearts, on a board of two Sevens, became the King, while every read of
   * the hand before showdown (the player's own hand meter, the bots' equity,
   * the evaluator's "the search is the collapse") counted it as the Seven. A
   * player holding an undecided card was shown a hand they did not have and
   * bet on it. Measured from the player's chair (2026-10-10, round 4) the
   * Unmoored, whose every hand holds one, lost its stack in the first ante
   * more often than any other coven. Ties keep the higher rank, so a card
   * that makes no difference settles where it always did.
   */
  private kindestFace(p: Player, c: CardEntity): number {
    const t = this.table;
    const mods = modsFor(t, p);
    const was = c.collapsed;
    let best = this.bestFaceFor(c.faces);
    let bestScore: number | null = null;
    for (let i = 0; i < c.faces.length; i++) {
      c.collapsed = i;
      const score = evaluate({ cards: handCards(t, p), viewerId: p.id, mods }).score;
      const better = bestScore === null
        || (mods.lowWins ? score < bestScore : score > bestScore)
        || (score === bestScore && c.faces[i].rank > c.faces[best].rank);
      if (better) { best = i; bestScore = score; }
    }
    c.collapsed = was;
    return best;
  }

  private endHand(): void {
    const t = this.table;

    for (const p of t.players) {
      if (!p.eliminated && p.chips <= 0 && this.catchBust(p)) continue;
      if (!p.eliminated && p.chips <= 0) {
        p.eliminated = true;
        p.folded = true;
        p.bustedBy = this.bustedBy(p);
        log(t, p.bustedBy
          ? `${p.name} is out, to ${p.bustedBy.name}'s ${p.bustedBy.handName}.`
          : `${p.name} is out.`, 'warn', { playerId: p.id });
        this.fx.push({ t: 'eliminate', playerId: p.id });
        this.fx.push({ t: 'sfx', name: 'eliminate' });
        for (const q of t.players) {
          const bonus = relicNumber(q.relics, (r) => r.economy?.onEliminate);
          if (bonus > 0 && q.id !== p.id && !q.eliminated) {
            q.shards += bonus + Math.floor(p.shards / 2);
            log(t, `${q.name} inherits from ${p.name}.`, 'magic', { playerId: q.id });
          }
        }
        this.usurp(p);
      }
    }

    if (alive(t).length <= 1) { this.endGame(); return; }
    // Nobody left to play for. A solo run used to make its player sit through
    // the bots finishing the table with no skip: minutes of dead air on every
    // first bust, inside Steam's two-hour refund window. The run ends here and
    // the chip leader takes the table.
    if (this.everyHumanOut()) { this.endGame(); return; }

    const antePassed = t.handNumber % anteLength(t) === 0;
    // The demo's last ante is over: the run ends here, on the wishlist screen.
    if (antePassed && t.config.demoAntes && t.ante >= t.config.demoAntes) { this.endDemo(); return; }
    if (antePassed) { this.openShop(); return; }

    this.fx.push({ t: 'music', mood: 'table' });
    this.flush();
    this.wait(520, () => this.beginHand());
  }

  /**
   * The phylactery: a solo player's first bust before ante 3 at Hex I buys
   * them back in instead of ending the run (see PHYLACTERY_BEFORE_ANTE for
   * why). The bots keep what they won; only the player's stack comes back.
   * Tables with two humans never use it: a bust there does not end the run.
   */
  private catchBust(p: Player): boolean {
    const t = this.table;
    if (p.isBot || !p.phylactery || !this.solo || t.ante >= PHYLACTERY_BEFORE_ANTE) return false;
    p.phylactery = false;
    p.revived = this.bustedBy(p) ?? { name: 'the table', handName: 'Uncontested', ante: t.ante, hand: t.handNumber };
    const stack = Math.max(t.bb, Math.round((t.config.startingChips * PHYLACTERY_STACK) / 50) * 50);
    p.chips = stack;
    log(t, `${p.name}'s phylactery breaks. ${p.revived.name}'s ${p.revived.handName} took the stack; ${p.name} buys back in with ${stack.toLocaleString()}.`,
      'magic', { playerId: p.id });
    this.fx.push({
      t: 'banner', text: 'THE PHYLACTERY BREAKS',
      sub: `Back in with ${stack.toLocaleString()}. The next bust ends the run`, tone: 'magic',
    });
    this.fx.push({ t: 'sfx', name: 'superpose' });
    return true;
  }

  /**
   * The Usurper: whoever took a player's last chip, holding it, takes every
   * relic they held (a creed stays with its coven).
   */
  private usurp(out: Player): void {
    const t = this.table;
    const taker = t.payout?.entries
      .filter((e) => e.playerId !== out.id && e.won > 0)
      .sort((a, b) => b.won - a.won)[0];
    const q = taker ? byId(t, taker.playerId) : undefined;
    if (!q || q.eliminated || !hasRule(q.relics, 'usurper')) return;
    const taken = out.relics.filter((id) => !isCreed(id) && !q.relics.includes(id));
    if (!taken.length) return;
    q.relics.push(...taken);
    out.relics = out.relics.filter((id) => !taken.includes(id));
    refreshMaxMana(q, t);
    log(t, `${q.name} usurps ${out.name}: ${taken.map((id) => RELIC_BY_ID[id]?.name ?? id).join(', ')}.`, 'impossible', {
      playerId: q.id, rule: ruleRelic(q, 'usurper'),
    });
  }

  /**
   * Who took this player's last chip, and with what, from the payout that
   * just happened. A run that ends without the player being told why reads
   * as the game cheating; one that names the hand reads as poker.
   */
  private bustedBy(p: Player): BustedBy | undefined {
    const t = this.table;
    const pay = t.payout;
    if (!pay) return undefined;
    // The pot they were eligible for went to someone else: the biggest winner
    // other than them is who took the last chip.
    const taker = pay.entries
      .filter((e) => e.playerId !== p.id && e.won > 0)
      .sort((a, b) => b.won - a.won)[0];
    const who = taker ? byId(t, taker.playerId) : undefined;
    if (!taker || !who) return undefined;
    const mine = pay.entries.find((e) => e.playerId === p.id && e.cards.length > 0);
    return {
      name: who.name,
      handName: taker.handName,
      yourHand: mine?.handName,
      ante: t.ante,
      hand: t.handNumber,
    };
  }

  /**
   * The demo's last ante has been played. Nobody won the table: the run is
   * cut off on purpose, so the chip count is reported but no winner is
   * declared, and nothing a win unlocks is unlocked.
   */
  private endDemo(): void {
    const t = this.table;
    t.phase = 'gameover';
    t.winnerId = null;
    t.demoComplete = true;
    t.actingId = null;
    this.clearWait();
    const you = t.players.find((p) => !p.isBot && !p.eliminated);
    log(t, `The demo ends after ante ${t.ante}.`, 'win');
    this.fx.push({
      t: 'banner', text: 'YOU SURVIVED',
      sub: `${t.ante} antes${you ? `, ${you.chips.toLocaleString()} chips` : ''}. The full run goes on`, tone: 'win',
    });
    this.fx.push({ t: 'sfx', name: 'victory' });
    this.fx.push({ t: 'music', mood: 'menu' });
    this.flush();
  }

  /**
   * A hand needs two players who can actually post a blind. `alive` is not that
   * test: restoring a table marks every human `sittingOut` until they
   * reconnect, so a saved two-human table came back, passed an `alive >= 2`
   * check, and threw out of postBlinds on every tick — recovered each time by
   * the stall guard, which is not the same as not crashing.
   *
   * Holding instead of dealing lets the table sit until someone comes back;
   * the reaper still takes it if nobody does.
   */
  private canDealHand(): boolean {
    const t = this.table;
    if (contenders(t).length >= 2) return true;
    this.wait(1000, () => { if (this.canDealHand()) this.beginHand(); });
    return false;
  }

  private endGame(): void {
    const t = this.table;
    // Usually one player is left. When the run ends because every human is
    // out, the bots still standing are ranked by chips.
    const standing = alive(t).sort((a, b) => b.chips - a.chips);
    const last = standing[0];
    t.phase = 'gameover';
    t.winnerId = last?.id ?? null;
    t.actingId = null;
    this.clearWait();
    if (last) {
      const early = standing.length > 1;
      log(t, early
        ? `${last.name} leads with ${last.chips.toLocaleString()} chips and takes the table.`
        : `${last.name} takes the table.`, 'win', { playerId: last.id });
      this.fx.push({
        t: 'banner', text: `${last.name} WINS`,
        sub: early ? 'You are out. The table is closed' : 'The table is closed', tone: 'win',
      });
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
    t.bb = bigBlindAt(t.config.baseBlind, steps);
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
      // Give the omen its own beat before the market covers the screen. The
      // client holds the market back until the omen banner has finished
      // (3.2s, plus its fade), so a shorter wait here was spent out of the
      // shop clock while the player could not see the shop.
      this.wait(t.omens.length ? 3500 : 200, () => this.openMarket());
    });
  }

  private openMarket(): void {
    const t = this.table;
    t.phase = 'shop';

    payInterest(t);
    const untimed = this.solo;
    for (const p of alive(t)) {
      p.shopDone = false;
      const shop = rollShop(t, p, this.stream(`shop:${t.ante}:${p.seat}`));
      // No clock to show: a solo Market closes when the player presses Done.
      if (untimed) shop.closesAt = 0;
      t.shop.set(p.id, shop);
      if (p.isBot) this.botClock.set(p.id, Date.now() + this.paced(800 + this.rng.int(1500)));
    }

    this.fx.push({ t: 'sfx', name: 'shop_open' });
    this.flush();
    this.wait(this.marketMs(), () => this.closeShop());
  }

  /**
   * One new permanent rule per ante. They stack and never come off, so the
   * last hands of a run are played under a rulebook nobody sat down to.
   */
  private rollOmen(asAnte = this.table.ante): void {
    const t = this.table;
    const rng = this.stream(`omen:${t.ante}:${t.omens.length}`);
    const taken = new Set(t.omens.map((o) => o.id));
    let pool = OMEN_POOL.filter((o) => !taken.has(o.id) && o.minAnte <= asAnte);
    if (pool.length === 0) return;
    // See IMPOSSIBLE_BY_ANTE: by the middle of a run, the deck must have been
    // given a way to hold a card twice.
    const opened = t.omens.some((a) => OMEN_BY_ID[a.id] && keepsPromise(OMEN_BY_ID[a.id]));
    if (!opened && t.ante >= IMPOSSIBLE_BY_ANTE) {
      const opening = pool.filter(keepsPromise);
      if (opening.length) pool = opening;
    }

    const bag: typeof pool = [];
    for (const o of pool) for (let i = 0; i < o.weight; i++) bag.push(o);
    const def = rng.pick(bag);

    const omen: ActiveOmen = { id: def.id, ante: t.ante };
    if (def.killsRank) {
      // Strike a rank nobody is currently holding a pair of, for fairness.
      const all: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
      omen.rank = rng.pick(all);
    }
    t.omens.push(omen);

    // Omens that permanently edit the shared deck do it once, on arrival.
    // Unmarked cards first; when a long run has marked most of the deck, the
    // rest come from cards that do not carry this mark yet, so the banner's
    // count ("Thirteen cards...") is always the number that changed.
    const ins = def.deal?.inscribe;
    if (ins) {
      const printed = [...t.cards.values()].filter((c) => c.origin !== 'conjured');
      const plain = printed.filter((c) => c.marks.length === 0);
      const picked = rng.sample(plain, ins.count);
      if (picked.length < ins.count) {
        const marked = printed.filter((c) => c.marks.length > 0 && !c.marks.includes(ins.markId));
        picked.push(...rng.sample(marked, ins.count - picked.length));
      }
      for (const c of picked) {
        if (!c.marks.includes(ins.markId)) c.marks.push(ins.markId);
      }
    }

    for (const p of t.players) refreshMaxMana(p, t);

    const detail = omen.rank ? `${rankPlural(omen.rank)}` : '';
    log(t, `OMEN — ${def.name}: ${def.text}${detail ? ` (${detail})` : ''}`, 'impossible');
    this.fx.push({ t: 'banner', text: def.name.toUpperCase(), sub: 'A new rule, permanently', tone: 'impossible' });
    this.fx.push({ t: 'sfx', name: 'seal' });
    this.fx.push({ t: 'shake', power: 0.6 });
    this.fx.push({ t: 'flash', color: '#ff4fa3', power: 0.45 });
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

  shopScribe(id: string, uid: string, text: string, replaceUid?: string): { ok: boolean; error?: string } {
    const p = byId(this.table, id);
    if (!p || this.table.phase !== 'shop') return { ok: false, error: 'The market is closed' };
    const r = scribe(this.table, p, uid, text, replaceUid);
    if (r.ok) this.fx.push({ t: 'sfx', name: 'inscribe' });
    this.flush();
    return r;
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
    if (alive(t).every((q) => q.shopDone)) { this.closeShop(); return; }
    if (this.humansDoneShopping()) {
      // Only ever shortens the clock: a shared Market's 45s can already be
      // closer than this.
      const soon = Date.now() + this.paced(BOTS_AFTER_DONE_MS);
      if (!this.onDeadline || this.deadline > soon) this.wait(BOTS_AFTER_DONE_MS, () => this.closeShop());
    }
  }

  /** Every human still in the run has pressed Done; only bots are shopping. */
  private humansDoneShopping(): boolean {
    return alive(this.table).every((q) => q.isBot || q.shopDone);
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
          // The Keepsake: the higher of the folded hole cards waits for the next deal.
          if (hasRule(p.relics, 'keepsake')) {
            const best = p.hole
              .map((id) => card(t, id))
              .filter((c): c is NonNullable<typeof c> => !!c && c.origin !== 'conjured' && c.faces.length === 1)
              .sort((a, b) => b.faces[0].rank - a.faces[0].rank)[0];
            if (best) {
              p.keepsake = best.id;
              log(t, `${p.name} keeps a card for next hand.`, 'magic', { playerId: p.id, rule: ruleRelic(p, 'keepsake') });
            }
          }
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
        this.tells(p);
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

  /**
   * The Quiet's creed: the first bet or raise each opponent makes in a hand
   * shows a Quiet player one of that opponent's hole cards (never a sealed
   * one, and never through a Sanctum or a Gloaming).
   */
  private tells(bettor: Player): void {
    const t = this.table;
    for (const q of live(t)) {
      if (q.id === bettor.id || !hasRule(q.relics, 'tells')) continue;
      if (q.tells?.includes(bettor.id) || bettor.warded || hasRule(bettor.relics, 'sanctum')) continue;
      q.tells = [...(q.tells ?? []), bettor.id];
      const unseen = bettor.hole.filter((id) => card(t, id)?.veil !== 'sealed' && !q.foreknowledge.seenHole.includes(id));
      if (!unseen.length) continue;
      q.foreknowledge.seenHole.push(this.stream(`tell:${t.handNumber}:${q.seat}:${bettor.seat}`).pick(unseen));
      log(t, `${q.name} reads ${bettor.name}'s tell.`, 'magic', { playerId: q.id, rule: ruleRelic(q, 'tells') });
    }
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

    // Casting freezes the betting clock until the stack settles. A street
    // transition waiting out its beat is frozen, not cancelled: `interrupted`
    // outlives the timer and `settleStack` owes it.
    if (wasIdle) t.actingUntil = null;
    this.clearWait();

    if (t.stack && t.stack.pending.length > 0) {
      this.wait(t.config.responseSeconds * 1000, () => this.settleStack());
      for (const rid of t.stack.pending) {
        const bot = byId(t, rid);
        if (bot?.isBot) this.botClock.set(rid, Date.now() + thinkTime(this.rng, { fast: true, speed: this.table.config.speed }));
      }
      this.flush();
    } else {
      // Nobody can answer this, so there is nothing to wait for. Magic is
      // frequent; a fixed beat per cast is most of a hand's running time.
      this.flush();
      this.wait(90, () => this.settleStack());
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
      this.wait(200, () => this.settleStack());
    } else {
      this.flush();
    }
  }

  private settleStack(): void {
    const t = this.table;
    if (!t.stack) return;
    // The street transition the cast interrupted, if this is still the point
    // it was armed for. See `interrupted`.
    const owed = this.owedBeat();
    this.clearWait();
    resolveStack(this.ctx());
    this.flush();

    // Hand back to whoever was on the clock. Every branch here must either
    // schedule something or hand the clock to a player — an exit that does
    // neither wedges the table permanently.
    this.wait(130, () => {
      if (t.phase === 'showdown' || t.phase === 'payout' || t.phase === 'gameover'
        || t.phase === 'shop' || t.phase === 'lobby') {
        this.flush();
        return;
      }
      if (live(t).length <= 1) { this.toShowdown(); return; }
      // The interrupted beat first: between a street being dealt and its
      // round opening, `roundComplete()` is answering about the street
      // before this one.
      if (owed) { this.interrupted = null; owed(); return; }
      if (this.roundComplete()) { this.standDown(); this.advanceStreet(); return; }
      if (t.actingId) { this.startActionClock(true); return; }
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
    // A running game keeps its table alive, but only while somebody is there
    // to watch it. Bumping this on every tick unconditionally meant the
    // reaper's idle test could never pass: a table everyone had left played
    // bot-only hands forever, and a server restored from its database kept
    // dozens of them running.
    if (t.players.some((p) => !p.isBot && p.connected)) {
      t.lastActivity = Math.max(t.lastActivity, Date.now() - 60_000);
    }

    if (this.pausedAt) {
      if (Date.now() - this.pausedAt < PAUSE_MAX_MS) return;
      this.resume();
    }

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
    const grace = t.phase === 'shop' ? this.marketMs() + 4000 : 4000;
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
      // The pause between a bot's purchases is browsing for the player to
      // watch. Once every human is Done nobody is watching, so the bots finish
      // on consecutive ticks instead of making the player wait for them.
      const hurry = this.humansDoneShopping();
      for (const p of alive(t)) {
        if (!p.isBot || p.shopDone) continue;
        const at = this.botClock.get(p.id) ?? 0;
        if (now < at && !hurry) continue;
        const page = decideScribe(t, p, this.rng);
        if (page && scribe(t, p, page.uid, page.text, page.replace).ok) {
          this.botClock.set(p.id, now + this.paced(500 + this.rng.int(900)));
          this.flush();
          return;
        }
        const uid = decideShop(t, p, this.rng);
        // A refused purchase ends the bot's shopping. Ignoring the refusal
        // let a bot choose the same item every turn and never be done, which
        // held a solo Market open with the player already finished.
        if (uid && buy(t, p, uid, this.rng).ok) {
          this.botClock.set(p.id, now + this.paced(500 + this.rng.int(900)));
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

    // Two casts a turn is a flourish heads-up and a queue at a full table.
    const castCap = live(t).length > 4 ? 1 : 2;
    const spell = (this.castsThisTurn.get(acting.id) ?? 0) < castCap
      ? decideCast(t, acting, this.rng)
      : null;
    if (spell) {
      this.cast(acting.id, spell.uid, spell.targets);
      this.castsThisTurn.set(acting.id, (this.castsThisTurn.get(acting.id) ?? 0) + 1);
      // They still owe the table a betting decision afterwards. This is a
      // beat, not an animation wait — the client plays the cast from the
      // effect stream on its own clock — and it is paid ten times a hand.
      this.botClock.set(acting.id, Date.now() + 360);
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
    // Seeded, so a daily table meets the same opponents with the same temperament.
    const bot = this.addPlayer(`bot_${Rng.hash(`${t.seed}:bot:${t.players.length}`).toString(36)}`, name, true);
    // Bots drew a coven too, so that a table was not four identical
    // openings. With the picker gone (COVEN_CHOICE) that cuts the other way:
    // the player sits down Unaligned and every bot plays a rulebook they
    // were never shown. One table, one set of rules.
    if (bot) {
      bot.coven = COVEN_CHOICE
        ? r.pick(COVENS.filter((c) => c.id !== DEFAULT_COVEN)).id
        : DEFAULT_COVEN;
    }
    return bot;
  }

  removeBot(): void {
    const t = this.table;
    if (t.phase !== 'lobby') return;
    const last = [...t.players].reverse().find((p) => p.isBot);
    if (last) this.removePlayer(last.id);
  }
}
