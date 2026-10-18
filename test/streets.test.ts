/**
 * A street gets exactly one betting round.
 *
 * Found by two people playing the deployed build: "it was a turn of bets on
 * the turn but then the river just came without a betting round", and
 * "someone burned the turn card and then the next turn card that came out was
 * treated as the river". One cause behind both.
 *
 * `advanceStreet` deals the board and waits a beat before `beginStreet` opens
 * the round. In that beat the street exists and its round does not:
 * `actedThisStreet` still holds the PREVIOUS street's actors and no bet has
 * been swept into the pot yet. Any sigil whose timing is `any` may be cast
 * into that beat — casting does not require being on the clock — and `cast()`
 * stops the clock, which killed the pending `beginStreet`. `settleStack` then
 * asked `roundComplete()`, got an answer about the street before this one,
 * and advanced again. One cast, two streets.
 *
 * These drive the engine's own transitions with the tick loop stopped, so
 * nothing here depends on wall-clock timing.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { SIGILS } from '../shared/sigils';
import { DEFAULT_CONFIG, type Player, type Table } from '../shared/types';

interface Internals {
  advanceStreet(): void;
  onDeadline: (() => void) | null;
  deadline: number;
  interrupted: (() => void) | null;
}

/** A started table with the tick loop stopped: every beat is fired by hand. */
function table(seed: string): { e: Engine; t: Table; hero: Player; ix: Internals } {
  const e = new Engine('STRT', 'host', { ...DEFAULT_CONFIG, seed }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  e.addBot();
  e.addBot();
  e.start();
  e.dispose();
  const t = e.table;
  return { e, t, hero: t.players.find((p) => p.id === 'host')!, ix: e as unknown as Internals };
}

/** What `tick()` does when a deadline comes due, without waiting for one. */
function fire(ix: Internals): boolean {
  const due = ix.onDeadline;
  if (!due) return false;
  ix.onDeadline = null;
  ix.deadline = 0;
  due();
  return true;
}

/** Hand the hero one sigil that can be cast at any time and names no target. */
function armHero(t: Table, hero: Player): string {
  const def = SIGILS.find((s) => s.target === 'none' && s.timing.includes('any') && s.cost <= 2);
  assert.ok(def, 'the live set needs at least one no-target sigil castable at any time');
  hero.sigils = [{ uid: 'test-sigil', defId: def.id }];
  hero.mana = Math.max(hero.mana, def.cost);
  // Nobody else holds anything, so no response window opens and the stack
  // settles on its own beat.
  for (const p of t.players) if (p.id !== hero.id) p.sigils = [];
  return 'test-sigil';
}

/** Pretend the street that is ending was played out normally. */
function closeRound(t: Table): void {
  t.actedThisStreet = new Set(t.players.filter((p) => !p.folded && !p.eliminated).map((p) => p.id));
  t.currentBet = 0;
  for (const p of t.players) p.bet = 0;
}

test('a sigil cast in the beat between streets does not eat the next betting round', () => {
  const { e, t, hero, ix } = table('streets:cast-in-the-gap');
  const uid = armHero(t, hero);

  t.phase = 'flop';
  closeRound(t);
  ix.advanceStreet();

  assert.equal(t.phase, 'turn', 'the turn is dealt');
  assert.ok(ix.interrupted, 'the beat before the turn\'s betting round is armed');
  const boardOnTurn = t.board.length;

  /*
   * The cast lands inside that beat, which is the whole bug.
   *
   * A sigil is now cast on its owner's turn, and in this beat nobody is on
   * the clock — so the route that caused the original bug is closed twice
   * over, and the refusal is worth asserting on its own.
   */
  assert.equal(e.cast(hero.id, uid, {}).error, 'Wait for your turn',
    'a cast in the gap between streets is not a legal action');

  /* What is under test is the scheduler, not the turn rule: the owed beat
     must survive a cast that happens while it is armed. So the hero is put
     back on the clock and casts legally into the same beat. */
  t.actingId = hero.id;
  const r = e.cast(hero.id, uid, {});
  assert.ok(r.ok, r.error);
  /* Back off the clock, which is where the beat left it: the loop below
     waits for the betting round to put somebody back on. */
  t.actingId = null;

  // Settle the stack and run whatever it hands back, to a fixed point.
  for (let i = 0; i < 8 && fire(ix); i++) {
    if (t.actingId) break;
  }

  assert.equal(t.phase, 'turn', 'the river must not arrive while the turn is still being played');
  assert.equal(t.board.length, boardOnTurn, 'no extra card came out');
  assert.ok(t.actingId, 'somebody is on the clock: the turn got its betting round');
  assert.equal(t.actedThisStreet.size, 0, 'and it is a fresh round, not the flop\'s');
  e.dispose();
});

test('the beat is owed, not guessed at: no cast means no change', () => {
  const { e, t, ix } = table('streets:plain');
  t.phase = 'flop';
  closeRound(t);
  ix.advanceStreet();
  assert.equal(t.phase, 'turn');

  fire(ix); // beginStreet
  assert.ok(t.actingId, 'the turn opens its own betting round');
  assert.equal(t.actedThisStreet.size, 0);
  e.dispose();
});

test('every street from the flop on gets a round of its own', () => {
  const { e, t, hero, ix } = table('streets:all-three');
  const uid = armHero(t, hero);
  const defId = hero.sigils[0].defId;
  const seen: string[] = [];
  // The fixture jumps straight to the flop without dealing one, so what is
  // being counted is cards per street, not the size of a real board.
  const dealt: number[] = [];

  t.phase = 'flop';
  for (const expected of ['turn', 'river']) {
    const before = t.board.length;
    closeRound(t);
    ix.advanceStreet();
    assert.equal(t.phase, expected);

    // Cast into the beat every time, on the clock (castBlock's `turn` rule).
    hero.sigils = [{ uid, defId }];
    hero.mana = 5;
    t.actingId = hero.id;
    const r = e.cast(hero.id, uid, {});
    assert.ok(r.ok, r.error);
    t.actingId = null;
    for (let i = 0; i < 8 && fire(ix); i++) if (t.actingId) break;

    assert.ok(t.actingId, `${expected} got a betting round`);
    assert.equal(t.actedThisStreet.size, 0, `${expected}'s round is its own`);
    dealt.push(t.board.length - before);
    seen.push(t.phase);
  }

  assert.deepEqual(seen, ['turn', 'river'], 'one street per advance, in order');
  assert.deepEqual(dealt, [1, 1], 'one card a street — none skipped, none doubled');
  e.dispose();
});
