/**
 * The sigil stack, and every effect that hangs off it.
 *
 * Casting puts an entry on a last-in-first-out stack and opens a short response
 * window. Anyone holding a response sigil and the mana to pay for it may answer;
 * their answer goes on top and opens another window. When nobody has anything
 * left to say, the stack unwinds from the top down — so the last word resolves
 * first, and a Nullify cast after your sigil resolves before it and eats it.
 *
 * Effects are deliberately written as one flat switch rather than a registry of
 * closures: there are thirty-odd of them, they all touch the same table, and a
 * single readable block beats indirection you have to chase.
 */
import { nanoid } from 'nanoid';
import {
  type CardEntity, type Face, type MarkId, type Rank, type Suit,
  RANK_LABEL, RANK_NAME, SUITS, collapse, faceLabel, isQuantum, makeCard, nextCardId,
} from '../../shared/cards';
import type { FxEvent } from '../../shared/protocol';
import { Rng } from '../../shared/rng';
import { SIGIL_BY_ID, SCHOOLS, type SigilDef, type SigilInstance } from '../../shared/sigils';
import type {
  Player, SigilTargets, StackEntry, Table,
} from '../../shared/types';
import {
  alive, byId, canCast, card, describeCard, live, log, manaCost, sigilHandSize,
} from './table';

export interface MagicCtx {
  t: Table;
  rng: Rng;
  fx: FxEvent[];
}

// ---------------------------------------------------------------------------
// Deck plumbing shared with the dealer
// ---------------------------------------------------------------------------

/**
 * A card set in amber is out of reach of everything - burning, collapsing,
 * replacing, rewriting. Checked at every site that changes a card rather than
 * trusted to callers, because the one that forgets is the one that matters.
 */
export const canAlter = (c: CardEntity | undefined): c is CardEntity => !!c && !c.amber;

/** Seal a card if its rank is currently under a Sealed Rank effect. */
export function applySeal(t: Table, id: string): void {
  const c = card(t, id);
  if (!c || t.sealedRanks.length === 0) return;
  const f = c.collapsed !== null ? c.faces[c.collapsed] : null;
  if (f && t.sealedRanks.includes(f.rank)) c.veil = 'sealed';
}

export function drawId(ctx: MagicCtx): string | null {
  const { t } = ctx;
  if (t.deck.length === 0) reshuffleDiscard(ctx);
  const id = t.deck.shift() ?? null;
  if (id) {
    const c = card(t, id);
    if (c) { c.origin = 'deck'; applySeal(t, id); }
  }
  return id;
}

export function reshuffleDiscard(ctx: MagicCtx): void {
  const { t, rng } = ctx;
  if (t.discard.length === 0) return;
  t.deck.push(...rng.shuffle(t.discard));
  t.discard = [];
  log(t, 'The discards fold back into the deck.', 'magic');
}

export function returnToDeck(ctx: MagicCtx, id: string): void {
  const { t, rng } = ctx;
  const c = card(t, id);
  if (c) { c.divergent = undefined; c.veil = 'open'; }
  const pos = rng.int(Math.max(1, t.deck.length));
  t.deck.splice(pos, 0, id);
}

/** A concrete face that is not currently sitting in play — keeps alternates surprising. */
export function unseenFace(ctx: MagicCtx): Face {
  const { t, rng } = ctx;
  const inPlay = new Set<string>();
  const scan = (ids: string[]) => {
    for (const id of ids) {
      const c = card(t, id);
      if (!c) continue;
      for (const f of c.faces) inPlay.add(`${f.rank}${f.suit}`);
    }
  };
  scan(t.board);
  for (const p of t.players) scan(p.hole);

  const pool: Face[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      if (!inPlay.has(`${rank}${suit}`)) pool.push({ rank, suit });
    }
  }
  return pool.length ? rng.pick(pool) : { rank: rng.range(2, 14), suit: rng.pick(SUITS) };
}

/** Put a card into superposition by bolting an extra possible identity onto it. */
export function superposeCard(ctx: MagicCtx, c: CardEntity, extra?: Face): void {
  const add = extra ?? unseenFace(ctx);
  if (c.collapsed !== null) {
    const current = c.faces[c.collapsed];
    c.faces = [current, add];
  } else {
    c.faces = [...c.faces, add];
  }
  c.collapsed = null;
  ctx.fx.push({ t: 'superpose', cardId: c.id });
}

/** Whatever happens to one bound card happens to the other. */
export function propagateEntanglement(ctx: MagicCtx, id: string): void {
  const { t } = ctx;
  const a = card(t, id);
  if (!a?.entangledWith) return;
  const b = card(t, a.entangledWith);
  if (!b) return;
  b.faces = a.faces.map((f) => ({ ...f }));
  b.collapsed = a.collapsed;
  b.veil = a.veil;
  ctx.fx.push({ t: 'entangle', cardIds: [a.id, b.id] });
}

// ---------------------------------------------------------------------------
// Sigil supply
// ---------------------------------------------------------------------------

const DRAFT_POOL = Object.values(SIGIL_BY_ID);

export function randomSigil(rng: Rng, weights = true): SigilInstance {
  const bag: SigilDef[] = [];
  for (const d of DRAFT_POOL) {
    const n = weights ? ({ common: 6, rare: 3, mythic: 1 } as const)[d.rarity] : 1;
    for (let i = 0; i < n; i++) bag.push(d);
  }
  return { uid: nanoid(8), defId: rng.pick(bag).id };
}

