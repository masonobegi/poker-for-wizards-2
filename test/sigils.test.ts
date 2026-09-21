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
import { SIGILS, type SigilDef } from '../shared/sigils';
import { isQuantum } from '../shared/cards';
import type { Table } from '../shared/types';
import { createPlayer, createTable, live } from '../server/game/table';
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
  });
}

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
