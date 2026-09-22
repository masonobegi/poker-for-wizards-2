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
import type { BetAction, Player, SigilTargets, Table } from '../../shared/types';
import { canCast, cardsOf, live, manaCost, modsFor, scoringHole, totalPot } from './table';

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

const personalities = new Map<string, Personality>();

function personalityOf(p: Player): Personality {
  let pr = personalities.get(p.id);
  if (!pr) {
    const r = new Rng(`pers:${p.id}`);
    pr = {
      tight: 0.3 + r.next() * 0.45,
      aggro: 0.25 + r.next() * 0.55,
      bluff: 0.06 + r.next() * 0.2,
      arcane: 0.55 + r.next() * 0.4,
    };
    personalities.set(p.id, pr);
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
  const sims = exotic ? 16 : Math.max(24, Math.round(base / crowd));

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

  return (wins + ties * 0.5) / sims;
}

// ---------------------------------------------------------------------------
// Betting
// ---------------------------------------------------------------------------

export function decideAction(t: Table, p: Player, rng: Rng): BetAction {
  const pr = personalityOf(p);
  const toCall = Math.max(0, t.currentBet - p.bet);
  const pot = Math.max(t.bb, totalPot(t));
  const eq = equity(t, p, rng);

  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const stackBB = p.chips / t.bb;
  const desperate = stackBB < 8;

  // Short stacks must gamble or blind away.
  if (desperate && eq > 0.42 && toCall > 0) return { kind: 'allin' };

  const sizing = (frac: number): number => {
    const raw = Math.round((pot * frac) / t.bb) * t.bb;
    return Math.max(t.bb, Math.min(p.chips, Math.max(raw, t.currentBet + t.minRaise)));
  };

  if (toCall === 0) {
    const wantsValue = eq > 0.62 + pr.tight * 0.1;
    const wantsBluff = eq < 0.34 && rng.chance(pr.bluff);
    if (wantsValue || wantsBluff) {
      const frac = wantsValue ? 0.45 + pr.aggro * 0.4 : 0.4 + rng.next() * 0.2;
      const amount = sizing(frac);
      if (amount >= p.chips) return { kind: 'allin' };
      return { kind: 'bet', amount };
    }
    return { kind: 'check' };
  }

  const edge = eq - potOdds;

  if (edge > 0.18 && rng.chance(0.35 + pr.aggro * 0.45)) {
    const amount = sizing(0.6 + pr.aggro * 0.5);
    if (amount >= p.chips || eq > 0.86) return { kind: 'allin' };
    if (amount > t.currentBet) return { kind: 'raise', amount };
  }

  if (edge > -0.02) {
    if (toCall >= p.chips) return eq > 0.5 ? { kind: 'allin' } : { kind: 'fold' };
    return { kind: 'call' };
  }

  // A cheap call against a big pot is worth the float.
  if (toCall <= t.bb && eq > 0.22 && rng.chance(0.6)) return { kind: 'call' };
  // Occasional resteal so they are not pure calling stations.
  if (eq < 0.25 && rng.chance(pr.bluff * 0.5) && p.chips > toCall * 4) {
    return { kind: 'raise', amount: sizing(0.7) };
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
  const pr = personalityOf(p);

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
    // Mana at the cap is mana being thrown away every street.
    if (p.mana >= p.maxMana - 1) want *= 1.5;

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
  const pr = personalityOf(p);
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
export function thinkTime(rng: Rng, opts: { fast?: boolean; actors?: number } = {}): number {
  if (opts.fast) return 120 + rng.int(170);
  const base = 260 + rng.int(500);
  const actors = opts.actors ?? 2;
  const crowd = actors > 3 ? Math.max(0.62, 1 - (actors - 3) * 0.12) : 1;
  return Math.round(base * crowd);
}
