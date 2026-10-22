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
 *
 * Two sets of pools since 2026-10-22 (shared/unlock.ts): the first run's, and
 * the slightly larger one every run after it deals. Everything the engine
 * assumes about a pool has to hold for both, so each test runs over both.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { OMENS, OMEN_POOL_IDS, IMPOSSIBLE_BY_ANTE, keepsPromise, omenPool } from '../shared/omens';
import { RELICS, RELIC_POOL_IDS, relicPool } from '../shared/relics';
import { POOL_IDS, SCHOOLS, SIGILS, sigilPool, type School } from '../shared/sigils';
import { COVENS, COVEN_BY_ID, COVEN_CHOICE, DEFAULT_COVEN } from '../shared/covens';

const PHASES = [['first run', false], ['later runs', true]] as const;

test('the pools are a subset of what exists, with nothing named twice', () => {
  for (const [phase, unlocked] of PHASES) {
    for (const [what, ids, all] of [
      ['sigil', sigilPool(unlocked).map((s) => s.id), SIGILS.map((s) => s.id)],
      ['omen', omenPool(unlocked).map((o) => o.id), OMENS.map((o) => o.id)],
      ['relic', relicPool(unlocked).map((r) => r.id), RELICS.map((r) => r.id)],
    ] as const) {
      assert.equal(new Set(ids).size, ids.length, `${phase}: a ${what} is named twice`);
      for (const id of ids) assert.ok(all.includes(id), `${phase}: ${what} pool names a missing ${what}: ${id}`);
    }
  }
  assert.deepEqual(sigilPool(false).map((s) => s.id), [...POOL_IDS]);
  assert.deepEqual(omenPool(false).map((o) => o.id), [...OMEN_POOL_IDS]);
  assert.deepEqual(relicPool(false).map((r) => r.id), [...RELIC_POOL_IDS]);
});

test('the set stays small — that is the whole point of it', () => {
  // These are ceilings, not targets. Raising one is a design decision and
  // should read like one in the diff, rather than happening a card at a time.
  // The later runs' pools are held to the same ceilings: the player who could
  // not remember 71 sigils is the same player on their second run.
  for (const [phase, unlocked] of PHASES) {
    const sigils = sigilPool(unlocked).length;
    const omens = omenPool(unlocked).length;
    const relics = relicPool(unlocked).length;
    assert.ok(sigils <= 16, `${phase}: ${sigils} sigils is heading back towards a wall of cards`);
    assert.ok(omens <= 12, `${phase}: ${omens} omens`);
    assert.ok(relics <= 16, `${phase}: ${relics} relics`);
    // And large enough to still be a game.
    assert.ok(sigils >= 8, 'a spell game needs spells');
    assert.ok(omens >= 6, 'a run is several antes long and each takes an omen');
    assert.ok(relics >= 8, 'the Market has to have something to sell');
  }
});

test('every school is still in the bag', () => {
  // `randomSigil(rng, true, school)` picks from the school's own cards when a
  // draw leans. An empty bag there is a crash, not a quiet fallback.
  for (const [phase, unlocked] of PHASES) {
    for (const school of Object.keys(SCHOOLS) as School[]) {
      const have = sigilPool(unlocked).filter((s) => s.school === school);
      assert.ok(have.length > 0, `${phase}: no ${school} sigil is in the pool`);
    }
  }
});

test('a stack can always be answered, and something can always be cast', () => {
  for (const [phase, unlocked] of PHASES) {
    const pool = sigilPool(unlocked);
    const responses = pool.filter((s) => s.timing.includes('response'));
    assert.ok(responses.length > 0, `${phase}: nothing in the pool answers a sigil on the stack`);

    // The card a new player can always cast: no target to choose, any street,
    // one or two mana. Without one, a hand with no legal target is a hand that
    // does nothing, and the player learns that magic is for other people.
    const easy = pool.filter((s) => s.target === 'none' && s.timing.includes('any') && s.cost <= 2);
    assert.ok(easy.length > 0, `${phase}: no cheap, targetless, any-street sigil in the pool`);
  }
});

test('the promise that the deck can hold a card twice is kept by more than one omen', () => {
  // See IMPOSSIBLE_BY_ANTE: a run is owed an omen that opens the impossible
  // hands by the middle of it, and `rollOmen` narrows the bag to those omens
  // to keep that promise. If only one qualifies, every run opens identically.
  for (const [phase, unlocked] of PHASES) {
    const openers = omenPool(unlocked).filter((o) => keepsPromise(o) && o.minAnte <= IMPOSSIBLE_BY_ANTE);
    assert.ok(openers.length >= 2, `${phase}: only ${openers.map((o) => o.name).join(', ')} can open a run`);
  }
});

test('there is an omen for every ante a run reaches', () => {
  // `rollOmen` takes one omen per ante from those whose minAnte has passed,
  // never repeating. A run that outlives the pool simply stops getting them,
  // which is survivable — but the early antes must not run dry, because that
  // is most of what anybody plays.
  for (const [phase, unlocked] of PHASES) {
    for (const ante of [2, 3, 4]) {
      const available = omenPool(unlocked).filter((o) => o.minAnte <= ante).length;
      assert.ok(available >= ante, `${phase}: ante ${ante} has only ${available} omens to draw from`);
    }
  }
});

test('the Market can roll every rarity it weights', () => {
  for (const [phase, unlocked] of PHASES) {
    for (const rarity of ['common', 'rare', 'mythic'] as const) {
      assert.ok(relicPool(unlocked).some((r) => r.rarity === rarity), `${phase}: no ${rarity} relic is for sale`);
      assert.ok(sigilPool(unlocked).some((s) => s.rarity === rarity) || rarity === 'mythic',
        `${phase}: no ${rarity} sigil is for sale`);
    }
  }
});

test('no coven is chosen on a first run, and the one everybody plays is whole', () => {
  // The first run opens without asking anyone to pick an archetype. The
  // default still has to be a complete, playable coven, because it is the
  // only one a new player sees.
  const def = COVEN_BY_ID[DEFAULT_COVEN];
  assert.ok(def, 'the default coven does not exist');
  assert.ok(def.sigils.length > 0, 'the opening hand is empty');
  for (const id of def.sigils) {
    assert.ok(POOL_IDS.includes(id), `the opening hand deals ${id}, which is not in the pool`);
  }
  // The covens that open from the second run (COVENS_UNLOCK) open on cards
  // their seat is dealt by id, in or out of the pool; every one must exist.
  for (const c of COVENS) {
    for (const id of c.sigils) assert.ok(SIGILS.some((s) => s.id === id), `${c.name} opens with ${id}, which does not exist`);
  }
  if (!COVEN_CHOICE) {
    assert.ok(COVENS.length >= 1, 'the covens are still defined, for an old save to resolve');
  }
});
