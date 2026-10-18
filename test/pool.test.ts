/**
 * What is actually in the game, as opposed to what has been written for it.
 *
 * Seventy-one sigils, forty-five relics and forty-one omens were all live at
 * once. Two people played a run on the hosted build and neither could say
 * what a single omen did; the sigils were "fifty cards I have to remember".
 * A set that large does not read as variety, it reads as noise, and six of
 * the omens said "sigils cost one more mana" in six different wordings.
 *
 * So each kind of content now has a pool — the live set — and a registry,
 * which is everything ever written and still resolvable by id so an old save
 * or an old ledger line never crashes. These tests hold the pools to the
 * things the engine assumes about them, and hold the sizes down, because the
 * small size IS the feature and a set that creeps back to fifty loses it.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { OMENS, OMEN_POOL, OMEN_POOL_IDS, IMPOSSIBLE_BY_ANTE, keepsPromise } from '../shared/omens';
import { RELICS, RELIC_POOL, RELIC_POOL_IDS } from '../shared/relics';
import { POOL, POOL_IDS, SCHOOLS, SIGILS, type School } from '../shared/sigils';
import { COVENS, COVEN_BY_ID, COVEN_CHOICE, DEFAULT_COVEN } from '../shared/covens';

test('the pools are a subset of what exists, with nothing named twice', () => {
  for (const [what, ids, all] of [
    ['sigil', POOL_IDS, SIGILS.map((s) => s.id)],
    ['omen', OMEN_POOL_IDS, OMENS.map((o) => o.id)],
    ['relic', RELIC_POOL_IDS, RELICS.map((r) => r.id)],
  ] as const) {
    assert.equal(new Set(ids).size, ids.length, `a ${what} is named twice`);
    for (const id of ids) assert.ok(all.includes(id), `${what} pool names a missing ${what}: ${id}`);
  }
});

test('the set stays small — that is the whole point of it', () => {
  // These are ceilings, not targets. Raising one is a design decision and
  // should read like one in the diff, rather than happening a card at a time.
  assert.ok(POOL.length <= 16, `${POOL.length} sigils is heading back towards a wall of cards`);
  assert.ok(OMEN_POOL.length <= 12, `${OMEN_POOL.length} omens`);
  assert.ok(RELIC_POOL.length <= 16, `${RELIC_POOL.length} relics`);
  // And large enough to still be a game.
  assert.ok(POOL.length >= 8, 'a spell game needs spells');
  assert.ok(OMEN_POOL.length >= 6, 'a run is several antes long and each takes an omen');
  assert.ok(RELIC_POOL.length >= 8, 'the Market has to have something to sell');
});

test('every school is still in the bag', () => {
  // `randomSigil(rng, true, school)` picks from the school's own cards when a
  // draw leans. An empty bag there is a crash, not a quiet fallback.
  for (const school of Object.keys(SCHOOLS) as School[]) {
    const have = POOL.filter((s) => s.school === school);
    assert.ok(have.length > 0, `no ${school} sigil is in the pool`);
  }
});

test('a stack can always be answered, and something can always be cast', () => {
  const responses = POOL.filter((s) => s.timing.includes('response'));
  assert.ok(responses.length > 0, 'nothing in the pool answers a sigil on the stack');

  // The card a new player can always cast: no target to choose, any street,
  // one or two mana. Without one, a hand with no legal target is a hand that
  // does nothing, and the player learns that magic is for other people.
  const easy = POOL.filter((s) => s.target === 'none' && s.timing.includes('any') && s.cost <= 2);
  assert.ok(easy.length > 0, 'no cheap, targetless, any-street sigil in the pool');
});

test('the promise that the deck can hold a card twice is kept by more than one omen', () => {
  // See IMPOSSIBLE_BY_ANTE: a run is owed an omen that opens the impossible
  // hands by the middle of it, and `rollOmen` narrows the bag to those omens
  // to keep that promise. If only one qualifies, every run opens identically.
  const openers = OMEN_POOL.filter((o) => keepsPromise(o) && o.minAnte <= IMPOSSIBLE_BY_ANTE);
  assert.ok(openers.length >= 2, `only ${openers.map((o) => o.name).join(', ')} can open a run`);
});

test('there is an omen for every ante a run reaches', () => {
  // `rollOmen` takes one omen per ante from those whose minAnte has passed,
  // never repeating. A run that outlives the pool simply stops getting them,
  // which is survivable — but the early antes must not run dry, because that
  // is most of what anybody plays.
  for (const ante of [2, 3, 4]) {
    const available = OMEN_POOL.filter((o) => o.minAnte <= ante).length;
    assert.ok(available >= ante, `ante ${ante} has only ${available} omens to draw from`);
  }
});

test('the Market can roll every rarity it weights', () => {
  for (const rarity of ['common', 'rare', 'mythic'] as const) {
    assert.ok(RELIC_POOL.some((r) => r.rarity === rarity), `no ${rarity} relic is for sale`);
    assert.ok(POOL.some((s) => s.rarity === rarity) || rarity === 'mythic',
      `no ${rarity} sigil is for sale`);
  }
});

test('no coven is chosen, and the one everybody plays is whole', () => {
  // COVEN_CHOICE is off: the run opens without asking anyone to pick an
  // archetype. The default still has to be a complete, playable coven,
  // because it is now the only one anybody sees.
  const def = COVEN_BY_ID[DEFAULT_COVEN];
  assert.ok(def, 'the default coven does not exist');
  assert.ok(def.sigils.length > 0, 'the opening hand is empty');
  for (const id of def.sigils) {
    assert.ok(POOL_IDS.includes(id), `the opening hand deals ${id}, which is not in the pool`);
  }
  if (!COVEN_CHOICE) {
    assert.ok(COVENS.length >= 1, 'the covens are still defined, for an old save to resolve');
  }
});
