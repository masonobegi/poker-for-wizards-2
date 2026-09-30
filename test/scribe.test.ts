/**
 * The spell reader.
 *
 * Built the way the sports sites test their Ask box: a bank of phrasings,
 * each with the reading it must produce, and every phrasing re-run under the
 * noise real typing adds — capitals, filler, a missing apostrophe. A reading
 * that is confidently wrong is worse than a refusal, so the assertions check
 * WHICH effect and WHICH target, not just that something came back.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  COMBO_MANA, EACH_MULT, INK_SHARDS, MAX_COST, SCRIBE_PRESETS, readSpell, type Roster,
} from '../shared/scribe';
import { SIGILS, SIGIL_BY_ID } from '../shared/sigils';
import { Rng } from '../shared/rng';

const roster: Roster = {
  selfId: 'me',
  players: [
    { id: 'me', name: 'Adept' }, { id: 'w', name: 'Wren' },
    { id: 'm', name: 'Mordent' }, { id: 's', name: 'Sable' },
  ],
};

/** phrase → [sigil, target summary] per clause. Summary is the chip text after the arrow. */
const BANK: Array<[string, Array<[string, string?]>]> = [
  ["see the chip leader's cards", [['cold_read', 'the chip leader']]],
  ['look at wrens hand', [['cold_read', 'Wren']]],
  ['read sable\'s cards', [['cold_read', 'Sable']]],
  ['burn the river', [['burn', 'the river']]],
  ['destroy the turn', [['burn', 'the turn']]],
  ['burn the river and the turn', [['burn', 'the river'], ['burn', 'the turn']]],
  ['burn the highest community card', [['burn', 'the highest community card']]],
  ['make my worst card wild', [['wild_rite', 'your worst card']]],
  ['turn my lowest card wild', [['wild_rite', 'your worst card']]],
  ['hex whoever raised last', [['hex', 'whoever bet last']]],
  ['curse the chip leader', [['hex', 'the chip leader']]],
  ['hex everyone', [['hex', 'every opponent']]],
  ["drain everyone's mana", [['sever', 'every opponent']]],
  ["drain mordent's mana", [['sever', 'Mordent']]],
  ['steal a sigil from the short stack', [['larceny', 'the short stack']]],
  ['seal kings', [['sealed_rank', 'Kings']]],
  ['strike all the sevens', [['unmake', 'Sevens']]],
  ['look at the next three cards', [['second_sight']]],
  ['see the river', [['foresight']]],
  ['draw two sigils', [['second_wind']]],
  ['protect my cards', [['gloaming']]],
  ['amber the river', [['amber', 'the river']]],
  ['make my best card a copy of the river', [['mirror', 'the river, your best card']]],
  ['mirror the river onto my worst card', [['mirror', 'the river, your worst card']]],
  ['entangle my best card and the river', [['entangle', 'your best card, the river']]],
  ['split my worst card', [['superpose', 'your worst card']]],
  ['fracture sable\'s best card', [['fracture', "Sable's best card"]]],
  ['transmute my worst card to hearts', [['transmute', 'your worst card, Hearts']]],
  ['inscribe wild on my worst card', [['inscribe', 'your worst card, Wild']]],
  ['deal a sixth card', [['sixth_card']]],
  ['rewind the last card', [['rewind']]],
  ['one more round of betting', [['stall']]],
  ['swap my worst card with the top of the deck', [['quantum_leap', 'your worst card']]],
  ['burn the river and see wren\'s cards', [['burn', 'the river'], ['cold_read', 'Wren']]],
  ['cold read wren, then steal her sigils', [['cold_read', 'Wren'], ['larceny', 'Wren']]],
  ['split my worst card then read the leader\'s hand', [['superpose', 'your worst card'], ['cold_read', 'the chip leader']]],
  ['hex mordant', [['hex', 'Mordent']]],

  // Found by writing sentences the way a player would, not the way the
  // tables were written. Each one was misread or refused before.
  ['get rid of the turn', [['burn', 'the turn']]],
  ['blow up the highest card on the board', [['burn', 'the highest community card']]],
  ['i want to see what wren has', [['cold_read', 'Wren']]],
  ['what is sable holding', [['cold_read', 'Sable']]],
  ["reveal everybody's hands", [['cold_read', 'every opponent']]],
  ['peek at the deck', [['second_sight']]],
  ['make my cards wild', [['wild_rite', 'your first card'], ['wild_rite', 'your second card']]],
  ['turn my 2 into a wild card', [['wild_rite', 'your Two']]],
  ['make my king wild', [['wild_rite', 'your King']]],
  ['give me an extra card', [['conjure']]],
  ['give me more mana', [['borrowed_time']]],
  ['take a sigil from the chip leader', [['larceny', 'the chip leader']]],
  ["make the chip leader's hand worse", [['hex', 'the chip leader']]],
  ['trade my worst card with sable', [['yoke', 'Sable']]],
  ['copy the river into my hand', [['counterfeit', 'the river']]],
  ['duplicate my best card', [['graft']]],
  ['make the river match my best card', [['mirror', 'your best card, the river']]],
  ['make the board invisible', [['nightfall']]],
  ['give me a new river', [['rewind']]],
  ['deal an extra river', [['sixth_card']]],
  ['collapse everything', [['observer_effect']]],
  ['make all undecided cards land on their best face', [['cascade']]],
  ['merge my cards', [['weld', 'your first card, your second card']]],
  ['tax everyone', [['tithe']]],
  ['burn the turn and river', [['burn', 'the turn'], ['burn', 'the river']]],
  ['hex wren and sable', [['hex', 'Wren'], ['hex', 'Sable']]],
  ["read wren and sable's cards", [['cold_read', 'Wren'], ['cold_read', 'Sable']]],
  ['make my worst card wild and protect it', [['wild_rite', 'your worst card'], ['amber', 'your worst card']]],
  ['turn my worst card into a spade', [['transmute', 'your worst card, Spades']]],
];

