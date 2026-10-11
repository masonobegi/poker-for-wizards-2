/**
 * The arcade impact layer (src/components/fx/arcade.ts), ported 2026-10-11
 * from the basketball roguelike's cut-ins.
 *
 * The motion invariants in motion.test.ts read stylesheets and JSX. These read
 * the keyframes the code actually builds, because the rules that matter here —
 * reduced motion keeps the cue and drops the movement, reduce flashing caps
 * the white, nothing appears from scale(0) — live in functions, not in CSS.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// BannerLayer imports its stylesheet; Node cannot load CSS.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    return next(spec, ctx);
  },
});

const arcade = await import('../src/components/fx/arcade');
const { FLASH_PEAK, FLASH_SOFT, punchPlan, slamMotion, countUpValue, SLAM_EXIT } = arcade;
type Prefs = import('../src/components/fx/arcade').MotionPrefs;

const FULL: Prefs = { reduced: false, noFlash: false };
const NO_FLASH: Prefs = { reduced: false, noFlash: true };
const REDUCED: Prefs = { reduced: true, noFlash: true };

const brightness = (frames: Keyframe[]): number =>
  Math.max(...frames.map((f) => Number(/brightness\(([\d.]+)\)/.exec(String(f.filter))?.[1] ?? 1)));
const scales = (frames: Keyframe[] | null): number[] =>
  (frames ?? []).flatMap((f) => [...String(f.transform).matchAll(/scale\(([^)]*)\)/g)]
    .flatMap((m) => m[1].split(',').map(Number)));

test('a punch keeps its cue under reduced motion, and is never louder there', () => {
  for (const kind of ['relic', 'impact', 'land'] as const) {
    const full = punchPlan(kind, FULL);
    const calm = punchPlan(kind, REDUCED);
    assert.equal(calm.transform, null, `${kind}: reduced motion still moves`);
    assert.ok(brightness(calm.filter) > 1, `${kind}: reduced motion deleted the cue`);
    assert.ok(brightness(calm.filter) <= brightness(full.filter), `${kind}: reduced motion made it louder`);
    assert.ok(calm.filterMs <= full.filterMs, `${kind}: reduced motion made it longer`);
  }
});

test('reduce flashing caps the white and keeps the movement', () => {
  for (const kind of ['relic', 'impact', 'land'] as const) {
    const plan = punchPlan(kind, NO_FLASH);
    assert.ok(brightness(plan.filter) <= FLASH_SOFT, `${kind}: ${brightness(plan.filter)} is a flash`);
    assert.ok(plan.transform, `${kind}: reduce flashing removed the movement too`);
    assert.ok(brightness(punchPlan(kind, FULL).filter) <= FLASH_PEAK);
  }
});

test('nothing punches or slams from nothing', () => {
  for (const kind of ['relic', 'impact', 'land'] as const) {
    for (const s of scales(punchPlan(kind, FULL).transform)) assert.ok(s >= 0.5, `${kind} reaches scale ${s}`);
  }
  for (const from of [1.8, 2.4, 3]) {
    const m = slamMotion(FULL, { from });
    assert.match(String((m.initial as Record<string, unknown>).transform), new RegExp(`scale\\(${from}\\)`));
  }
});

test('an impact frame is short enough to read as a hit, not a light', () => {
  const plan = punchPlan('impact', FULL);
  // The basketball `_hit_flash`: 3 frames held, 80ms fade. Same order here.
  assert.ok(plan.filterMs <= 160, `impact flash lasts ${plan.filterMs}ms`);
  assert.ok(plan.transformMs <= 300, `impact squash lasts ${plan.transformMs}ms`);
});

test('a slam under reduced motion is a fade with no movement and no flash', () => {
  const m = slamMotion(REDUCED, { from: 3, rotate: -8 });
  const init = m.initial as Record<string, unknown>;
  const anim = m.animate as Record<string, unknown>;
  assert.equal(init.transform, anim.transform, 'reduced slam still scales');
  assert.equal(init.filter, undefined);
  assert.equal(anim.filter, undefined);
  assert.equal(init.opacity, 0);
  assert.equal(anim.opacity, 1, 'reduced slam deleted the word');
});

test('a slam keeps its resting tilt through the whole animation', () => {
  const m = slamMotion(FULL, { rotate: -9 });
  for (const v of [m.initial, m.animate, m.exit] as Array<Record<string, unknown>>) {
    assert.match(String(v.transform), /rotate\(-9deg\)/);
  }
  assert.match(String((m.exit as Record<string, unknown>).transform), new RegExp(`scale\\(${SLAM_EXIT.x}, ${SLAM_EXIT.y}\\)`));
});

test('a slam under reduce flashing does not white out', () => {
  const m = slamMotion(NO_FLASH);
  const f = (m.animate as Record<string, unknown>).filter as string[];
  for (const v of f) assert.ok(Number(/brightness\(([\d.]+)\)/.exec(v)?.[1]) <= FLASH_SOFT);
});

test('a count-up starts at zero, lands exactly, and races first', () => {
  assert.equal(countUpValue(0, 4200, 0, 900), 0);
  assert.equal(countUpValue(0, 4200, 900, 900), 4200);
  assert.equal(countUpValue(0, 4200, 5000, 900), 4200);
  assert.equal(countUpValue(0, 4200, 10, 0), 4200);
  let prev = -1;
  for (let t = 0; t <= 900; t += 30) {
    const v = countUpValue(0, 4200, t, 900);
    assert.ok(v >= prev, 'a count-up went backwards');
    prev = v;
  }
  assert.ok(countUpValue(0, 4200, 450, 900) > 4200 * 0.75, 'not eased out: the digits should race first');
});

test('relic triggers come from new ledger lines only', async () => {
  const { createRelicWatcher } = await import('../src/lib/relicTriggers');
  const { RELICS } = await import('../shared/relics');
  const relic = RELICS[0].id;
  const watch = createRelicWatcher();
  const line = (id: string, extra: Record<string, unknown> = {}) => ({ id, at: 0, tone: 'magic', text: id, ...extra });
  const view = (code: string, log: unknown[]) => ({ code, log }) as unknown as import('../shared/types').TableView;

  // Joining (or reloading) mid-run learns the ledger without replaying it.
  assert.deepEqual(watch(view('AAAA', [line('a', { rule: relic, playerId: 'p1' })])), []);
  // A new tagged line fires once.
  const fired = watch(view('AAAA', [line('a', { rule: relic, playerId: 'p1' }), line('b', { rule: relic, playerId: 'p2' })]));
  assert.deepEqual(fired, [{ t: 'relic', playerId: 'p2', relicId: relic }]);
  assert.deepEqual(watch(view('AAAA', [line('b', { rule: relic, playerId: 'p2' })])), [], 'replayed a trigger');
  // Untagged lines, and rules that are not a relic, are not triggers.
  assert.deepEqual(watch(view('AAAA', [line('c'), line('d', { rule: 'not_a_relic', playerId: 'p1' })])), []);
  // A different table starts over.
  assert.deepEqual(watch(view('BBBB', [line('e', { rule: relic, playerId: 'p1' })])), []);
});

test('the cut-in banner: the impossible tones do not double the server shake', async () => {
  const { SLAM_FROM, SLAM_SHAKE, SKIP_GUARD_MS } = await import('../src/components/BannerLayer');
  // The server shakes for an impossible hand and for an omen; a second shake
  // landing 140ms later reads as a stutter.
  assert.deepEqual(SLAM_SHAKE.impossible, [0, 0]);
  for (const [tone, from] of Object.entries(SLAM_FROM)) {
    assert.ok(from >= 1, `${tone} starts smaller than it ends`);
    assert.ok(from <= 3.4, `${tone} starts bigger than the basketball callouts`);
  }
  for (const [tone, [px, ms]] of Object.entries(SLAM_SHAKE)) {
    assert.ok(px <= 12 && ms <= 260, `${tone}: a ${px}px/${ms}ms hit is not a tap`);
  }
  assert.ok(SKIP_GUARD_MS >= 80, 'the click that raised a banner could skip it');
});
