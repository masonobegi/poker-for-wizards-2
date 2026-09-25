/**
 * Bots.
 *
 * They exist so a table is never dead, and so the game can be learned alone —
 * which means they have to play something recognisably like poker rather than
 * shoving at random. Equity comes from a small Monte Carlo rollout against the
 * real remaining deck; the rest is pot odds, a stable personality per bot, and
 * enough bluffing that they are not readable after four hands.
 *
 * They also cast sigils, including counterspells, because a table where only
 * humans use magic teaches the wrong lesson.
 */
import { type CardEntity, type Rank, SUITS, isQuantum } from '../../shared/cards';
import { evaluate } from '../../shared/hand';
import { Rng } from '../../shared/rng';
import { SIGIL_BY_ID, type SigilDef } from '../../shared/sigils';
import type { BetAction, BotSkill, Player, SigilTargets, Table, TableSpeed } from '../../shared/types';
import { canCast, cardsOf, live, manaCost, modsFor, scoringHole, totalPot } from './table';
import { config } from '../config';

interface Personality {
  /** 0 = plays anything, 1 = only premium holdings. */
  tight: number;
  /** 0 = passive caller, 1 = raises relentlessly. */
  aggro: number;
  /** How often they fire with nothing. */
  bluff: number;
  /** Appetite for casting sigils. */
  arcane: number;
}

/**
 * The three skill bands.
 *
 * `adept` is exactly what every bot in the game used to be, so an unset table
 * plays the way it always did.
 *
 * Each band is a range rather than a point, because three bots that all play
 * identically are one bot sitting in three chairs. A novice table still has a
 * spread of novices in it.
 */
interface SkillBand {
  tight: [number, number];
  aggro: [number, number];
  bluff: [number, number];
  arcane: [number, number];
  /**
   * How far this band's read on its own hand is dragged toward a coin flip.
   * 0 is a true estimate. Higher means weak hands look playable and strong
   * hands look beatable — the two errors that actually lose money.
   */
  blur: number;
  /** Random error added on top of the drag, as a +/- range. */
  jitter: number;
  /** Multiplier on the Monte Carlo sample size. A sharper read costs more. */
  sims: number;
  /**
   * Willingness to call without the odds. Above 1 is a calling station; below
   * 1 folds marginal spots a novice talks themselves into.
   */
  loose: number;
}

const BANDS: Record<BotSkill, SkillBand> = {
  novice: {
    tight: [0.12, 0.40], aggro: [0.10, 0.42], bluff: [0.02, 0.10], arcane: [0.22, 0.55],
    blur: 0.34, jitter: 0.16, sims: 0.45, loose: 1.9,
  },
  adept: {
    tight: [0.30, 0.75], aggro: [0.25, 0.80], bluff: [0.06, 0.26], arcane: [0.55, 0.95],
    blur: 0, jitter: 0, sims: 1, loose: 1,
  },
  master: {
    tight: [0.44, 0.82], aggro: [0.46, 0.96], bluff: [0.15, 0.36], arcane: [0.78, 1],
    blur: 0, jitter: 0, sims: 1.7, loose: 0.72,
  },
};

export function skillOf(t: Table): SkillBand {
  return BANDS[t.config.botSkill] ?? BANDS.adept;
}

/**
 * How fast the table runs.
 *
 * `think` scales how long a bot deliberates. `hold` scales how long a
 * finished hand stays on screen — but only the *reading* part of it: the
 * reveal animation underneath has a fixed duration set by the client, and
 * shortening the hold past it puts the next deal on top of the best moment in
 * the game. See `Engine.payoutHold`, which enforces that floor.
 *
 * `standard` is 1.0 on both, so a table that never sets a speed runs exactly
 * the way it always did.
 */
export const TEMPO: Record<TableSpeed, { think: number; hold: number }> = {
  relaxed: { think: 1.75, hold: 1.3 },
  standard: { think: 1, hold: 1 },
  blitz: { think: 0.3, hold: 0.45 },
};

/** Personalities are cached per bot, so the band has to be part of the key. */
const personalities = new Map<string, Personality>();

