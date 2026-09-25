/**
 * Every sigil, cast and resolved at least once.
 *
 * There are thirty-odd effects and they all reach into the same table. One
 * uncaught exception in a rarely-drawn sigil would wedge a live game, so this
 * walks the whole list rather than spot-checking the interesting ones.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nanoid } from 'nanoid';
import { Rng } from '../shared/rng';
import { SIGILS, SIGIL_BY_ID, type SigilDef } from '../shared/sigils';
import { isQuantum } from '../shared/cards';
import type { Table } from '../shared/types';
import { canCast, castBlock, createPlayer, createTable, live, viewFor } from '../server/game/table';
import { blockLabel, windowLabel } from '../src/components/table/castBlock';
import {
  castSigil, clearHandMagic, drawId, resolveStack, type MagicCtx,
} from '../server/game/magic';

function freshTable(): { t: Table; ctx: MagicCtx } {
  const t = createTable('TEST', 'a', {
    startingChips: 20000, baseBlind: 200, magicEnabled: true, responseSeconds: 1,
  });
  const rng = new Rng('sigil-suite');
  const ctx: MagicCtx = { t, rng, fx: [] };

  for (const [i, name] of ['Alice', 'Bob', 'Cleo'].entries()) {
    const p = createPlayer(`p${i}`, name, i, t.config);
    p.mana = 20;
    p.maxMana = 20;
    t.players.push(p);
  }

  t.deck = rng.shuffle([...t.cards.keys()]);
  t.phase = 'flop';

  for (const p of t.players) {
    for (let i = 0; i < 2; i++) {
      const id = drawId(ctx);
      if (id) p.hole.push(id);
    }
  }
  for (let i = 0; i < 3; i++) {
    const id = drawId(ctx);
    if (id) t.board.push(id);
  }
  return { t, ctx };
}

/** Plausible targets for whatever this sigil asks for. */
function targetsFor(t: Table, def: SigilDef) {
  const me = t.players[0];
  const them = t.players[1];
  switch (def.target) {
    case 'player': return { playerId: them.id };
    case 'rank': return { rank: 13 };
    case 'suit': return { suit: 'S' as const };
    case 'own_card': return { cardIds: [me.hole[0]] };
    case 'board_card': return { cardIds: [t.board[0]] };
    case 'any_card': return { cardIds: [me.hole[0]], markId: 'blooded' as const };
    case 'two_cards': return { cardIds: [t.board[0], t.board[1]] };
    default: return {};
  }
}

