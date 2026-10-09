/**
 * Window sizes mean real pixels, on any display scaling.
 *
 * Electron sizes windows in device-independent pixels (DIPs). The Video tab
 * labels its presets in pixels. Before 2026-10-09 the shell mixed the two: on a
 * 1440p screen at 125%, "1920×1080" made a 2400×1350 window, and on a 1080p
 * laptop at 150% every preset was filtered out, leaving an empty row. Also
 * checked here: the minimum window shrinks to fit a short screen, and the
 * release menu keeps macOS editing shortcuts without Reload or DevTools.
 */
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { test } from 'node:test';

type Size = { width: number; height: number };
const require = createRequire(import.meta.url);
const display = require('../electron/display.cjs') as {
  toDip(size: Size, sf: number): Size;
  toPixels(size: Size, sf: number): Size;
  fittingSizes(o: { workArea: Size; scaleFactor: number; frame?: Size; min?: Size }): Size[];
  frameOf(outer: Size, content: Size): Size;
  minWindowSize(areas: Size[]): Size;
  releaseMenuTemplate(platform: string): { role: string }[] | null;
};

const label = (s: Size[]) => s.map((z) => `${z.width}x${z.height}`);
const FRAME = { width: 16, height: 39 };

test('1080p at 100%: the presets that fit under the taskbar, in pixels', () => {
  const sizes = display.fittingSizes({ workArea: { width: 1920, height: 1032 }, scaleFactor: 1, frame: FRAME });
  assert.deepEqual(label(sizes), ['1280x720', '1280x800', '1366x768', '1600x900']);
});

test('1440p at 125%: "1920x1080" is a 1920x1080 window, not 2400x1350', () => {
  const sf = 1.25;
  const sizes = display.fittingSizes({ workArea: { width: 2048, height: 1104 }, scaleFactor: sf, frame: FRAME });
  assert.ok(label(sizes).includes('1920x1080'), label(sizes).join());
  const dip = display.toDip({ width: 1920, height: 1080 }, sf);
  assert.deepEqual(dip, { width: 1536, height: 864 });
  // What the shell applies, measured back in pixels, is what the button said.
  assert.deepEqual(display.toPixels(dip, sf), { width: 1920, height: 1080 });
  // Sizes that would be smaller than the layout's minimum window are not offered.
  assert.ok(!label(sizes).includes('1280x720'));
});

test('1080p at 150%: no impossible presets, and a minimum that fits the screen', () => {
  const area = { width: 1280, height: 672 };
  const sizes = display.fittingSizes({ workArea: area, scaleFactor: 1.5, frame: FRAME });
  // 1920x1080 is the whole screen; every smaller preset is under the minimum window.
  assert.deepEqual(sizes, []);
  assert.deepEqual(display.minWindowSize([area]), { width: 1024, height: 672 });
  assert.deepEqual(display.minWindowSize([{ width: 2560, height: 1392 }, area]), { width: 1024, height: 672 });
  assert.deepEqual(display.minWindowSize([]), { width: 1024, height: 680 });
});

test('a rounded size still reads as the preset that made it', () => {
  // 1366x768 at 150% is 910.67x512 DIPs; Electron keeps whole DIPs.
  const dip = display.toDip({ width: 1366, height: 768 }, 1.5);
  assert.deepEqual(display.toPixels(dip, 1.5), { width: 1366, height: 768 });
  assert.deepEqual(display.toPixels({ width: 1000, height: 700 }, 1), { width: 1000, height: 700 });
});

test('the frame is measured when it can be, and assumed when it cannot', () => {
  assert.deepEqual(display.frameOf({ width: 1296, height: 759 }, { width: 1280, height: 720 }), { width: 16, height: 39 });
  // Fullscreen: outer equals content, which would make every preset look like it fits.
  assert.deepEqual(display.frameOf({ width: 1920, height: 1080 }, { width: 1920, height: 1080 }), { width: 16, height: 40 });
});

test('release menu: none on Windows and Linux, editing roles only on macOS', () => {
  assert.equal(display.releaseMenuTemplate('win32'), null);
  assert.equal(display.releaseMenuTemplate('linux'), null);
  const mac = display.releaseMenuTemplate('darwin');
  assert.ok(mac);
  const roles = mac.map((m) => m.role);
  assert.ok(roles.includes('appMenu') && roles.includes('editMenu'), roles.join());
  // viewMenu is the one carrying reload and toggleDevTools.
  for (const banned of ['viewMenu', 'reload', 'forceReload', 'toggleDevTools']) assert.ok(!roles.includes(banned), banned);
});