function personalityOf(p: Player, skill: BotSkill): Personality {
  const key = `${skill}:${p.id}`;
  let pr = personalities.get(key);
  if (!pr) {
    const r = new Rng(`pers:${skill}:${p.id}`);
    const b = BANDS[skill] ?? BANDS.adept;
    const span = ([lo, hi]: [number, number]): number => lo + r.next() * (hi - lo);
    pr = {
      tight: span(b.tight),
      aggro: span(b.aggro),
      bluff: span(b.bluff),
      arcane: span(b.arcane),
    };
    if (personalities.size > 600) personalities.clear();
    personalities.set(key, pr);
  }
  return pr;
}

// ---------------------------------------------------------------------------
// Equity
// ---------------------------------------------------------------------------

/** Card ids that could still come out — nothing on the board, in a hand, or burned. */
function unseen(t: Table, p: Player): string[] {
  const used = new Set<string>([...t.board, ...t.discard]);
  for (const q of t.players) for (const id of q.hole) used.add(id);
  return [...t.cards.keys()].filter((id) => !used.has(id));
}

const PREFLOP_SIMS = 60;
const POSTFLOP_SIMS = 80;

/**
 * A bot asks for its equity more than once per turn (once to decide whether to
 * cast, once to decide how to bet). The rollout is the most expensive thing the
 * server does, so the answer is memoised for as long as it stays true — which
 * is until the board, the field or its own cards change.
 */
const equityCache = new Map<string, number>();

function equityKey(t: Table, p: Player): string {
  return [
    t.handNumber, t.phase, t.board.length,
    p.id, p.hole.join(''), live(t).length,
    t.board.join(''),
  ].join('|');
}

export function equity(t: Table, p: Player, rng: Rng): number {
  const key = equityKey(t, p);
  const hit = equityCache.get(key);
  if (hit !== undefined) return hit;

  const value = computeEquity(t, p, rng);
  if (equityCache.size > 400) equityCache.clear();
  equityCache.set(key, value);
  return value;
}

/**
 * Rough win probability from rolling out the rest of the board and giving each
 * live opponent two random unseen cards.
 */
function computeEquity(t: Table, p: Player, rng: Rng): number {
  const opponents = live(t).filter((q) => q.id !== p.id);
  if (opponents.length === 0) return 1;

  const mods = modsFor(t, p);
  const myHole = cardsOf(t, scoringHole(t, p));
  if (myHole.length === 0) return 0;

  const pool = unseen(t, p);
  const need = Math.max(0, 5 - t.board.length);
  const boardCards = cardsOf(t, t.board);

  // Superposed or wild cards blow up the search space; fall back to a cheap read.
  const exotic = [...myHole, ...boardCards].some((c) => isQuantum(c) || c.marks.length > 0);
  const crowd = Math.max(1, opponents.length);
  const base = t.board.length === 0 ? PREFLOP_SIMS : POSTFLOP_SIMS;
  // Each opponent costs a full evaluation per rollout, so scale the sample down
  // rather than letting a six-handed pot take six times as long.
  // A sharper read costs more rollouts and a blurrier one costs fewer, which
  // is also why a novice table is cheaper to run than a master one.
  const band = skillOf(t);
  const sims = exotic
    ? Math.max(8, Math.round(16 * band.sims))
    : Math.max(12, Math.round((base / crowd) * band.sims));

  let wins = 0;
  let ties = 0;

  for (let s = 0; s < sims; s++) {
    const bag = rng.shuffle(pool);
    let k = 0;
    const runout: CardEntity[] = [];
    for (let i = 0; i < need && k < bag.length; i++) {
      const c = t.cards.get(bag[k++]);
      if (c) runout.push(c);
    }

    const mine = evaluate({ cards: [...myHole, ...boardCards, ...runout], viewerId: p.id, mods });

    let best = -Infinity;
    let bestIsTie = false;
    for (const o of opponents) {
      const oHole: CardEntity[] = [];
      for (let i = 0; i < 2 && k < bag.length; i++) {
        const c = t.cards.get(bag[k++]);
        if (c) oHole.push(c);
      }
      const theirs = evaluate({
        cards: [...oHole, ...boardCards, ...runout],
        viewerId: o.id,
        mods: modsFor(t, o),
      });
      if (theirs.score > best) { best = theirs.score; bestIsTie = false; }
      else if (theirs.score === best) bestIsTie = true;
    }

    if (mods.lowWins) {
      if (mine.score < best) wins++;
      else if (mine.score === best) ties++;
    } else if (mine.score > best) wins++;
    else if (mine.score === best) { ties++; void bestIsTie; }
  }

  const truth = (wins + ties * 0.5) / sims;
  if (band.blur <= 0 && band.jitter <= 0) return truth;

  /*
   * What a weaker player sees.
   *
   * Dragging the estimate toward 0.5 is the whole model: it makes a busted
   * draw look like a coin flip worth calling, and the nuts look like
   * something that can be outdrawn. Those are the two mistakes that actually
   * separate a bad poker player from a good one, and betting correctly on a
   * wrong number produces them for free — no special-case "blunder" code, and
   * no behaviour that reads as a dice roll.
   */
  const dragged = truth * (1 - band.blur) + 0.5 * band.blur;
  const noisy = dragged + (rng.next() - 0.5) * 2 * band.jitter;
  return Math.max(0, Math.min(1, noisy));
}

