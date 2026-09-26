/**
 * Content that announces a rule has to implement one.
 *
 * An omen lands with a banner naming a permanent new rule, and a mark draws
 * itself on the card and sits in the reference under a blurb. Neither of those
 * is the rule. Four omens shipped that did nothing at all:
 *
 *   The Twinned   inscribed Mirrored on four cards. The evaluator reads wild,
 *                 prism, blooded, leaden, echo and cursed — not Mirrored — and
 *                 the two sigils that apply it copy the faces themselves and
 *                 carry the mark only as a tag. Nothing copied anything.
 *   The Kindling  inscribed Burning on five. Nothing burned; the client drew a
 *                 flame on a card that stayed on the board.
 *   The Binding
 *   The Bindings  inscribed Bound. Propagation keys off `entangledWith`, which
 *                 no omen set and which `clearHandMagic` wipes each hand.
 *
 * None of that fails a typecheck, a unit test or a build. Every one of those
 * omens was well formed, drew correctly, wrote a correct line to the log and
 * changed nothing. The Twinned was worse than inert: `opensImpossible` counts
 * it, so a run could spend its one guaranteed impossible-hand omen on a rule
 * that never fired, which is most of why a full run saw an impossible hand
 * only two times in five.
 *
 * A mark that nothing reads is the shape of that bug, and it is cheap to spot:
 * a mark the engine only ever pushes is a mark the engine does not act on.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { MARKS, type MarkId } from '../shared/cards';
import { OMENS, DUPLICATING_MARKS, opensImpossible } from '../shared/omens';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Where a mark can be acted on, as opposed to defined or drawn. */
const ENGINE_FILES = [
  'shared/hand.ts',
  'server/game/engine.ts',
  'server/game/magic.ts',
  'server/game/table.ts',
  'server/game/showdown.ts',
];

/**
 * A line that writes the mark (`marks.push('x')`, an fx carrying its id, the
 * guard in front of a push) is not the engine reading it. Strip those and see
 * whether anything is left.
 */
function readsMark(id: MarkId): boolean {
  for (const file of ENGINE_FILES) {
    for (const raw of src(file).split('\n')) {
      const line = raw.trim();
      if (!line.includes(`'${id}'`)) continue;
      if (line.startsWith('//') || line.startsWith('*')) continue;
      // Writing it, or guarding a write, or naming it in an effect for the client.
      if (/\.push\(|markId:|=== '|inscribe/.test(line)) continue;
      return true;
    }
  }
  return false;
}

test('every mark is read by something, not just drawn and pushed', () => {
  const inert: MarkId[] = [];
  for (const id of Object.keys(MARKS) as MarkId[]) {
    if (!readsMark(id)) inert.push(id);
  }
  assert.deepEqual(
    inert, [],
    `these marks are written but never acted on, so every omen and sigil that `
    + `applies them is inert: ${inert.join(', ')}`,
  );
});

test('every mark an omen inscribes is one the engine acts on', () => {
  const offenders: string[] = [];
  for (const o of OMENS) {
    const mark = o.deal?.inscribe?.markId;
    if (mark && !readsMark(mark)) offenders.push(`${o.name} (${mark})`);
  }
  assert.deepEqual(
    offenders, [],
    `these omens announce a permanent rule and change nothing: ${offenders.join(', ')}`,
  );
});

/**
 * The impossible-hand guarantee is only worth the marks behind it: a mark that
 * cannot put a second copy of a rank or suit into play cannot make one of the
 * hands the game is named after, however reliably the omen arrives.
 */
test('the marks that carry the impossible-hand promise all do something', () => {
  for (const mark of DUPLICATING_MARKS) {
    assert.ok(
      readsMark(mark),
      `${mark} is counted as opening the impossible hands but nothing reads it`,
    );
  }
  const promising = OMENS.filter(opensImpossible);
  assert.ok(promising.length >= 2, 'more than one omen can open the impossible hands');
  for (const o of promising) {
    const mark = o.deal!.inscribe!.markId;
    assert.ok(
      readsMark(mark),
      `${o.name} is allowed to satisfy the guarantee but its mark ${mark} is inert`,
    );
  }
});
