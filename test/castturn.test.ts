/**
 * A sigil is an action, and the turn reaches everyone who can take one.
 *
 * "When I'm all in the turn should still come to me in case I play spells,
 * but I shouldn't be able to just play spells at any time." Two halves of one
 * rule, and neither works without the other:
 *
 *   - Casting was legal at any moment of any street, for anyone still in the
 *     hand. The betting order decided nothing for half the game and the last
 *     word went to whoever clicked fastest.
 *   - An all-in player was skipped outright, which is right when a turn is
 *     only for betting and wrong here, because a sigil costs mana rather than
 *     chips. Gate casting on the turn alone and they could never cast again.
 *
 * So the turn now reaches an all-in player, their only move is to pass, and a
 * cast has to happen on your own turn — except a response, which is the one
 * thing that must happen out of turn.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { castBlock } from '../server/game/table';
import { DEFAULT_CONFIG, type Player, type Table } from '../shared/types';

interface Internals { beginHand(): void }

function table(seed: string): { e: Engine; t: Table; ix: Internals } {
  const e = new Engine('TURN', 'host', { ...DEFAULT_CONFIG, seed }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  e.addBot();
  e.addBot();
  e.start();
  e.dispose();
  return { e, t: e.table, ix: e as unknown as Internals };
}

const give = (p: Player, defId: string, uid = 'x'): string => {
  p.sigils = [{ uid, defId }];
  p.mana = 9;
  return uid;
};

test('a sigil cannot be cast while the table is on somebody else', () => {
  const { e, t } = table('turn:not-yours');
  const me = t.players[0];
  const them = t.players[1];
  t.phase = 'flop';
  t.stack = null;
  give(me, 'burn');

  t.actingId = them.id;
  assert.deepEqual(castBlock(t, me, me.sigils[0]), { why: 'turn' },
    'a sigil was castable on somebody else\'s turn');

  t.actingId = me.id;
  assert.equal(castBlock(t, me, me.sigils[0]), null, 'and not castable on its owner\'s');
  e.dispose();
});

test('a response is exempt: that is what the answer window is for', () => {
  const { e, t } = table('turn:response');
  const me = t.players[0];
  const them = t.players[1];
  t.phase = 'flop';
  // Targetless and castable on any street, so the fixture does not have to
  // stage a board or a particular street for it.
  give(them, 'second_sight', 'b');
  give(me, 'nullify', 'n');

  // Them, on their turn, casts something answerable.
  t.actingId = them.id;
  const open = e.cast(them.id, 'b', {});
  assert.ok(open.ok, `the opening cast was refused: ${open.error}`);
  assert.ok(t.stack, 'the opening cast did not open a stack');

  // The window is open and it is emphatically not our turn.
  assert.notEqual(t.actingId, me.id);
  if (t.stack?.pending.includes(me.id)) {
    assert.equal(castBlock(t, me, me.sigils[0]), null,
      'a Nullify was refused in the one window it exists for');
  }
  e.dispose();
});

test('an all-in player is still dealt a turn', () => {
  const { e, t } = table('turn:allin');
  const me = t.players[0];
  me.allIn = true;
  me.chips = 0;
  t.phase = 'flop';
  t.actedThisStreet = new Set();

  // Walk the street. Everyone still in the hand has to get the clock.
  const seen = new Set<string>();
  for (let i = 0; i < 40 && t.actingId; i++) {
    seen.add(t.actingId);
    const who = t.players.find((p) => p.id === t.actingId)!;
    if (!e.act(who.id, { kind: 'check' }).ok) e.act(who.id, { kind: 'call' });
    if (t.phase !== 'flop') break;
  }
  assert.ok(seen.has(me.id), 'the turn never reached the all-in player');
  e.dispose();
});

test('an all-in player may pass and nothing else', () => {
  const { e, t } = table('turn:allin-actions');
  const me = t.players[0];
  me.allIn = true;
  me.chips = 0;
  t.phase = 'flop';
  t.actingId = me.id;
  t.currentBet = 500;
  me.bet = 0;

  // Nothing that moves chips.
  for (const kind of ['bet', 'raise', 'call'] as const) {
    const r = e.act(me.id, { kind, amount: 1000 });
    assert.equal(r.ok, false, `an all-in player was allowed to ${kind}`);
    assert.match(r.error ?? '', /all in/i);
  }

  // A pass, which is legal even against a bet they cannot match.
  assert.ok(e.act(me.id, { kind: 'check' }).ok, 'an all-in player could not pass');
  assert.ok(t.actedThisStreet.has(me.id), 'the pass was not recorded');
  assert.equal(me.chips, 0, 'passing cost chips');
  e.dispose();
});