// ---------------------------------------------------------------------------
// Betting
// ---------------------------------------------------------------------------

type Street = 'preflop' | 'flop' | 'turn' | 'river';
const STREETS: readonly string[] = ['preflop', 'flop', 'turn', 'river'];
const isStreet = (ph: string): ph is Street => STREETS.includes(ph);

/**
 * Who was betting on the street before this one.
 *
 * A poker player's single most common aggressive action is the continuation
 * bet: you raised before the flop, so you bet the flop, whatever came. Without
 * it a bot can only ever bet when it has already made a hand, which is what
 * produced the old numbers — 30% check, 30% call, 4% raise, across a whole
 * session. That is not a player, it is a turnstile.
 *
 * `t.lastAggressorId` is reset each street, so it has to be remembered while
 * the street is still running. Every bot records it on every turn, so the
 * value kept is the one that was true when the last bot acted. A human who
 * raises after the final bot has acted is therefore missed — the bot behaves
 * as if it were still the aggressor and fires once into a raiser. That is a
 * rare and survivable misread, and much cheaper than threading per-street
 * history through the table state for this one use.
 */
interface HandMemory {
  key: string;
  aggressor: Partial<Record<Street, string | null>>;
}
let memory: HandMemory = { key: '', aggressor: {} };

function recall(t: Table): { wasAggressor: (id: string) => boolean } {
  const key = `${t.code}|${t.handNumber}`;
  if (memory.key !== key) memory = { key, aggressor: {} };
  const here = isStreet(t.phase) ? t.phase : null;
  if (here) {
    // `?? previous`: once somebody has bet this street, a later null (nobody
    // has re-raised since) must not erase them.
    memory.aggressor[here] = t.lastAggressorId ?? memory.aggressor[here] ?? null;
  }
  const idx = here ? STREETS.indexOf(here) : -1;
  const prev = idx > 0 ? (STREETS[idx - 1] as Street) : null;
  return { wasAggressor: (id) => !!prev && memory.aggressor[prev] === id };
}

/** How many live opponents still act after `p` on this street. */
function behindCount(t: Table, p: Player): number {
  const order = live(t).filter((q) => !q.allIn);
  const rel = (q: Player): number => (q.seat - t.dealerSeat + 1000) % 1000;
  const mine = rel(p);
  return order.filter((q) => q.id !== p.id && rel(q) > mine).length;
}