export function giveSigil(t: Table, p: Player, inst: SigilInstance): boolean {
  if (p.sigils.length >= sigilHandSize(p)) return false;
  p.sigils.push(inst);
  return true;
}

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

export interface CastResult { ok: boolean; error?: string }

/** Everyone who could plausibly answer the thing currently on the stack. */
function respondersFor(t: Table, excludeId: string): string[] {
  return alive(t)
    .filter((p) => p.id !== excludeId && !p.folded)
    .filter((p) => p.sigils.some((s) => {
      const def = SIGIL_BY_ID[s.defId];
      return def?.timing.includes('response') && p.mana >= manaCost(p, def, t);
    }))
    .map((p) => p.id);
}

export function castSigil(
  ctx: MagicCtx, p: Player, uid: string, targets: SigilTargets,
): CastResult {
  const { t } = ctx;
  const inst = p.sigils.find((s) => s.uid === uid);
  if (!inst) return { ok: false, error: 'You do not hold that sigil' };

  const check = canCast(t, p, inst);
  if (!check.ok) return { ok: false, error: check.reason };

  const def = SIGIL_BY_ID[inst.defId];
  const targetError = validateTargets(t, p, def, targets);
  if (targetError) return { ok: false, error: targetError };

  const cost = manaCost(p, def, t);
  p.mana -= cost;
  p.sigils = p.sigils.filter((s) => s.uid !== uid);

  const entry: StackEntry = {
    id: nanoid(8),
    casterId: p.id,
    sigilId: def.id,
    targets,
    countered: false,
    costPaid: cost,
  };

  if (!t.stack) t.stack = { entries: [], pending: [], closesAt: 0 };
  t.stack.entries.push(entry);

  ctx.fx.push({
    t: 'cast', sigilId: def.id, casterId: p.id, school: def.school,
    targetIds: targets.cardIds,
  });
  ctx.fx.push({ t: 'sfx', name: `cast_${def.school}` });
  log(t, `${p.name} casts ${def.name}.`, 'magic', { school: def.school, playerId: p.id });

  const pending = def.unstoppable ? [] : respondersFor(t, p.id);
  t.stack.pending = pending;
  t.stack.closesAt = pending.length ? Date.now() + t.config.responseSeconds * 1000 : 0;

  return { ok: true };
}

function validateTargets(t: Table, p: Player, def: SigilDef, tg: SigilTargets): string | null {
  const visible = (id: string): boolean => {
    if (t.board.includes(id)) return true;
    return t.players.some((q) => q.hole.includes(id));
  };
  const wardedHolder = (id: string): boolean =>
    t.players.some((q) => q.warded && q.id !== p.id && q.hole.includes(id));

  switch (def.target) {
    case 'none':
    case 'stack':
      return null;
    case 'player': {
      const q = byId(t, tg.playerId);
      if (!q || q.id === p.id) return 'Choose an opponent';
      if (q.folded || q.eliminated) return 'That player is out of the hand';
      if (q.warded) return 'Their cards are warded this hand';
      return null;
    }
    case 'rank':
      return tg.rank && tg.rank >= 2 && tg.rank <= 14 ? null : 'Choose a rank';
    case 'suit':
      return tg.suit ? null : 'Choose a suit';
    case 'own_card': {
      const id = tg.cardIds?.[0];
      if (!id || !p.hole.includes(id)) return 'Choose one of your own cards';
      return null;
    }
    case 'board_card': {
      const id = tg.cardIds?.[0];
      if (!id || !t.board.includes(id)) return 'Choose a community card';
      return null;
    }
    case 'any_card': {
      const id = tg.cardIds?.[0];
      if (!id || !visible(id)) return 'Choose a card in play';
      if (wardedHolder(id)) return 'That card is warded';
      return null;
    }
    case 'two_cards': {
      const ids = tg.cardIds ?? [];
      if (ids.length < 2) return 'Choose two cards';
      if (ids[0] === ids[1]) return 'Choose two different cards';
      if (!ids.every(visible)) return 'Both cards must be in play';
      if (ids.some(wardedHolder)) return 'One of those cards is warded';
      return null;
    }
    default:
      return null;
  }
}

export function passResponse(t: Table, playerId: string): void {
  if (!t.stack) return;
  t.stack.pending = t.stack.pending.filter((id) => id !== playerId);
}

export const stackReady = (t: Table): boolean =>
  !!t.stack && (t.stack.pending.length === 0 || Date.now() >= t.stack.closesAt);

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Unwind the whole stack, top entry first. */
export function resolveStack(ctx: MagicCtx): void {
  const { t } = ctx;
  if (!t.stack) return;
  const entries = t.stack.entries;
  t.stack = null;

  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const def = SIGIL_BY_ID[e.sigilId];
    if (e.countered) {
      ctx.fx.push({ t: 'fizzle', sigilId: e.sigilId });
      log(t, `${def?.name ?? 'A sigil'} is undone before it lands.`, 'warn');
      continue;
    }
    applyEffect(ctx, e, entries, i);
  }

  // Bound cards catch up with whatever just happened to their partners.
  for (const id of [...t.board, ...t.players.flatMap((p) => p.hole)]) {
    propagateEntanglement(ctx, id);
  }
}

