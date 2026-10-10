/**
 * UI scale above 125%, without clipping.
 *
 * `.app` uses CSS zoom, so a scale of z lays the game out in (window / z) CSS
 * pixels, and the layout is built and tested down to 1024x680. The slider now
 * goes to 200%; what is applied is capped where the layout would drop under
 * that. `npm run responsive` with HEXHOLD_UI_SCALE=2 measures the result at
 * 1280x800 and 1920x1080 (STEAM-READY.md).
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { LAYOUT_MIN, UI_SCALE_MAX, appliedUiScale } from '../src/components/shell/videoPrefs';

const layoutAt = (z: number, w: number, h: number) => ({ width: w / z, height: h / z });

test('the slider reaches 200%', () => {
  assert.equal(UI_SCALE_MAX, 2);
});

test('on a Steam Deck the most that fits is 117%, and the layout stays at its minimum or above', () => {
  const z = appliedUiScale(2, 1280, 800);
  assert.equal(z, 1.17);
  const l = layoutAt(z, 1280, 800);
  assert.ok(l.width >= LAYOUT_MIN.width && l.height >= LAYOUT_MIN.height, JSON.stringify(l));
  // The old flat 125% cap laid a Deck out at 1024x640: under the minimum.
  assert.ok(layoutAt(1.25, 1280, 800).height < LAYOUT_MIN.height);
});

test('at 1080p up to 158%; at 1440p and 4K the full 200%', () => {
  assert.equal(appliedUiScale(2, 1920, 1080), 1.58);
  assert.equal(appliedUiScale(1.5, 1920, 1080), 1.5);
  assert.equal(appliedUiScale(2, 2560, 1440), 2);
  assert.equal(appliedUiScale(2, 3840, 2160), 2);
});

test('smaller is always honoured, and nothing goes wrong at or under the minimum window', () => {
  assert.equal(appliedUiScale(0.8, 1280, 800), 0.8);
  assert.equal(appliedUiScale(1, 1280, 800), 1);
  assert.equal(appliedUiScale(2, 1024, 680), 1);
  assert.equal(appliedUiScale(2, 900, 600), 1);
  assert.equal(appliedUiScale(2, 0, 0), 1);
  assert.equal(appliedUiScale(Number.NaN, 1920, 1080), 1);
  assert.equal(appliedUiScale(9, 3840, 2160), 2);
});