export function decideAction(t: Table, p: Player, rng: Rng): BetAction {
  const pr = personalityOf(p, t.config.botSkill);
  const band = skillOf(t);
  const mem = recall(t);
  const toCall = Math.max(0, t.currentBet - p.bet);
  const pot = Math.max(t.bb, totalPot(t));
  const eq = equity(t, p, rng);

  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const stackBB = p.chips / t.bb;
  const field = live(t).length;
  const opponents = Math.max(1, field - 1);
  const behind = behindCount(t, p);
  const late = behind <= 1;
  // Every bluff is worth less against more people: one of them has something.
  // At 0.3 per extra opponent, a 35-hand sample still ended 25 of them with
  // everybody folding — the bluffing was working on the bots, which is not
  // the same as the game being worth watching.
  const crowd = Math.max(0.22, 1 - (opponents - 1) * 0.4);

  // Short stacks must gamble or blind away.
  if (stackBB < 8 && eq > 0.5 && toCall > 0) return { kind: 'allin' };

  const sizing = (frac: number): number => {
    const raw = Math.round((pot * frac) / t.bb) * t.bb;
    return Math.max(t.bb, Math.min(p.chips, Math.max(raw, t.currentBet + t.minRaise)));
  };

  /** Put money in, as whichever action is legal from here. */
  const fire = (amount: number): BetAction => {
    if (amount >= p.chips) return { kind: 'allin' };
    if (t.currentBet > 0) {
      return amount > t.currentBet ? { kind: 'raise', amount } : (toCall > 0 ? { kind: 'call' } : { kind: 'check' });
    }
    return { kind: 'bet', amount };
  };

  // --- preflop -------------------------------------------------------------
  // Pot odds are the wrong yardstick before the flop: the bet is small, the
  // hand has three streets left, and equity here is measured against the whole
  // field to showdown — so it sits near 1/field for anything playable and the
  // comparison folds almost everything. Judging against that par share instead
  // is what an opening range actually is.
  if (t.phase === 'preflop') {
    const par = 1 / Math.max(2, field);
    const strong = eq > par * 1.42;
    const premium = eq > par * 1.75;
    const playable = eq > par * 1.06;
    const unraised = toCall <= t.bb;

    if (unraised) {
      if (strong && rng.chance(0.5 + pr.aggro * 0.3)) return fire(sizing(0.9));
      // A steal from the button with nothing, which is most of poker's
      // aggression and none of its equity.
      if (late && rng.chance((0.04 + pr.bluff * 0.5) * crowd)) return fire(sizing(0.75));
      if (toCall === 0) return { kind: 'check' };
      if (playable) return { kind: 'call' };
      return { kind: 'fold' };
    }

    if (premium && rng.chance(0.32 + pr.aggro * 0.3)) return fire(sizing(1.05));
    if (eq > par * 1.02) return toCall >= p.chips ? { kind: 'allin' } : { kind: 'call' };
    if (late && p.chips > toCall * 6 && rng.chance(pr.bluff * 0.7)) return fire(sizing(1.0));
    return { kind: 'fold' };
  }

  // --- nobody has bet this street -----------------------------------------
  if (toCall === 0) {
    if (mem.wasAggressor(p.id) && rng.chance((0.36 + pr.aggro * 0.22) * crowd)) {
      return fire(sizing(0.5 + pr.aggro * 0.2));
    }
    if (eq > 0.55 + pr.tight * 0.08) return fire(sizing(0.5 + pr.aggro * 0.35));
    // A draw is worth betting: it wins now or it wins later.
    if (eq > 0.38 && rng.chance((0.12 + pr.aggro * 0.22) * crowd)) return fire(sizing(0.45));
    if (late && rng.chance((0.02 + pr.bluff * 0.4) * crowd)) return fire(sizing(0.4 + rng.next() * 0.2));
    return { kind: 'check' };
  }

  // --- facing a bet --------------------------------------------------------
  const edge = eq - potOdds;

  if (edge > 0.14 && rng.chance(0.3 + pr.aggro * 0.4)) {
    // `sizing` already floors at `currentBet + minRaise`; capping it at 55% of
    // the stack can push it back UNDER that floor, and a raise smaller than
    // the minimum is not a legal action. Take the cap only when it still
    // clears the floor, and otherwise do not raise at all.
    const capped = Math.min(sizing(0.6 + pr.aggro * 0.5), Math.round(p.chips * 0.55));
    const amount = capped >= t.currentBet + t.minRaise ? capped : 0;
    if (amount >= p.chips * 0.85 || eq > 0.9) return { kind: 'allin' };
    if (amount > t.currentBet) return { kind: 'raise', amount };
  }

  // Raising with nothing, which is the only way a fold ever gets bought.
  if (eq < 0.3 && toCall < pot * 0.55 && p.chips > toCall * 4
    && rng.chance(pr.bluff * (late ? 1.0 : 0.5) * crowd)) {
    const amount = sizing(0.75);
    if (amount > t.currentBet && amount < p.chips) return { kind: 'raise', amount };
  }

  // Wide. Folding to every bet makes the aggression above worthless: a run
  // where the bots raised well and folded to each other ended fifteen of
  // twenty-two hands with nobody showing a card, which is not a poker game
  // anyone watched. Somebody has to call.
  //
  // `band.loose` scales that threshold rather than replacing it, so `adept`
  // is exactly the measured number and only the other two bands move.
  if (edge > -0.15 * band.loose) {
    // Stacking off is the one decision a bot cannot take back. Four-handed,
    // 50% against the field was enough to end three players in two hands.
    if (toCall >= p.chips * 0.75) return eq > 0.62 ? { kind: 'allin' } : { kind: 'fold' };
    return { kind: 'call' };
  }

  // A cheap price with any equity at all is a call. Showdowns are where this
  // game's whole point lands — an impossible hand nobody sees is a hand that
  // did not happen — so the bots are deliberately looser than a solver here.
  if (toCall <= pot * 0.28 * band.loose && eq > 0.26) return { kind: 'call' };
  if (toCall <= t.bb * 1.5 * band.loose && eq > 0.2
    && rng.chance(Math.min(0.95, 0.7 * band.loose))) {
    return { kind: 'call' };
  }

  return { kind: 'fold' };
}

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