/** Things the reader must refuse rather than guess at. */
const REFUSE: string[] = [
  'i win the pot', 'give me all the chips', 'eliminate wren', 'counter their spell', 'dance a jig',
  'unmake', 'hex me', 'burn the river, burn the turn, burn the flop, draw two sigils',
  '', '   ', 'drain every opponent\'s mana and hex everyone',
  'foresight and sixth card',
  // A nearby effect would do something else; these must be refused instead.
  'make my card an ace', 'make every heart a spade',
];

/** The same kinds of noise the sports bank adds. */
function variants(q: string, seed: number): string[] {
  const r = new Rng(`scribe:${seed}`);
  const openers = ['', 'please ', 'can you ', 'i want to ', 'ok ', 'let me '];
  const closers = ['', '!', ' please', '?', ' lol', '.'];
  return [
    q,
    q.toUpperCase(),
    q.replace(/'/g, ''),
    q.replace(/'/g, '’'),
    `${r.pick(openers)}${q}${r.pick(closers)}`,
    `${r.pick(openers)}${q.charAt(0).toUpperCase()}${q.slice(1)}${r.pick(closers)}`,
  ];
}

test('every phrasing in the bank reads as its expected effects and targets, under noise', () => {
  for (const [i, [q, want]] of BANK.entries()) {
    for (const v of variants(q, i)) {
      const r = readSpell(v, roster);
      assert.ok(r.ok, `"${v}" was refused: ${r.error}`);
      const got = r.spell!.clauses.map((c) => c.sigil);
      assert.deepEqual(got, want.map(([id]) => id), `"${v}" read as ${got.join(', ')}`);
      for (const [k, [, target]] of want.entries()) {
        if (!target) continue;
        const chip = r.understood[k].split(' → ')[1] ?? '';
        assert.equal(chip, target, `"${v}", clause ${k + 1}`);
      }
    }
  }
});

test('what no sigil can do is refused with a sentence, never guessed', () => {
  for (const q of REFUSE) {
    const r = readSpell(q, roster);
    assert.equal(r.ok, false, `"${q}" should be refused, read as ${r.understood.join(' | ')}`);
    assert.ok(r.error && r.error.length > 10, `"${q}" refused without saying why`);
  }
  // The generic miss points the player at the ready-made spells.
  assert.match(readSpell('dance a jig', roster).error!, /pick one of the ready-made/);
});

test('every guess and every ignored word is said out loud', () => {
  assert.ok(readSpell('hex mordant', roster).notes.some((n) => /Read "mordant" as Mordent/.test(n)));
  assert.ok(readSpell('burn', roster).notes.some((n) => /No card named/.test(n)));
  assert.ok(readSpell('hex', roster).notes.some((n) => /chip leader/.test(n)));
  assert.ok(readSpell('burn the river gracefully', roster).notes.some((n) => /Ignored "gracefully"/.test(n)));
});

test('the ready-made spells all read, and are all affordable in mana', () => {
  for (const p of SCRIBE_PRESETS) {
    const r = readSpell(p.text, roster);
    assert.ok(r.ok, `preset "${p.label}" fails: ${r.error}`);
    assert.ok(r.spell!.cost <= MAX_COST);
    assert.equal(r.notes.filter((n) => n.startsWith('Ignored')).length, 0, `preset "${p.label}" wastes words`);
  }
});

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

test('a sigil written as its own name costs exactly that sigil, plus ink', () => {
  for (const d of SIGILS) {
    if (d.timing.includes('response')) continue;
    const r = readSpell(d.name, roster);
    if (!r.ok) continue; // rank and two-card sigils need more words than a name
    assert.equal(r.spell!.clauses.length, 1, d.name);
    assert.equal(r.spell!.clauses[0].sigil, d.id, `"${d.name}" read as ${r.spell!.clauses[0].sigil}`);
    const each = r.spell!.clauses[0].who?.k === 'each';
    if (each) continue;
    assert.equal(r.spell!.cost, d.cost, `${d.name} mana`);
    assert.equal(r.spell!.price, d.price + INK_SHARDS, `${d.name} shards`);
  }
});

test('every printed sigil can be written by its own name', () => {
  const unreadable = SIGILS
    .filter((d) => !d.timing.includes('response'))
    .filter((d) => {
      const extra = d.target === 'rank' ? ' kings'
        : d.target === 'two_cards' ? ' the river and my best card'
          : d.id === 'transmute' ? ' my worst card to hearts' : '';
      const r = readSpell(`${d.name}${extra}`, roster);
      return !r.ok || r.spell!.clauses[0].sigil !== d.id;
    })
    .map((d) => d.name);
  assert.deepEqual(unreadable, []);
});

test('combining and aiming at everyone always costs more than the parts', () => {
  const burn = SIGIL_BY_ID.burn.cost;
  const read = SIGIL_BY_ID.cold_read.cost;
  assert.equal(readSpell("burn the river and see wren's cards", roster).spell!.cost, burn + read + COMBO_MANA);
  assert.equal(readSpell('hex everyone', roster).spell!.cost, SIGIL_BY_ID.hex.cost * EACH_MULT);
  // No wording buys a discount: the same effects cost the same however said.
  const a = readSpell('burn the river then look at the next three cards', roster).spell!;
  const b = readSpell('LOOK AT THE NEXT THREE CARDS, and burn the river please', roster).spell!;
  assert.equal(a.cost, b.cost);
  assert.equal(a.price, b.price);
});