for (const def of SIGILS) {
  test(`${def.name} resolves without throwing`, () => {
    const { t, ctx } = freshTable();
    const me = t.players[0];
    const uid = nanoid(8);

    // A response sigil needs something on the stack to answer — and it has to
    // already be in hand when that lands, because the responder list is fixed
    // at cast time.
    if (def.timing.includes('response')) {
      me.sigils.push({ uid, defId: def.id });
      const victim = t.players[1];
      victim.sigils.push({ uid: 'bait', defId: 'second_sight' });
      const bait = castSigil(ctx, victim, 'bait', {});
      assert.ok(bait.ok, `could not stage a sigil for ${def.name} to answer: ${bait.error}`);
      assert.ok(
        t.stack?.pending.includes(me.id),
        `${def.name} holder was not offered the response window`,
      );
    } else {
      t.phase = def.timing.includes('deal') && !def.timing.includes('any')
        ? 'deal'
        : def.timing.includes('river') && !def.timing.includes('flop') ? 'river' : 'flop';
      if (def.timing.includes('preflop') && !def.timing.includes('flop')) t.phase = 'preflop';
      if (def.timing.includes('turn') && !def.timing.includes('flop')) t.phase = 'turn';
    }

    if (!def.timing.includes('response')) me.sigils.push({ uid, defId: def.id });

    const res = castSigil(ctx, me, uid, targetsFor(t, def));
    assert.ok(res.ok, `${def.name} could not be cast: ${res.error}`);

    assert.doesNotThrow(() => resolveStack(ctx), `${def.name} threw while resolving`);

    // Whatever it did, the table has to still be coherent afterwards.
    assert.equal(t.stack, null, `${def.name} left the stack up`);
    assert.ok(me.mana >= 0, `${def.name} left negative mana`);
    for (const p of t.players) {
      assert.ok(p.hole.length <= 6, `${def.name} gave ${p.name} ${p.hole.length} hole cards`);
      assert.ok(p.chips >= 0, `${def.name} left ${p.name} with ${p.chips} chips`);
    }
    assert.ok(t.board.length <= 8, `${def.name} grew the board to ${t.board.length}`);

    for (const id of [...t.board, ...t.players.flatMap((p) => p.hole)]) {
      assert.ok(t.cards.has(id), `${def.name} left a dangling card reference`);
    }

    // A card with no faces, or a `collapsed` index pointing past the end of
    // them, is a card the hand evaluator cannot read — and the failure would
    // surface at showdown, a long way from whatever caused it. Anything that
    // edits `faces` has to leave this true.
    for (const c of t.cards.values()) {
      assert.ok(c.faces.length >= 1, `${def.name} left ${c.id} with no faces at all`);
      assert.ok(
        c.collapsed === null || (c.collapsed >= 0 && c.collapsed < c.faces.length),
        `${def.name} left ${c.id} collapsed onto face ${c.collapsed} of ${c.faces.length}`,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// The second pass, where "resolves without throwing" is not the claim
// ---------------------------------------------------------------------------

/** Cast one sigil, by id, with the given targets, and resolve it. */
function cast(t: Table, ctx: MagicCtx, id: string, targets: Record<string, unknown> = {}) {
  const me = t.players[0];
  const uid = nanoid(8);
  me.sigils.push({ uid, defId: id });
  const res = castSigil(ctx, me, uid, targets as never);
  assert.ok(res.ok, `${id} could not be cast: ${res.error}`);
  resolveStack(ctx);
  return me;
}

test('Erase takes a card out of the game, where Burn only takes it off the board', () => {
  const { t, ctx } = freshTable();
  const victim = t.board[1];

  cast(t, ctx, 'erase', { cardIds: [victim] });

  assert.ok(!t.cards.has(victim), 'the erased card is still in the table cards');
  assert.ok(!t.board.includes(victim), 'the erased card is still on the board');
  assert.ok(!t.deck.includes(victim), 'the erased card is still in the deck');
  assert.ok(!t.discard.includes(victim),
    'the erased card reached the discard, so a reshuffle would deal it again');
});

test('Weld leaves one card holding both faces and the other gone', () => {
  const { t, ctx } = freshTable();
  const [a, b] = [t.board[0], t.board[1]];
  const facesBefore = t.cards.get(a)!.faces.length + t.cards.get(b)!.faces.length;

  cast(t, ctx, 'weld', { cardIds: [a, b] });

  const kept = t.cards.get(a)!;
  assert.ok(kept.faces.length > 1, 'the welded card did not gain the second face');
  assert.ok(kept.faces.length <= Math.min(3, facesBefore), 'the welded card grew past its cap');
  assert.equal(kept.collapsed, null, 'the welded card should be undecided');
  assert.ok(!t.board.includes(b), 'the second card is still on the board');
});

test('Decay removes a possibility without ever emptying a card', () => {
  const { t, ctx } = freshTable();
  // Give every board card something to lose.
  for (const id of t.board) {
    const c = t.cards.get(id)!;
    c.faces = [c.faces[0], { rank: 7, suit: 'D' }];
    c.collapsed = null;
  }

  cast(t, ctx, 'decay');

  for (const id of t.board) {
    const c = t.cards.get(id)!;
    assert.ok(c.faces.length >= 1, 'Decay emptied a card');
    // One face left is not "undecided" any more; it has to have settled.
    if (c.faces.length === 1) assert.equal(c.collapsed, 0, 'a one-faced card was left undecided');
  }
});

test('Unweave strips one card, Salt the Earth strips the whole deck', () => {
  const { t, ctx } = freshTable();
  const mine = t.players[0].hole[0];
  for (const c of t.cards.values()) c.marks = ['blooded'];

  cast(t, ctx, 'unweave', { cardIds: [mine] });
  assert.equal(t.cards.get(mine)!.marks.length, 0, 'Unweave left a mark behind');
  assert.ok([...t.cards.values()].some((c) => c.marks.length > 0),
    'Unweave stripped more than the one card it was aimed at');

  cast(t, ctx, 'salt_the_earth');
  const left = [...t.cards.values()].filter((c) => c.marks.length > 0 && !c.amber);
  assert.equal(left.length, 0, `Salt the Earth left ${left.length} marked card(s)`);
});

test('Borrowed Time pays out now and cuts the supply for the rest of the hand', () => {
  const { t, ctx } = freshTable();
  const me = t.players[0];
  me.mana = 4;
  me.maxMana = 20;

  cast(t, ctx, 'borrowed_time');

  // 4 held, minus the 1 it costs, plus the 4 it borrows.
  assert.equal(me.mana, 7, `expected 7 mana after borrowing, got ${me.mana}`);
  assert.ok(me.severed, 'Borrowed Time did not cut off the rest of the hand');

  clearHandMagic(t);
  assert.ok(!me.severed, 'the debt outlived the hand that took it on');
});

test('the hand teardown clears every temporary effect', () => {
  const { t, ctx } = freshTable();
  const me = t.players[0];

  for (const id of ['superpose', 'wild_rite', 'entangle', 'sealed_rank', 'divergence', 'hex', 'gloaming']) {
    const def = SIGILS.find((s) => s.id === id);
    if (!def) continue;
    const uid = nanoid(8);
    me.sigils.push({ uid, defId: id });
    const r = castSigil(ctx, me, uid, targetsFor(t, def));
    if (r.ok) resolveStack(ctx);
  }

  clearHandMagic(t);

  assert.equal(t.sealedRanks.length, 0);
  assert.equal(t.tempMarks.length, 0);
  assert.deepEqual(t.mods, {});
  for (const p of t.players) {
    assert.equal(p.warded, false);
    assert.equal(p.hexed, 0);
    assert.equal(p.sharedWith, undefined);
  }
  for (const c of t.cards.values()) {
    assert.equal(c.divergent, undefined, 'a divergence survived the hand');
    assert.equal(c.entangledWith, undefined, 'an entanglement survived the hand');
    assert.equal(c.veil, 'open', 'a seal survived the hand');
    assert.ok(!isQuantum(c), 'a superposition survived the hand');
  }
});

test('Nullify actually stops the sigil underneath it', () => {
  const { t, ctx } = freshTable();
  const caster = t.players[0];
  const answerer = t.players[1];

  answerer.sigils.push({ uid: 'no', defId: 'nullify' });

  caster.sigils.push({ uid: 'spell', defId: 'unmake' });
  assert.ok(castSigil(ctx, caster, 'spell', { rank: 13 }).ok);

  const answered = castSigil(ctx, answerer, 'no', {});
  assert.ok(answered.ok, answered.error);

  resolveStack(ctx);

  assert.deepEqual(t.mods.deadRanks, undefined, 'the countered sigil still took effect');
});

test('a sigil cannot be cast without the mana for it', () => {
  const { t, ctx } = freshTable();
  const me = t.players[0];
  me.mana = 0;
  me.sigils.push({ uid: 'x', defId: 'rewind' });
  const r = castSigil(ctx, me, 'x', {});
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /mana/i);
});

test('an uncastable sigil says why, most permanent reason first', () => {
  // playthrough/06-your-turn.png: pre-flop, five mana, and a 2-cost Nullify
  // and a 4-cost Nightfall both greyed with nothing to tell them apart.
  const { t } = freshTable();
  const me = t.players[0];
  t.phase = 'preflop';
  me.mana = 5;
  me.sigils.push(
    { uid: 'n', defId: 'nullify' },
    { uid: 'f', defId: 'nightfall' },
  );
  assert.deepEqual(castBlock(t, me, me.sigils[0]), { why: 'response' });
  assert.deepEqual(castBlock(t, me, me.sigils[1]), { why: 'timing' });

  // Wrong street AND short of mana: the street is what is reported, because
  // mana arrives by itself and the street does not.
  me.mana = 0;
  assert.deepEqual(castBlock(t, me, me.sigils[1]), { why: 'timing' });

  // Right street, short of mana: mana, with the server's own cost.
  t.phase = 'flop';
  assert.deepEqual(castBlock(t, me, me.sigils[1]), { why: 'mana', need: 4 });
  me.mana = 4;
  assert.equal(castBlock(t, me, me.sigils[1]), null);
  assert.equal(canCast(t, me, me.sigils[1]).ok, true);

  // The view carries it, for this player's own sigils only.
  const v = viewFor(t, me.id);
  assert.deepEqual(v.castBlocks.n, { why: 'response' });
  assert.equal(v.castBlocks.f, undefined);
  assert.ok(v.castable.includes('f'));
});

test('a block reason is short enough for the card and names the window', () => {
  const nightfall = SIGIL_BY_ID.nightfall;
  assert.equal(blockLabel({ why: 'timing' }, nightfall.timing, 'preflop').short, 'From the flop');
  assert.equal(blockLabel({ why: 'response' }, ['response'], 'preflop').short, 'Responses only');
  assert.equal(blockLabel({ why: 'mana', need: 4 }, nightfall.timing, 'flop').short, 'Needs 4 mana');
  assert.equal(blockLabel({ why: 'mana', need: 4 }, nightfall.timing, 'flop').kind, 'mana');
  assert.equal(windowLabel(['river', 'showdown']).short, 'River only');
  assert.equal(windowLabel(['deal', 'preflop']).short, 'Pre-flop only');
  assert.equal(windowLabel(['preflop', 'flop', 'turn']).short, 'Until the turn');
  assert.equal(windowLabel(['flop', 'turn']).short, 'Flop & turn');
  // Every sigil in the set gets a label that fits across a tile.
  for (const def of SIGILS) {
    for (const why of ['timing', 'response', 'stack', 'responded', 'out', 'off'] as const) {
      const l = blockLabel({ why }, def.timing, 'deal');
      assert.ok(l.short.length <= 16, `${def.id}/${why}: "${l.short}" is too long for the tile`);
    }
  }
});

test('a warded player cannot be targeted', () => {
  const { t, ctx } = freshTable();
  const me = t.players[0];
  const them = t.players[1];
  them.warded = true;
  me.sigils.push({ uid: 'x', defId: 'larceny' });
  const r = castSigil(ctx, me, 'x', { playerId: them.id });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /warded/i);
});

test('Burn shortens the board and the hand still scores', () => {
  const { t, ctx } = freshTable();
  const me = t.players[0];
  const before = t.board.length;
  me.sigils.push({ uid: 'b', defId: 'burn' });
  assert.ok(castSigil(ctx, me, 'b', { cardIds: [t.board[1]] }).ok);
  resolveStack(ctx);
  assert.equal(t.board.length, before - 1);
  assert.equal(t.burnedSlots.length, 1);
  assert.ok(live(t).length > 0);
});