function pickRank(t: Table, p: Player, rng: Rng, favourMine: boolean): Rank {
  const mine = cardsOf(t, p.hole)
    .flatMap((c) => c.faces.map((f) => f.rank));
  if (favourMine && mine.length) return rng.pick(mine);

  const boardRanks = cardsOf(t, t.board).flatMap((c) => c.faces.map((f) => f.rank));
  const pool = boardRanks.filter((r) => !mine.includes(r));
  if (pool.length) return rng.pick(pool);
  const all: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  return rng.pick(all.filter((r) => !mine.includes(r)));
}

function targetsFor(t: Table, p: Player, def: SigilDef, rng: Rng): SigilTargets | null {
  const opponents = live(t).filter((q) => q.id !== p.id && !q.warded);
  const boardIds = t.board;

  switch (def.target) {
    case 'none':
    case 'stack':
      return {};
    case 'player': {
      if (opponents.length === 0) return null;
      // Go after whoever is winning.
      const mark = opponents.reduce((a, b) => (b.chips > a.chips ? b : a));
      return { playerId: mark.id };
    }
    case 'rank':
      // Seal what helps you; unmake what helps them.
      return { rank: pickRank(t, p, rng, def.id === 'sealed_rank') };
    case 'suit':
      return { suit: rng.pick(SUITS) };
    case 'own_card': {
      if (p.hole.length === 0) return null;
      return { cardIds: [rng.pick(p.hole)] };
    }
    case 'board_card': {
      if (boardIds.length === 0) return null;
      return { cardIds: [rng.pick(boardIds)] };
    }
    case 'any_card': {
      const pool = [...p.hole, ...boardIds];
      if (pool.length === 0) return null;
      const id = def.id === 'inscribe' || def.id === 'superpose'
        ? (p.hole.length ? rng.pick(p.hole) : rng.pick(pool))
        : rng.pick(pool);
      return { cardIds: [id], markId: 'blooded' };
    }
    case 'two_cards': {
      const pool = [...boardIds, ...p.hole];
      if (pool.length < 2) return null;
      const picked = rng.sample(pool, 2);
      return { cardIds: picked };
    }
    default:
      return {};
  }
}

export interface BotCast { uid: string; targets: SigilTargets }

/** A sigil to fire during this bot's own action window, or nothing. */
export function decideCast(t: Table, p: Player, rng: Rng): BotCast | null {
  if (!t.config.magicEnabled || t.stack) return null;
  const pr = personalityOf(p, t.config.botSkill);

  const options = p.sigils
    .map((s) => ({ s, def: SIGIL_BY_ID[s.defId] }))
    .filter(({ s, def }) => def && !def.timing.includes('response') && canCast(t, p, s).ok);

  if (options.length === 0) return null;

  // Hold a little back for a counterspell, but only while mana is actually
  // scarce. Reserving unconditionally left bots sitting on a full pool all
  // game and the table never saw any magic.
  const holdsAnswer = p.sigils.some((s) => SIGIL_BY_ID[s.defId]?.timing.includes('response'));
  const reserve = holdsAnswer && p.mana <= 6 ? 1 : 0;

  const eq = t.board.length > 0 ? equity(t, p, rng) : 0.5;

  for (const { s, def } of rng.shuffle(options)) {
    if (p.mana - manaCost(p, def) < reserve) continue;

    let want = (def.botBias ?? 0.5) * pr.arcane;
    // Lean on magic when the cards are not cooperating, and to press an edge.
    if (eq < 0.35) want *= 1.35;
    if (eq > 0.7 && def.school === 'ruin') want *= 1.25;
    // A full hand is a wasted hand — spend down rather than hoard.
    if (p.sigils.length >= 4) want *= 1.6;
    // Mana at the cap is mana being thrown away every street. Measured runs
    // still ended with five unspent per player, so this leans harder: a bot
    // sitting on a full pool is a bot that has decided not to play the half
    // of the game the game is named after.
    if (p.mana >= p.maxMana - 1) want *= 1.7;
    else if (p.mana >= p.maxMana - 3) want *= 1.3;
    // Cheap spells should not be agonised over when the pool is deep.
    if (manaCost(p, def) <= 2 && p.mana >= 6) want *= 1.2;
    // The river is the last street there is. Mana carries into the next hand,
    // but the deal grants +3 on top and the pool is capped, so anything held
    // past this point either spills or simply never gets used.
    if (t.phase === 'river') {
      const spill = Math.max(0, p.mana + 3 - p.maxMana);
      want *= spill > 0 ? 1 + spill * 0.3 : 1.25;
    }

    if (!rng.chance(Math.min(0.9, want * 1.25))) continue;

    const targets = targetsFor(t, p, def, rng);
    if (!targets) continue;
    return { uid: s.uid, targets };
  }
  return null;
}

