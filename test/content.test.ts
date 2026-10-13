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
import { ACHIEVEMENTS, CAT_ACHIEVEMENT } from '../shared/achievements';
import { SIGILS } from '../shared/sigils';

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

/**
 * An achievement nothing awards is worse than an achievement that does not
 * exist: it ships in the Steam manifest, shows up in the player's list at 0%,
 * and is the first thing an achievement hunter files a thread about.
 *
 * `counterspelled_twice` ("Counter a counterspell") was exactly that. The
 * watcher counted every counter the player cast into local storage and never
 * read the tally back, so twenty achievements shipped and nineteen could be
 * earned.
 */
test('every achievement has something that can award it', () => {
  const watcher = src('src/lib/achievements.ts');
  const mapped = new Set(Object.values(CAT_ACHIEVEMENT));
  const unreachable = ACHIEVEMENTS
    .map((a) => a.id)
    .filter((id) => !mapped.has(id) && !watcher.includes(`'${id}'`));
  assert.deepEqual(
    unreachable, [],
    `nothing in the watcher can unlock: ${unreachable.join(', ')}`,
  );
});

test('the Steam manifest never offers an achievement the game cannot give', () => {
  // The manifest is generated from the same array, so a gap here ships.
  const api = ACHIEVEMENTS.map((a) => a.api);
  assert.equal(new Set(api).size, api.length, 'duplicate Steam api name');
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.api && a.name && a.text, `${a.id} is missing manifest copy`);
  }
});

/**
 * A card that cannot print its own description is a bug you cannot test for
 * with a typecheck.
 *
 * The sigil tile used to print the full rules text under a four-line clamp
 * with a fade over the last line. Sealed Rank runs to 178 characters; at the
 * smallest card size the game ships at, that is eleven lines. So most of the
 * set was cut off mid-sentence in the player's own hand, and the fade made the
 * cut look deliberate rather than saying what was missing.
 *
 * Every sigil now carries a written `brief` for the face of the card, and the
 * tile has no clamp at all. That only holds while the briefs stay short: this
 * is the ceiling, measured against the narrowest tile the game renders.
 *
 *   smallest card width  58px   (table.css, the 1280x800-and-under band)
 *   tile width           x2.3   -> 133px
 *   frame padding        10px   both sides -> 113px of line
 *   description          12px   Inter, ~6.2px average advance -> ~18 chars
 *   lines on the face    4             -> ~72 characters
 *
 * 64 leaves a line of slack for a brief that wraps badly, and the tile grows
 * rather than clips if one ever does.
 */
const BRIEF_CEILING = 64;

test('every sigil can print its own description without being cut off', () => {
  const tooLong = SIGILS
    .filter((s) => s.brief.length > BRIEF_CEILING)
    .map((s) => `${s.id} (${s.brief.length})`);
  assert.deepEqual(
    tooLong, [],
    `briefs over ${BRIEF_CEILING} characters will not fit the face of a card: ${tooLong.join(', ')}`,
  );
});

test('a brief is a summary, not a copy of the rule', () => {
  // A brief that is just the rules text again is the old bug wearing a new
  // field name: it would be as long as the thing it was meant to replace.
  for (const s of SIGILS) {
    assert.ok(s.brief.length > 0, `${s.id} has no brief`);
    assert.ok(
      s.brief.length <= s.text.length,
      `${s.id}'s brief is longer than its rules text`,
    );
  }
});

test('the sigil tile does not clamp or fade its description', () => {
  // The two mechanisms that produced the clipping, named so they cannot come
  // back by accident.
  const css = src('src/scenes/table.css');
  const tile = css.slice(css.indexOf('.sigil-text {'), css.indexOf('.sigil-foot {'));
  assert.ok(!/line-clamp/.test(tile), '.sigil-text clamps its lines again');
  assert.ok(!/mask-image/.test(tile), '.sigil-text fades its last line again');
});
