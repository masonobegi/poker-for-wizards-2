/**
 * The three bot skill bands have to actually differ in play.
 *
 * Plumbing a setting through the config and into a personality table is easy
 * to do and easy to do *uselessly* — a difficulty selector that changes a
 * number nothing reads is worse than no selector, because it looks like it
 * works. These tests go at the behaviour rather than the wiring: they play
 * the same spots at each band and check that the decisions come out
 * different, in the direction the band claims.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { decideAction, skillOf, TEMPO, thinkTime } from '../server/game/bots';
import { createTable } from '../server/game/table';
import { Rng } from '../shared/rng';
import { DEFAULT_CONFIG, type BotSkill, type Player, type Table } from '../shared/types';

/**
 * A river spot: hero facing a 2,000 bet into a 4,000 pot, five cards out.
 *
 * Every band is given the *same* deals — the deck is shuffled from a seed that
 * depends only on the trial number — so the only variable between the three
 * measurements is the band itself. Measuring three bands on three different
 * sets of hands would tell you nothing.
 */
function seatTwoBots(t: Table): void {
  for (const pid of ['a', 'b']) {
    t.players.push({
      id: pid, name: pid, isBot: true, seat: t.players.length, connected: true, ready: true,
      chips: 20000, bet: 0, committed: 0, folded: false, allIn: false, eliminated: false,
      hole: [], sigils: [], relics: [], mana: 5, maxMana: 5, shards: 0,
      warded: false, severed: false, hexed: 0, lastAction: null, avatar: 0,
    } as unknown as Player);
  }
}

interface Profile {
  /** Share of spots folded. A calling station folds least. */
  fold: number;
  /** Share of spots raised or shoved. Aggression, as opposed to mere looseness. */
  attack: number;
}

function profile(skill: BotSkill, trials = 400): Profile {
  let fold = 0;
  let attack = 0;
  for (let i = 0; i < trials; i++) {
    const t = createTable('PROBE', 'host', { ...DEFAULT_CONFIG, botSkill: skill, magicEnabled: false });
    seatTwoBots(t);
    const deck = new Rng(`deal:${i}`).shuffle([...t.cards.keys()]);
    const hero = t.players[0];
    hero.hole = deck.slice(0, 2);
    t.board = deck.slice(2, 7);
    t.phase = 'river';
    t.currentBet = 2000;
    t.minRaise = t.bb;
    hero.bet = 0;
    t.pot = 4000;

    const act = decideAction(t, hero, new Rng(`act:${skill}:${i}`));
    if (act.kind === 'fold') fold++;
    if (act.kind === 'raise' || act.kind === 'allin') attack++;
  }
  return { fold: fold / trials, attack: attack / trials };
}

test('the three skill bands are actually different settings', () => {
  const novice = skillOf(createTable('A', 'h', { botSkill: 'novice' }));
  const adept = skillOf(createTable('B', 'h', { botSkill: 'adept' }));
  const master = skillOf(createTable('C', 'h', { botSkill: 'master' }));

  // The novice is the only one whose read on its own hand is wrong.
  assert.ok(novice.blur > 0, 'a novice should misjudge its hand');
  assert.equal(adept.blur, 0, 'adept is the honest baseline');
  assert.equal(master.blur, 0, 'a master should not be handicapped');

  // Sharper play costs more rollouts.
  assert.ok(master.sims > adept.sims, 'master should think harder than adept');
  assert.ok(novice.sims < adept.sims, 'novice should think less than adept');

  // Calling discipline runs the other way.
  assert.ok(novice.loose > adept.loose, 'novice should call wider');
  assert.ok(master.loose < adept.loose, 'master should call tighter');
});

test('adept is unchanged from the behaviour that shipped', () => {
  const adept = skillOf(createTable('B', 'h', { botSkill: 'adept' }));
  assert.equal(adept.blur, 0);
  assert.equal(adept.jitter, 0);
  assert.equal(adept.sims, 1);
  assert.equal(adept.loose, 1);
  assert.equal(TEMPO.standard.think, 1);
  assert.equal(TEMPO.standard.hold, 1);
});

test('an unset table defaults to adept at standard speed', () => {
  const t = createTable('D', 'h', {});
  assert.equal(t.config.botSkill, 'adept');
  assert.equal(t.config.speed, 'standard');
});

test('a novice is a calling station and a master is an aggressor', () => {
  // These play the same 400 river spots at each band, so the differences are
  // the bands and nothing else. This is the test that would actually catch the
  // selector being wired to nothing.
  const novice = profile('novice');
  const adept = profile('adept');
  const master = profile('master');

  // A weak player's defining leak is paying people off.
  assert.ok(
    novice.fold < adept.fold,
    `novice should fold less than adept (${novice.fold.toFixed(2)} vs ${adept.fold.toFixed(2)})`,
  );

  // A strong player's edge shows up as aggression, not as folding more: the
  // master converts the spots an adept calls with into raises and shoves.
  assert.ok(
    master.attack > adept.attack,
    `master should attack more than adept (${master.attack.toFixed(2)} vs ${adept.attack.toFixed(2)})`,
  );
  assert.ok(
    adept.attack > novice.attack,
    `adept should attack more than novice (${adept.attack.toFixed(2)} vs ${novice.attack.toFixed(2)})`,
  );

  // And the three are genuinely far apart, not three names for one bot.
  assert.ok(
    master.attack - novice.attack > 0.1,
    `the bands should be clearly separated, got ${novice.attack.toFixed(2)}..${master.attack.toFixed(2)}`,
  );
});

test('speed scales how long bots take, and standard is the old timing', () => {
  const rng = () => new Rng('tempo');
  const relaxed = thinkTime(rng(), { speed: 'relaxed', actors: 2 });
  const standard = thinkTime(rng(), { speed: 'standard', actors: 2 });
  const blitz = thinkTime(rng(), { speed: 'blitz', actors: 2 });

  assert.ok(relaxed > standard, 'relaxed should be slower than standard');
  assert.ok(blitz < standard, 'blitz should be faster than standard');
  // Same seed, so the only difference is the multiplier.
  assert.equal(standard, thinkTime(rng(), { actors: 2 }), 'omitting speed must mean standard');
});

test('blitz never cuts the showdown reveal short', () => {
  // The hold has a floor equal to the client's reveal animation plus a beat.
  // Five cards revealed one every 90ms after a 320ms lead is 770ms; an
  // impossible hand at 300ms a card is 1820ms. A blitz table must still clear
  // those, or the next deal lands on top of the best moment in the game.
  for (const speed of ['relaxed', 'standard', 'blitz'] as const) {
    const hold = TEMPO[speed].hold;
    assert.ok(hold > 0, `${speed} must not zero the hold`);
  }
  assert.ok(TEMPO.blitz.hold < TEMPO.standard.hold);
  assert.ok(TEMPO.relaxed.hold > TEMPO.standard.hold);
});
