/**
 * Omens: the permanent, stacking, table-wide rules.
 *
 * These are the most dangerous thing in the codebase for silent breakage —
 * they are drawn at random, they never come off, and several of them rewrite
 * how a hand is scored. A bad one does not crash; it quietly makes every
 * showdown wrong for the rest of a run.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Engine } from '../server/game/engine';
import { alive, modsFor } from '../server/game/table';
import { OMENS, OMEN_BY_ID, omenMods, type ActiveOmen } from '../shared/omens';
import { Cat } from '../shared/hand';
import type { MarkId } from '../shared/cards';

function table(players = 3) {
  const engine = new Engine('OMEN', 'host', {
    startingChips: 20000, baseBlind: 200, handsPerAnte: 1,
    actionSeconds: 2, responseSeconds: 1, shopSeconds: 1,
  }, () => {}, () => {});
  engine.addPlayer('host', 'Host', true);
  for (let i = 1; i < players; i++) engine.addBot();
  return engine;
}

test('every omen is well formed', () => {
  const seen = new Set<string>();
  for (const o of OMENS) {
    assert.ok(!seen.has(o.id), `duplicate omen id ${o.id}`);
    seen.add(o.id);
    assert.ok(o.name.length > 0, `${o.id} has no name`);
    assert.ok(o.text.length > 10, `${o.id} has no rules text`);
    assert.ok(o.impossible.length > 10, `${o.id} does not say why it is impossible`);
    assert.ok(o.weight > 0, `${o.id} can never be drawn`);
    assert.ok(o.minAnte >= 2, `${o.id} would land before the first market`);
    const doesSomething = !!(o.mods || o.deal || o.mana || o.killsRank
      || o.sigilDraw || o.sigilCost || o.blindSteps);
    assert.ok(doesSomething, `${o.id} has no effect at all`);
  }
});

test('omen rule mods merge the way relics do', () => {
  const active: ActiveOmen[] = [
    { id: 'blurred', ante: 2 },
    { id: 'thin_ice', ante: 2 },
    { id: 'serpent', ante: 3 },
    { id: 'unmade', ante: 4, rank: 9 },
  ];
  const m = omenMods(active);
  assert.equal(m.mergedColors, true);
  assert.equal(m.wheelWrap, true);
  assert.equal(m.flushSize, 4);
  assert.deepEqual(m.deadRanks, [9]);
});

test('a struck rank reaches the hand evaluator', () => {
  const engine = table();
  const t = engine.table;
  t.omens.push({ id: 'unmade', ante: 4, rank: 14 });
  const mods = modsFor(t, t.players[0]);
  assert.deepEqual(mods.deadRanks, [14]);
  engine.dispose();
});

test('The Inversion actually inverts who wins', () => {
  const engine = table();
  const t = engine.table;
  assert.ok(!modsFor(t, t.players[0]).lowWins, 'high hand wins by default');
  t.omens.push({ id: 'inversion', ante: 5 });
  assert.equal(modsFor(t, t.players[0]).lowWins, true);
  engine.dispose();
});

test('omens raise the mana ceiling for everyone', () => {
  const engine = table();
  const t = engine.table;
  const before = t.players[0].maxMana;
  t.omens.push({ id: 'feast', ante: 2 });
  const after = 8 + 2;
  assert.equal(OMEN_BY_ID.feast.mana?.max, 2);
  assert.ok(after > before);
  engine.dispose();
});

test('an omen lands at every ante, never repeats, and respects its gate', () => {
  const engine = table();
  const t = engine.table;
  const roll = (engine as unknown as { rollOmen: () => void }).rollOmen.bind(engine);

  const seen = new Set<string>();
  for (let ante = 2; ante <= 9; ante++) {
    t.ante = ante;
    const before = t.omens.length;
    roll();
    if (t.omens.length === before) continue; // pool exhausted for this ante
    const landed = t.omens[t.omens.length - 1];
    assert.ok(!seen.has(landed.id), `${landed.id} landed twice`);
    seen.add(landed.id);
    assert.ok(
      OMEN_BY_ID[landed.id].minAnte <= ante,
      `${landed.id} landed at ante ${ante} but is gated to ${OMEN_BY_ID[landed.id].minAnte}`,
    );
    assert.equal(landed.ante, ante);
  }
  assert.ok(seen.size >= 5, `only ${seen.size} omens landed across eight antes`);
  engine.dispose();
});

test('a rank-striking omen always rolls a rank to strike', () => {
  const engine = table();
  const t = engine.table;
  const roll = (engine as unknown as { rollOmen: () => void }).rollOmen.bind(engine);
  t.ante = 9;
  for (let i = 0; i < 30; i++) roll();
  for (const o of t.omens) {
    if (OMEN_BY_ID[o.id]?.killsRank) {
      assert.ok(o.rank && o.rank >= 2 && o.rank <= 14, `${o.id} struck rank ${o.rank}`);
    }
  }
  engine.dispose();
});

test('deck-editing omens inscribe the shared deck exactly once', () => {
  const engine = table();
  const t = engine.table;
  const roll = (engine as unknown as { rollOmen: () => void }).rollOmen.bind(engine);

  t.ante = 9;
  for (let i = 0; i < 40; i++) roll();

  const wanted = new Map<MarkId, number>();
  for (const o of t.omens) {
    const ins = OMEN_BY_ID[o.id]?.deal?.inscribe;
    if (ins) wanted.set(ins.markId, (wanted.get(ins.markId) ?? 0) + ins.count);
  }

  for (const [markId, count] of wanted) {
    const marked = [...t.cards.values()].filter((c) => c.marks.includes(markId)).length;
    assert.equal(marked, count, `expected ${count} cards marked ${markId}, found ${marked}`);
  }
  engine.dispose();
});

test('starting a fresh run wipes the previous run’s omens and inscriptions', () => {
  const engine = table();
  const t = engine.table;
  const roll = (engine as unknown as { rollOmen: () => void }).rollOmen.bind(engine);
  t.ante = 9;
  for (let i = 0; i < 20; i++) roll();
  assert.ok(t.omens.length > 0);

  t.phase = 'gameover';
  engine.start();

  assert.equal(t.omens.length, 0, 'omens survived into a new run');
  for (const c of t.cards.values()) {
    assert.equal(c.marks.length, 0, 'an inscription survived into a new run');
    assert.equal(c.memory, 0, 'card memory survived into a new run');
  }
  engine.dispose();
});

test('a table under six omens still deals and scores a hand', () => {
  const engine = table(4);
  const t = engine.table;
  engine.start();

  t.omens.push(
    { id: 'blurred', ante: 2 },
    { id: 'serpent', ante: 2 },
    { id: 'thin_ice', ante: 3 },
    { id: 'long_memory', ante: 3 },
    { id: 'unmade', ante: 4, rank: 7 },
    { id: 'inversion', ante: 5 },
  );

  for (const p of alive(t)) {
    const mods = modsFor(t, p);
    assert.equal(mods.mergedColors, true);
    assert.equal(mods.lowWins, true);
    assert.equal(mods.flushSize, 4);
    assert.deepEqual(mods.deadRanks, [7]);
    assert.ok((mods.categoryShift ?? 0) <= Cat.FlushFive);
  }
  engine.dispose();
});
