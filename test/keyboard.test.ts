/**
 * Steam's on-screen keyboard, from the page's side (playtest P8).
 *
 * A pad cannot type, and on a Steam Deck in Game Mode no keyboard appears
 * unless the game asks for one, so the Join code, a name and the Scribe were
 * dead ends on a controller. The shell side (electron/steam.cjs) is covered in
 * steam.test.ts; this covers when the page asks for it, against a fake bridge.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

type Req = { x: number; y: number; width: number; height: number; multiline: boolean };
type KeyboardModule = typeof import('../src/lib/steamKeyboard');

let dom: JSDOM;
let kb: KeyboardModule;
const asked: Req[] = [];
let answer = true;

function define(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true, enumerable: true });
}

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const w = dom.window;
  for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'FocusEvent', 'Event']) {
    define(k, k === 'window' ? w : (w as unknown as Record<string, unknown>)[k]);
  }
  (w as unknown as { hexhold: unknown }).hexhold = {
    steam: { showKeyboard: async (req: Req) => { asked.push(req); return answer; } },
  };
  kb = await import('../src/lib/steamKeyboard');
});

after(() => dom.window.close());

beforeEach(() => {
  asked.length = 0;
  answer = true;
  document.body.innerHTML = `
    <button id="join">Join a Table</button>
    <input id="code" placeholder="Table code">
    <input id="volume" type="range">
    <textarea id="scribe"></textarea>
    <input id="locked" readonly>`;
  (document.activeElement as HTMLElement | null)?.blur?.();
});

const el = (id: string) => document.getElementById(id) as HTMLElement;
const settle = () => new Promise((r) => setTimeout(r, 0));

test('A on a focused text field opens Steam\'s keyboard beside it', async () => {
  const code = el('code');
  code.getBoundingClientRect = () => ({ left: 400, top: 300, width: 320, height: 40 }) as DOMRect;
  assert.equal(await kb.openSteamKeyboard(code), true);
  assert.deepEqual(asked, [{ x: 400, y: 300, width: 320, height: 40, multiline: false }]);
});

test('the Scribe\'s textarea gets the multi-line keyboard', async () => {
  assert.equal(await kb.openSteamKeyboard(el('scribe')), true);
  assert.equal(asked[0]?.multiline, true);
});

test('only fields that take text: not a slider, a button or a read-only field', async () => {
  for (const id of ['volume', 'join', 'locked']) assert.equal(await kb.openSteamKeyboard(el(id)), false, id);
  assert.equal(asked.length, 0);
});

test('with a pad in use, a field that takes focus (a panel opening on it) opens the keyboard', async () => {
  const stop = kb.startSteamKeyboard(() => true);
  try {
    el('code').focus();
    await settle();
    assert.equal(asked.length, 1);
  } finally { stop(); }
});

test('the d-pad passing over a field does not throw the keyboard up', async () => {
  const stop = kb.startSteamKeyboard(() => true);
  try {
    kb.focusQuietly(el('code'));
    await settle();
    assert.equal(document.activeElement, el('code'), 'focus still moved');
    assert.equal(asked.length, 0);
  } finally { stop(); }
});

test('with a mouse and keyboard, focusing a field never asks for a keyboard', async () => {
  const stop = kb.startSteamKeyboard(() => false);
  try {
    el('code').focus();
    el('scribe').focus();
    await settle();
    assert.equal(asked.length, 0);
  } finally { stop(); }
});

test('a finger tapping a field opens it even before any pad button (Deck touchscreen)', async () => {
  const stop = kb.startSteamKeyboard(() => false);
  try {
    const tap = new dom.window.Event('pointerdown', { bubbles: true });
    Object.defineProperty(tap, 'pointerType', { value: 'touch' });
    el('code').dispatchEvent(tap);
    el('code').focus();
    await settle();
    assert.equal(asked.length, 1);
  } finally { stop(); }
});

test('no Steam: the page carries on, and nothing throws', async () => {
  answer = false;
  assert.equal(await kb.openSteamKeyboard(el('code')), false);
  const bridge = (window as unknown as { hexhold: { steam: unknown } }).hexhold;
  const saved = bridge.steam;
  bridge.steam = undefined;
  try {
    assert.equal(await kb.openSteamKeyboard(el('code')), false);
  } finally { bridge.steam = saved; }
});