/** Whether to answer whatever is currently on the stack. */
export function decideResponse(t: Table, p: Player, rng: Rng): BotCast | null {
  if (!t.stack || t.stack.entries.length === 0) return null;
  const pr = personalityOf(p, t.config.botSkill);
  const top = t.stack.entries[t.stack.entries.length - 1];
  if (top.casterId === p.id) return null;

  const incoming = SIGIL_BY_ID[top.sigilId];
  if (!incoming) return null;

  const aimedAtMe = top.targets.playerId === p.id
    || (top.targets.cardIds ?? []).some((id) => p.hole.includes(id));

  const options = p.sigils
    .map((s) => ({ s, def: SIGIL_BY_ID[s.defId] }))
    .filter(({ s, def }) => def?.timing.includes('response') && canCast(t, p, s).ok);
  if (options.length === 0) return null;

  const threat = incoming.rarity === 'mythic' ? 1 : incoming.rarity === 'rare' ? 0.8 : 0.55;
  const want = (aimedAtMe ? 1.1 : 0.55) * threat * (0.7 + pr.arcane);
  if (!rng.chance(Math.min(0.9, want))) return null;

  const { s, def } = rng.pick(options);
  const targets = def.id === 'redirect' || def.id === 'reflect'
    ? targetsFor(t, p, incoming, rng) ?? {}
    : {};
  return { uid: s.uid, targets };
}

/** Bots shop greedily but not stupidly: relics first, then sigils they can hold. */
export function decideShop(t: Table, p: Player, rng: Rng): string | null {
  const shop = t.shop.get(p.id);
  if (!shop) return null;
  const affordable = shop.items.filter((i) => !shop.sold.includes(i.uid) && i.price <= p.shards);
  if (affordable.length === 0) return null;

  const order = ['relic', 'mana', 'sigil', 'rite'];
  affordable.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.price - a.price);
  const pick = affordable[0];
  if (pick.kind === 'rite' && !rng.chance(0.3)) return null;
  return pick.uid;
}

/**
 * Long enough to read as deliberation, short enough that a six-handed table
 * does not take a minute a hand. Responses on the stack are quicker, because
 * everyone is already staring at the spell.
 *
 * `actors` is how many players are still live in the betting round, and it
 * matters more than it looks: this cost is paid once per player per street,
 * so a pause that reads as thoughtful heads-up reads as six players stalling
 * at a full table. Past three, each additional player shortens everyone's
 * pause, down to a floor — the round keeps roughly the same length instead of
 * growing linearly with the seat count.
 */
export function thinkTime(
  rng: Rng,
  opts: { fast?: boolean; actors?: number; speed?: TableSpeed } = {},
): number {
  const tempo = TEMPO[opts.speed ?? 'standard'] ?? TEMPO.standard;
  // `config.pacePercent` is the global pacing dial; `tempo.think` is the
  // per-table speed setting; the crowd factor keeps a six-handed round from
  // taking three times as long as a heads-up one. They multiply.
  const pace = config.pacePercent / 100;
  if (opts.fast) return Math.round((140 + rng.int(200)) * tempo.think * pace);
  const base = 300 + rng.int(620);
  const actors = opts.actors ?? 2;
  const crowd = actors > 3 ? Math.max(0.62, 1 - (actors - 3) * 0.12) : 1;
  return Math.round(base * crowd * tempo.think * pace);
}
