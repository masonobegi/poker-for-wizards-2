/**
 * Button prompts name what is printed on the pad in hand.
 *
 * The Standard Gamepad mapping numbers buttons by position, so the bottom face
 * button is A on an Xbox pad and a Steam Deck, Cross on a PlayStation pad and
 * B on a Nintendo one. Before 2026-10-09 every prompt said A/B/X/Y and LB/RB,
 * which on a DualSense names buttons that do not exist.
 *
 * The id strings below are the shapes Chromium reports: "Name (STANDARD
 * GAMEPAD Vendor: vvvv Product: pppp)" on Windows and macOS, "vvvv-pppp-Name"
 * on Linux and the Deck, and the XInput form for Xbox pads on Windows.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

import { PAD_GLYPHS, padFamily } from '../src/lib/gamepad';

test('PlayStation pads are recognised by Sony\'s vendor id and by name', () => {
  for (const id of [
    'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
    'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', // DualShock 4 v2
    '054c-0ce6-Sony Interactive Entertainment Wireless Controller', // Linux / Deck
    '054c-05c4-Sony Computer Entertainment Wireless Controller',
    'Wireless Controller', // Sony's bare name with the vendor hidden
    'PS5 Controller',
  ]) assert.equal(padFamily(id), 'playstation', id);
});

test('Xbox pads, the Steam Deck and Steam Input\'s virtual pad keep Xbox labels', () => {
  for (const id of [
    'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
    'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    '045e-028e-Microsoft X-Box 360 pad',
    '28de-1205-Valve Software Steam Deck Controller',
    '28de-11ff-Microsoft X-Box 360 pad 0', // Steam Input's virtual pad
    '', // no id at all
  ]) assert.equal(padFamily(id), 'xbox', id);
});

test('Nintendo pads are recognised, and a product id that merely contains 054c is not Sony', () => {
  assert.equal(padFamily('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)'), 'nintendo');
  assert.equal(padFamily('057e-2009-Nintendo Switch Pro Controller'), 'nintendo');
  assert.equal(padFamily('Generic (STANDARD GAMEPAD Vendor: 1234 Product: a054c)'), 'xbox');
});

test('each family labels the same positions with its own printed names', () => {
  assert.deepEqual([PAD_GLYPHS.xbox.a, PAD_GLYPHS.xbox.lb, PAD_GLYPHS.xbox.y], ['Ⓐ', 'LB', 'Ⓨ']);
  assert.deepEqual([PAD_GLYPHS.playstation.a, PAD_GLYPHS.playstation.b, PAD_GLYPHS.playstation.x, PAD_GLYPHS.playstation.y], ['✕', '○', '□', '△']);
  assert.deepEqual([PAD_GLYPHS.playstation.lb, PAD_GLYPHS.playstation.rb, PAD_GLYPHS.playstation.start], ['L1', 'R1', 'Options']);
  // Nintendo prints B at the bottom: same press, different letter.
  assert.equal(PAD_GLYPHS.nintendo.a, 'Ⓑ');
  for (const set of Object.values(PAD_GLYPHS)) {
    assert.equal(Object.keys(set).length, Object.keys(PAD_GLYPHS.xbox).length, 'a family is missing a button');
  }
});

test('plugging in a DualSense turns the on-screen prompts into PlayStation ones', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
  const w = dom.window as unknown as Window & typeof globalThis;
  const keep: Record<string, unknown> = {};
  const define = (k: string, v: unknown) => {
    keep[k] = (globalThis as Record<string, unknown>)[k];
    Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
  };
  define('window', w);
  define('document', w.document);
  define('navigator', w.navigator);
  define('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(performance.now()), 5) as unknown as number);
  define('cancelAnimationFrame', (id: number) => clearTimeout(id));
  const pads: Array<Gamepad | null> = [null];
  Object.defineProperty(w.navigator, 'getGamepads', { value: () => pads, configurable: true });
  try {
    const { startGamepad, currentPadFamily } = await import('../src/lib/gamepad');
    const stop = startGamepad();
    // A DualSense with Cross held down.
    const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0, touched: i === 0, value: i === 0 ? 1 : 0 }));
    pads[0] = { id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', connected: true, buttons, axes: [0, 0, 0, 0] } as unknown as Gamepad;
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(currentPadFamily(), 'playstation');
    assert.equal(w.document.documentElement.dataset.padFamily, 'playstation');
    // Then an Xbox pad takes over.
    pads[0] = { ...pads[0], id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)' } as Gamepad;
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(currentPadFamily(), 'xbox');
    stop();
  } finally {
    for (const [k, v] of Object.entries(keep)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
    dom.window.close();
  }
});