function applyEffect(ctx: MagicCtx, e: StackEntry, stack: StackEntry[], index: number): void {
  const { t, rng } = ctx;
  const caster = byId(t, e.casterId);
  const def = SIGIL_BY_ID[e.sigilId];
  if (!caster || !def) return;

  const tg = e.targets;
  const targetPlayer = byId(t, tg.playerId);
  const firstCard = tg.cardIds?.[0] ? card(t, tg.cardIds[0]) : undefined;
  const secondCard = tg.cardIds?.[1] ? card(t, tg.cardIds[1]) : undefined;
  const note = (s: string, tone: 'magic' | 'impossible' | 'warn' = 'magic') =>
    log(t, s, tone, { school: def.school, playerId: caster.id });

  /** The entry this response is answering. */
  const below = (): StackEntry | undefined => stack[index - 1];

  switch (def.id) {
    // ------------------------------------------------------------- ENTROPY
    case 'superpose': {
      if (!canAlter(firstCard)) { note('That card is set in amber.', 'warn'); break; }
      superposeCard(ctx, firstCard);
      note(`${caster.name} splits a card into two possibilities.`);
      break;
    }
    case 'collapse': {
      if (!canAlter(firstCard)) { note('That card is set in amber.', 'warn'); break; }
      if (!isQuantum(firstCard)) { note('The card was already decided.', 'warn'); break; }
      const f = collapse(firstCard, rng);
      ctx.fx.push({ t: 'collapse', cardId: firstCard.id, face: f });
      ctx.fx.push({ t: 'sfx', name: 'collapse' });
      note(`The possibility collapses into ${faceLabel(f)}.`, 'impossible');
      break;
    }
    case 'schrodinger': {
      t.quantumFlop = true;
      note('The flop is promised, but not decided.');
      break;
    }
    case 'decohere': {
      let n = 0;
      for (const id of t.board) {
        const c = card(t, id);
        if (!c || !isQuantum(c)) continue;
        // Kindest face for the caster, cruellest for the table.
        const sorted = [...c.faces].sort((a, b) => b.rank - a.rank);
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        c.divergent = { ...(c.divergent ?? {}), [caster.id]: best };
        const idx = c.faces.findIndex((f) => f.rank === worst.rank && f.suit === worst.suit);
        collapse(c, rng, idx >= 0 ? idx : 0);
        ctx.fx.push({ t: 'collapse', cardId: id, face: worst });
        ctx.fx.push({ t: 'diverge', cardId: id });
        n++;
      }
      note(n ? `${caster.name} decoheres the board in their own favour.` : 'Nothing was undecided.', n ? 'impossible' : 'warn');
      break;
    }
    case 'probability_storm': {
      for (const id of t.board) {
        const c = card(t, id);
        if (c) superposeCard(ctx, c);
      }
      ctx.fx.push({ t: 'shake', power: 0.8 });
      note('The board dissolves into probability.', 'impossible');
      break;
    }

    // ---------------------------------------------------------------- VEIL
    case 'sealed_rank': {
      const r = tg.rank ?? 13;
      if (!t.sealedRanks.includes(r)) t.sealedRanks.push(r);
      t.modNotes.push(`${RANK_NAME[r]}s are sealed`);
      let sealed = 0;
      for (const id of [...t.board, ...t.players.flatMap((p) => p.hole)]) {
        const c = card(t, id);
        if (!c) continue;
        const f = c.collapsed !== null ? c.faces[c.collapsed] : null;
        if (f && f.rank === r) { c.veil = 'sealed'; sealed++; }
      }
      ctx.fx.push({ t: 'seal', rank: r });
      ctx.fx.push({ t: 'sfx', name: 'seal' });
      note(`Every ${RANK_NAME[r]} is sealed face down${sealed ? ` — ${sealed} already in play` : ''}.`, 'impossible');
      break;
    }
    case 'divergence': {
      if (!firstCard) break;
      const table = firstCard.collapsed !== null ? firstCard.faces[firstCard.collapsed] : firstCard.faces[0];
      const mine: Face = { rank: tg.rank ?? unseenFace(ctx).rank, suit: tg.suit ?? table.suit };
      firstCard.divergent = { ...(firstCard.divergent ?? {}), [caster.id]: mine };
      caster.foreknowledge.divergedFrom[firstCard.id] = mine;
      ctx.fx.push({ t: 'diverge', cardId: firstCard.id });
      ctx.fx.push({ t: 'sfx', name: 'diverge' });
      note(`${caster.name} sees ${faceLabel(mine)} where the table sees ${faceLabel(table)}.`, 'impossible');
      break;
    }
    case 'second_sight': {
      const peek = t.deck.slice(0, 3);
      caster.foreknowledge.deckPeek = [...new Set([...caster.foreknowledge.deckPeek, ...peek])];
      note(`${caster.name} reads three cards ahead.`);
      break;
    }
    case 'gloaming': {
      caster.warded = true;
      note(`${caster.name}'s cards slip out of reach.`);
      break;
    }
    case 'false_face': {
      if (!targetPlayer) break;
      const id = rng.pick(targetPlayer.hole.filter((h) => card(t, h)?.veil !== 'sealed') ?? []);
      if (!id) { note('There was nothing to look at.', 'warn'); break; }
      caster.foreknowledge.seenHole.push(id);
      targetPlayer.foreknowledge.lies[id] = unseenFace(ctx);
      note(`${caster.name} shows ${targetPlayer.name} a card that is not there.`, 'impossible');
      break;
    }
    case 'veiled_wager': {
      caster.betVeiled = true;
      note(`${caster.name}'s next bet will be unreadable.`);
      break;
    }

    // ------------------------------------------------------------- CHRONOS
    case 'rewind': {
      const id = t.board[t.board.length - 1];
      if (!id) { note('There is nothing to take back.', 'warn'); break; }
      if (!canAlter(card(t, id))) { note('The river is set in amber.', 'warn'); break; }
      t.board.pop();
      t.discard.push(id);
      const fresh = drawId(ctx);
      if (fresh) t.board.push(fresh);
      ctx.fx.push({ t: 'rewind', cardId: fresh ?? undefined });
      ctx.fx.push({ t: 'sfx', name: 'rewind' });
      note(`${caster.name} unmakes ${describeCard(t, id)} and the river runs again.`, 'impossible');
      break;
    }
    case 'echo_hand': {
      const alt = t.board.slice(0, -1);
      const fresh = drawId(ctx);
      if (fresh) alt.push(fresh);
      t.echoTimeline = { boardIds: alt, label: `${caster.name}'s echo`, ownerId: caster.id };
      ctx.fx.push({ t: 'rewind' });
      note(`A second river runs alongside the first. ${caster.name} stands in both.`, 'impossible');
      break;
    }
    case 'foresight': {
      const idx = Math.max(0, 5 - t.board.length - 1);
      const id = t.deck[idx];
      if (id) {
        caster.foreknowledge.deckPeek = [...new Set([...caster.foreknowledge.deckPeek, id])];
        note(`${caster.name} reads the river before the flop.`, 'impossible');
      }
      break;
    }
    case 'stutter': {
      const count = t.phase === 'flop' ? 3 : 1;
      const taken = t.board.splice(t.board.length - count, count);
      t.discard.push(...taken);
      for (let i = 0; i < count; i++) {
        const id = drawId(ctx);
        if (id) t.board.push(id);
      }
      // Bets from the aborted street come back.
      for (const p of t.players) {
        if (p.bet > 0) { p.chips += p.bet; p.committed -= p.bet; p.bet = 0; }
      }
      t.currentBet = 0;
      t.actedThisStreet.clear();
      ctx.fx.push({ t: 'rewind' });
      note(`${caster.name} makes the street happen again. Bets are returned.`, 'impossible');
      break;
    }
    case 'long_memory': {
      t.mods.memoryBonus = true;
      t.modNotes.push('Cards remember their wins');
      note('Every card at the table recalls the pots it has taken.', 'impossible');
      break;
    }

    // ---------------------------------------------------------------- BIND
    case 'entangle': {
      if (!firstCard || !secondCard) break;
      firstCard.entangledWith = secondCard.id;
      secondCard.entangledWith = firstCard.id;
      if (!firstCard.marks.includes('bound')) firstCard.marks.push('bound');
      if (!secondCard.marks.includes('bound')) secondCard.marks.push('bound');
      t.tempMarks.push({ cardId: firstCard.id, markId: 'bound' }, { cardId: secondCard.id, markId: 'bound' });
      ctx.fx.push({ t: 'entangle', cardIds: [firstCard.id, secondCard.id] });
      ctx.fx.push({ t: 'sfx', name: 'entangle' });
      note(`${caster.name} binds two cards to one fate.`, 'impossible');
      break;
    }
    case 'mirror': {
      const src = firstCard ?? card(t, t.board[0]);
      const dst = secondCard ?? card(t, t.board[t.board.length - 1]);
      if (!src || !dst || src.id === dst.id) { note('Nothing to mirror.', 'warn'); break; }
      if (!canAlter(dst)) { note('That card is set in amber.', 'warn'); break; }
      dst.faces = src.faces.map((f) => ({ ...f }));
      dst.collapsed = src.collapsed;
      dst.veil = src.veil;
      if (!dst.marks.includes('mirrored')) dst.marks.push('mirrored');
      t.tempMarks.push({ cardId: dst.id, markId: 'mirrored' });
      ctx.fx.push({ t: 'entangle', cardIds: [src.id, dst.id] });
      note(`The board now holds two of ${describeCard(t, src.id)}.`, 'impossible');
      break;
    }
    case 'twin': {
      if (!firstCard) break;
      const copy = makeCard(2, 'S');
      copy.faces = firstCard.faces.map((f) => ({ ...f }));
      copy.collapsed = firstCard.collapsed;
      copy.origin = 'conjured';
      t.cards.set(copy.id, copy);
      t.board.push(copy.id);
      ctx.fx.push({ t: 'deal', cardIds: [copy.id], to: 'board' });
      note(`${caster.name} copies a card out of their hand and onto the board.`, 'impossible');
      break;
    }
    case 'chain': {
      const order = live(t);
      if (order.length < 2) { note('Nobody to pass to.', 'warn'); break; }
      const passed = order.map((p) => p.hole[0]);
      order.forEach((p, i) => {
        const incoming = passed[(i - 1 + order.length) % order.length];
        p.hole = [incoming, ...p.hole.slice(1)];
      });
      ctx.fx.push({ t: 'shake', power: 0.3 });
      note('Every hand passes a card left, all at once.', 'impossible');
      break;
    }
    case 'sympathy': {
      if (!targetPlayer) break;
      caster.sharedWith = targetPlayer.id;
      targetPlayer.sharedWith = caster.id;
      note(`${caster.name} and ${targetPlayer.name} now hold the same four cards.`, 'impossible');
      break;
    }

    // ---------------------------------------------------------------- RUIN
    case 'burn': {
      if (!canAlter(firstCard)) { note('That card is set in amber.', 'warn'); break; }
      const slot = t.board.indexOf(firstCard.id);
      if (slot < 0) { note('That card is not on the board.', 'warn'); break; }
      t.board.splice(slot, 1);
      t.burnedSlots.push(slot);
      t.discard.push(firstCard.id);
      ctx.fx.push({ t: 'burn', cardId: firstCard.id });
      ctx.fx.push({ t: 'sfx', name: 'card_burn' });
      note(`${caster.name} burns ${describeCard(t, firstCard.id)} out of the board.`, 'impossible');
      break;
    }
    case 'unmake': {
      const r = tg.rank ?? 14;
      t.mods.deadRanks = [...new Set([...(t.mods.deadRanks ?? []), r])];
      t.modNotes.push(`${RANK_NAME[r]}s are unmade`);
      ctx.fx.push({ t: 'flash', color: SCHOOLS.ruin.accent, power: 0.5 });
      note(`${RANK_NAME[r]}s are struck from every hand.`, 'impossible');
      break;
    }
    case 'larceny': {
      if (!targetPlayer || targetPlayer.sigils.length === 0) { note('Their hand was empty.', 'warn'); break; }
      const idx = rng.int(targetPlayer.sigils.length);
      const [stolen] = targetPlayer.sigils.splice(idx, 1);
      if (giveSigil(t, caster, stolen)) {
        note(`${caster.name} lifts a sigil from ${targetPlayer.name}.`);
      } else {
        targetPlayer.sigils.splice(idx, 0, stolen);
        note(`${caster.name} has no room to hold it.`, 'warn');
      }
      break;
    }
    case 'sever': {
      if (!targetPlayer) break;
      const lost = targetPlayer.mana;
      targetPlayer.mana = 0;
      targetPlayer.severed = true;
      note(`${caster.name} severs ${targetPlayer.name} — ${lost} mana gone, none returning this hand.`);
      break;
    }
    case 'hex': {
      if (!targetPlayer) break;
      targetPlayer.hexed += 1;
      ctx.fx.push({ t: 'flash', color: SCHOOLS.ruin.accent, power: 0.4 });
      note(`${targetPlayer.name} is hexed — their hand will score a category lower.`, 'impossible');
      break;
    }
    case 'conflagration': {
      for (const p of live(t)) {
        const gone = p.hole.shift();
        if (gone) t.discard.push(gone);
        const fresh = drawId(ctx);
        if (fresh) p.hole.push(fresh);
      }
      ctx.fx.push({ t: 'shake', power: 0.9 });
      ctx.fx.push({ t: 'flash', color: SCHOOLS.ruin.accent, power: 0.7 });
      note('Every hand burns a card and draws another.', 'impossible');
      break;
    }

    // --------------------------------------------------------------- WEAVE
    case 'inscribe': {
      if (!firstCard) break;
      const mark: MarkId = tg.markId ?? 'blooded';
      if (!firstCard.marks.includes(mark)) firstCard.marks.push(mark);
      ctx.fx.push({ t: 'inscribe', cardId: firstCard.id, markId: mark });
      ctx.fx.push({ t: 'sfx', name: 'inscribe' });
      note(`${caster.name} inscribes this card permanently. It will carry the mark into every hand after.`, 'impossible');
      break;
    }
    case 'wild_rite': {
      if (!firstCard) break;
      if (!firstCard.marks.includes('wild')) firstCard.marks.push('wild');
      t.tempMarks.push({ cardId: firstCard.id, markId: 'wild' });
      ctx.fx.push({ t: 'inscribe', cardId: firstCard.id, markId: 'wild' });
      note(`${caster.name} makes a card mean anything at all.`, 'impossible');
      break;
    }
    case 'conjure': {
      const f = unseenFace(ctx);
      const c: CardEntity = {
        id: nextCardId(), faces: [f], collapsed: 0, marks: [], veil: 'open',
        memory: 0, origin: 'conjured',
      };
      t.cards.set(c.id, c);
      caster.hole.push(c.id);
      applySeal(t, c.id);
      ctx.fx.push({ t: 'deal', cardIds: [c.id], to: caster.id });
      note(`${caster.name} conjures a card the deck never held.`, 'impossible');
      break;
    }
    case 'sixth_card': {
      const id = drawId(ctx);
      if (!id) break;
      t.board.push(id);
      ctx.fx.push({ t: 'deal', cardIds: [id], to: 'board' });
      note(`A sixth community card arrives: ${describeCard(t, id)}.`);
      break;
    }
    case 'reweave': {
      const n = t.board.length;
      for (const id of t.board) returnToDeck(ctx, id);
      t.board = [];
      for (let i = 0; i < n; i++) {
        const id = drawId(ctx);
        if (id) t.board.push(id);
      }
      ctx.fx.push({ t: 'deal', cardIds: t.board, to: 'board', stagger: 90 });
      ctx.fx.push({ t: 'sfx', name: 'card_shuffle' });
      note(`${caster.name} unweaves the board and deals it again.`, 'impossible');
      break;
    }


    // ------------------------------------------------------ second wave
    case 'fracture': {
      if (!canAlter(firstCard)) { note('That card is set in amber.', 'warn'); break; }
      const base = firstCard.collapsed !== null
        ? firstCard.faces[firstCard.collapsed]
        : firstCard.faces[0];
      firstCard.faces = [base, unseenFace(ctx), unseenFace(ctx)];
      firstCard.collapsed = null;
      ctx.fx.push({ t: 'superpose', cardId: firstCard.id });
      note(caster.name + ' fractures a card into three possibilities.', 'impossible');
      break;
    }

    case 'cascade': {
      let settled = 0;
      for (const id of [...t.board, ...live(t).flatMap((p) => p.hole)]) {
        const c = card(t, id);
        if (!c || !isQuantum(c) || c.amber) continue;
        let best = 0;
        for (let i = 1; i < c.faces.length; i++) if (c.faces[i].rank > c.faces[best].rank) best = i;
        const f = collapse(c, rng, best);
        ctx.fx.push({ t: 'collapse', cardId: id, face: f });
        settled++;
      }
      ctx.fx.push({ t: 'sfx', name: 'collapse' });
      note(
        settled
          ? 'Everything undecided settles at once - ' + settled + ' card' + (settled === 1 ? '' : 's') + '.'
          : 'Nothing was undecided.',
        settled ? 'impossible' : 'warn',
      );
      break;
    }

    case 'blind_spot': {
      if (!targetPlayer) break;
      targetPlayer.blinded = true;
      ctx.fx.push({ t: 'flash', color: SCHOOLS.veil.accent, power: 0.35 });
      note(targetPlayer.name + ' can no longer see the board. They still play it.', 'impossible');
      break;
    }

    case 'the_ledger_sigil': {
      if (!targetPlayer) break;
      if (!caster.foreknowledge.seenSigils.includes(targetPlayer.id)) {
        caster.foreknowledge.seenSigils.push(targetPlayer.id);
      }
      note(caster.name + ' reads every sigil ' + targetPlayer.name + ' is holding.');
      break;
    }

    case 'amber': {
      if (!firstCard) break;
      firstCard.amber = true;
      ctx.fx.push({ t: 'inscribe', cardId: firstCard.id, markId: 'bound' });
      note(caster.name + ' sets a card in amber. Nothing reaches it now.', 'impossible');
      break;
    }

    case 'tessellate': {
      const a = card(t, caster.hole[0]);
      const b = card(t, caster.hole[1]);
      if (!canAlter(a) || !canAlter(b)) { note('Those cards cannot be rewritten.', 'warn'); break; }
      const fa = a.collapsed !== null ? a.faces[a.collapsed] : a.faces[0];
      const fb = b.collapsed !== null ? b.faces[b.collapsed] : b.faces[0];
      a.faces = [{ rank: fb.rank, suit: fa.suit }];
      a.collapsed = 0;
      b.faces = [{ rank: fa.rank, suit: fb.suit }];
      b.collapsed = 0;
      note(caster.name + ' makes two cards trade ranks and keep their suits.', 'impossible');
      break;
    }

    case 'doppelganger': {
      if (!targetPlayer || targetPlayer.hole.length === 0) { note('Nothing to copy.', 'warn'); break; }
      const source = card(t, rng.pick(targetPlayer.hole));
      if (!source) break;
      const copy: CardEntity = {
        id: nextCardId(),
        faces: source.faces.map((f) => ({ ...f })),
        collapsed: source.collapsed,
        marks: [...source.marks],
        veil: source.veil,
        memory: source.memory,
        origin: 'conjured',
      };
      t.cards.set(copy.id, copy);
      caster.hole.push(copy.id);
      ctx.fx.push({ t: 'deal', cardIds: [copy.id], to: caster.id });
      note(caster.name + ' copies a card out of another hand. Its owner keeps theirs.', 'impossible');
      break;
    }

    case 'tithe': {
      let mana = 0;
      let chips = 0;
      for (const p of live(t)) {
        if (p.id === caster.id) continue;
        if (p.mana > 0) { p.mana -= 1; mana += 1; }
        else {
          const paid = Math.min(t.bb, p.chips);
          p.chips -= paid;
          caster.chips += paid;
          chips += paid;
        }
      }
      caster.mana = Math.min(caster.maxMana, caster.mana + mana);
      note(caster.name + ' levies a tithe - ' + mana + ' mana'
        + (chips ? ' and ' + chips.toLocaleString() + ' chips' : '') + '.');
      break;
    }

    case 'transmute': {
      if (!canAlter(firstCard)) { note('That card is set in amber.', 'warn'); break; }
      const suit = tg.suit ?? rng.pick(SUITS);
      firstCard.faces = firstCard.faces.map((f) => ({ rank: f.rank, suit }));
      ctx.fx.push({ t: 'inscribe', cardId: firstCard.id, markId: 'prism' });
      note(caster.name + ' transmutes a card. It keeps that suit for good.', 'impossible');
      break;
    }

    // ------------------------------------------------- THE SECOND PRINTING
    case 'quantum_leap': {
      if (!canAlter(firstCard)) { note('That card is set in amber.', 'warn'); break; }
      const slot = caster.hole.indexOf(firstCard.id);
      if (slot < 0) { note('That is not your card.', 'warn'); break; }
      const incoming = drawId(ctx);
      if (!incoming) { note('The deck has nothing left to trade.', 'warn'); break; }
      caster.hole[slot] = incoming;
      returnToDeck(ctx, firstCard.id);
      applySeal(t, incoming);
      ctx.fx.push({ t: 'deal', cardIds: [incoming], to: caster.id });
      note(`${caster.name} trades a card back to the deck without looking at what returns.`, 'impossible');
      break;
    }

    case 'observer_effect': {
      let settled = 0;
      const ids = [...t.board, ...alive(t).flatMap((q) => q.hole)];
      for (const id of ids) {
        const c = card(t, id);
        if (!c || !isQuantum(c) || !canAlter(c)) continue;
        // Kindest face, by rank — the mirror of Decohere, which takes the
        // cruellest and hands the caster the good one privately.
        const best = [...c.faces].sort((a, b) => b.rank - a.rank)[0];
        const idx = c.faces.findIndex((f) => f.rank === best.rank && f.suit === best.suit);
        collapse(c, rng, idx >= 0 ? idx : 0);
        ctx.fx.push({ t: 'collapse', cardId: id, face: best });
        settled++;
      }
      note(
        settled ? 'Everything undecided settles, and every one of them lands well.' : 'Nothing was undecided.',
        settled ? 'impossible' : 'warn',
      );
      break;
    }

    case 'cold_read': {
      if (!targetPlayer) break;
      let seen = 0;
      for (const id of targetPlayer.hole) {
        if (card(t, id)?.veil === 'sealed') continue;
        if (caster.foreknowledge.seenHole.includes(id)) continue;
        caster.foreknowledge.seenHole.push(id);
        seen++;
      }
      note(
        seen ? `${caster.name} reads ${targetPlayer.name} cold.` : 'Their cards are sealed away.',
        seen ? 'impossible' : 'warn',
      );
      break;
    }

    case 'palimpsest': {
      if (!canAlter(firstCard)) { note('That card is set in amber.', 'warn'); break; }
      const slot = t.board.indexOf(firstCard.id);
      if (slot < 0) { note('That card is not on the board.', 'warn'); break; }
      let here = firstCard.id;
      for (let pass = 0; pass < 2; pass++) {
        const next = drawId(ctx);
        if (!next) break;
        returnToDeck(ctx, here);
        t.board[slot] = next;
        here = next;
      }
      ctx.fx.push({ t: 'deal', cardIds: [here], to: 'board' });
      note(`${caster.name} writes over that slot twice. It reads ${describeCard(t, here)} now.`, 'impossible');
      break;
    }

    case 'second_wind': {
      let drawn = 0;
      for (let i = 0; i < 2; i++) if (giveSigil(t, caster, randomSigil(rng))) drawn++;
      note(
        drawn ? `${caster.name} draws ${drawn === 2 ? 'two sigils' : 'a sigil'}.` : 'Their hand is already full.',
        drawn ? 'magic' : 'warn',
      );
      break;
    }

    case 'resonance': {
      const anchor = card(t, t.board[0]);
      if (!anchor) { note('There is no board to resonate with.', 'warn'); break; }
      const face = anchor.faces[anchor.collapsed ?? 0] ?? anchor.faces[0];
      let moved = 0;
      for (const id of caster.hole) {
        const c = card(t, id);
        if (!canAlter(c)) continue;
        c.faces = c.faces.map((f) => ({ rank: f.rank, suit: face.suit }));
        ctx.fx.push({ t: 'inscribe', cardId: id, markId: 'prism' });
        moved++;
      }
      note(
        moved ? `${caster.name}'s hand takes the suit of the board.` : 'Nothing of theirs could change.',
        moved ? 'impossible' : 'warn',
      );
      break;
    }

    case 'graft': {
      const a = card(t, caster.hole[0]);
      const b = card(t, caster.hole[1]);
      if (!a || !canAlter(b)) { note('Nothing to graft onto.', 'warn'); break; }
      b.faces = a.faces.map((f) => ({ ...f }));
      b.collapsed = a.collapsed;
      b.veil = a.veil;
      if (!b.marks.includes('mirrored')) b.marks.push('mirrored');
      t.tempMarks.push({ cardId: b.id, markId: 'mirrored' });
      ctx.fx.push({ t: 'entangle', cardIds: [a.id, b.id] });
      note(`${caster.name} is holding the same card twice.`, 'impossible');
      break;
    }

    case 'ashes': {
      const id = t.discard.pop();
      if (!id) { note('Nothing has burned yet.', 'warn'); break; }
      const c = card(t, id);
      if (c) { c.veil = 'open'; c.origin = 'deck'; }
      t.board.push(id);
      applySeal(t, id);
      ctx.fx.push({ t: 'deal', cardIds: [id], to: 'board' });
      note(`${describeCard(t, id)} comes back out of the ashes.`, 'impossible');
      break;
    }

    case 'blight': {
      if (!targetPlayer || targetPlayer.sigils.length === 0) {
        note('They are holding nothing to rot.', 'warn');
        break;
      }
      targetPlayer.sigils.splice(rng.int(targetPlayer.sigils.length), 1);
      ctx.fx.push({ t: 'sfx', name: 'spell_counter' });
      // Deliberately does not name the sigil: knowing what died is knowing
      // what they held, and this is supposed to cost them, not inform you.
      note(`Something rots out of ${targetPlayer.name}'s hand.`, 'impossible');
      break;
    }

    case 'gild': {
      if (!canAlter(firstCard)) { note('That card is set in amber.', 'warn'); break; }
      if (!firstCard.marks.includes('prism')) firstCard.marks.push('prism');
      t.tempMarks.push({ cardId: firstCard.id, markId: 'prism' });
      ctx.fx.push({ t: 'inscribe', cardId: firstCard.id, markId: 'prism' });
      note(`${caster.name} gilds a community card. It is every suit at once.`, 'impossible');
      break;
    }

    case 'loom': {
      const r = (tg.rank ?? 14) as Rank;
      const own = caster.hole.map((id) => card(t, id)).find((c) => !!c);
      const suit: Suit = own?.faces[0]?.suit ?? rng.pick(SUITS);
      const woven = makeCard(r, suit, { origin: 'conjured' });
      t.cards.set(woven.id, woven);
      t.deck.unshift(woven.id);
      note(`${caster.name} weaves the next community card: ${faceLabel({ rank: r, suit })}.`, 'impossible');
      break;
    }

    // ------------------------------------------------------------ RESPONSE
    case 'nullify': {
      const target = below();
      if (!target) { note('Nothing to counter.', 'warn'); break; }
      target.countered = true;
      ctx.fx.push({ t: 'counter', sigilId: target.sigilId, casterId: caster.id });
      ctx.fx.push({ t: 'sfx', name: 'spell_counter' });
      note(`${caster.name} nullifies ${SIGIL_BY_ID[target.sigilId]?.name}.`, 'impossible');
      break;
    }
    case 'redirect': {
      const target = below();
      if (!target) { note('Nothing to redirect.', 'warn'); break; }
      target.targets = { ...target.targets, ...tg };
      note(`${caster.name} steers ${SIGIL_BY_ID[target.sigilId]?.name} somewhere else.`, 'impossible');
      break;
    }
    case 'reflect': {
      const target = below();
      if (!target) { note('Nothing to reflect.', 'warn'); break; }
      const copy: StackEntry = {
        id: nanoid(8), casterId: caster.id, sigilId: target.sigilId,
        targets: { ...target.targets, ...tg }, countered: false, costPaid: 0,
      };
      // Resolve the copy immediately, in this caster's name.
      applyEffect(ctx, copy, stack, index);
      note(`${caster.name} reflects ${SIGIL_BY_ID[target.sigilId]?.name} back through their own hands.`, 'impossible');
      break;
    }
    case 'toll': {
      const target = below();
      if (!target) { note('Nothing to tax.', 'warn'); break; }
      const owner = byId(t, target.casterId);
      const due = target.costPaid;
      if (!owner || owner.mana < due) {
        target.countered = true;
        ctx.fx.push({ t: 'counter', sigilId: target.sigilId, casterId: caster.id });
        note(`${owner?.name ?? 'The caster'} cannot pay the toll. ${SIGIL_BY_ID[target.sigilId]?.name} fizzles.`, 'impossible');
      } else {
        owner.mana -= due;
        note(`${owner.name} pays ${due} more mana to keep ${SIGIL_BY_ID[target.sigilId]?.name} alive.`);
      }
      break;
    }

    default:
      note(`${def.name} resolves.`);
  }
}

// ---------------------------------------------------------------------------
// Housekeeping between hands
// ---------------------------------------------------------------------------

/** Strip everything that was only ever meant to last one hand. */
export function clearHandMagic(t: Table): void {
  for (const { cardId, markId } of t.tempMarks) {
    const c = t.cards.get(cardId);
    if (!c) continue;
    const i = c.marks.indexOf(markId);
    if (i >= 0) c.marks.splice(i, 1);
  }
  t.tempMarks = [];

  for (const c of t.cards.values()) {
    c.divergent = undefined;
    c.entangledWith = undefined;
    c.veil = 'open';
    c.amber = undefined;
    if (c.faces.length > 1) {
      c.faces = [c.faces[c.collapsed ?? 0]];
      c.collapsed = 0;
    }
    c.origin = undefined;
  }

  t.mods = {};
  t.modNotes = [];
  t.sealedRanks = [];
  t.burnedSlots = [];
  t.echoTimeline = null;
  t.quantumFlop = false;
  t.stack = null;

  for (const p of t.players) {
    p.warded = false;
    p.severed = false;
    p.hexed = 0;
    p.sharedWith = undefined;
    p.betVeiled = false;
    p.blinded = false;
    p.foreknowledge = { deckPeek: [], seenHole: [], divergedFrom: {}, lies: {}, seenSigils: [] };
  }
}

/** Cards created mid-hand (Conjure, Twin) do not persist into the next deal. */
export function reapConjured(t: Table): void {
  for (const [id, c] of [...t.cards.entries()]) {
    if (c.origin === 'conjured') t.cards.delete(id);
  }
}

export { RANK_LABEL };
export type { Rank, Suit };
