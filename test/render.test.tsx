/**
 * Does the interface actually mount?
 *
 * Type checking proves the props line up; it does not prove that a component
 * renders without throwing, that an import resolves at runtime, or that a
 * card with an exotic state reaches the DOM. This boots a real DOM, mounts the
 * real components against real game state, and asserts what ends up on screen.
 *
 * Canvas and WebAudio are absent under jsdom on purpose — the audio and VFX
 * layers are meant to degrade to nothing, and this is where that gets proven.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';

// Components import their own stylesheets. Vite handles that; Node does not,
// so stub every .css import out to an empty module.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.endsWith('.css')) {
      return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    }
    return next(spec, ctx);
  },
});

let dom: JSDOM;
let container: HTMLElement;

/** Several DOM globals are getter-only in modern Node; assignment throws. */
function define(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    value, writable: true, configurable: true, enumerable: true,
  });
}

before(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:5173/',
    pretendToBeVisual: true,
  });

  const matchMedia = (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
  dom.window.matchMedia = matchMedia as unknown as typeof dom.window.matchMedia;

  define('window', dom.window);
  // Without this, `profile.ts` — which uses the bare identifier — throws on
  // every read and write, its try/catch swallows it, and the profile tests
  // below pass against no storage whatsoever.
  define('localStorage', dom.window.localStorage);
  define('document', dom.window.document);
  define('navigator', dom.window.navigator);
  define('HTMLElement', dom.window.HTMLElement);
  define('Element', dom.window.Element);
  define('Node', dom.window.Node);
  define('SVGElement', dom.window.SVGElement);
  define('CSS', dom.window.CSS ?? { escape: (s: string) => s });
  // framer-motion's hover gesture passes an AbortSignal to addEventListener.
  // jsdom type-checks it against its own realm, so Node's must not win here.
  define('AbortController', dom.window.AbortController);
  define('AbortSignal', dom.window.AbortSignal);
  define('Event', dom.window.Event);
  define('CustomEvent', dom.window.CustomEvent);
  define('PointerEvent', dom.window.PointerEvent ?? dom.window.MouseEvent);
  define('MouseEvent', dom.window.MouseEvent);
  define('KeyboardEvent', dom.window.KeyboardEvent);
  define('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
  define('requestAnimationFrame', (cb: FrameRequestCallback) =>
    dom.window.setTimeout(() => cb(Date.now()), 16) as unknown as number);
  define('cancelAnimationFrame', (id: number) => dom.window.clearTimeout(id));
  define('matchMedia', matchMedia);
  define('IS_REACT_ACT_ENVIRONMENT', true);

  container = dom.window.document.getElementById('root') as HTMLElement;
});

after(async () => {
  // Mounting <App/> opens a socket that will retry forever against a server
  // that is not there. Close it, or the test process never exits.
  try {
    const { useGame } = await import('../src/store/net');
    useGame.getState().socket?.disconnect();
  } catch { /* the store may not have been imported at all */ }
  dom.window.close();
});

/** Mount, flush effects, return the rendered HTML. */
async function mount(node: React.ReactElement): Promise<{
  html: string; text: string; root: HTMLElement; label: string;
}> {
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');

  const host = dom.window.document.createElement('div');
  container.appendChild(host);
  const root = createRoot(host);

  await act(async () => { root.render(node); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  const labelled = host.querySelector('[aria-label]');
  return {
    html: host.innerHTML,
    text: host.textContent ?? '',
    root: host,
    label: labelled?.getAttribute('aria-label') ?? '',
  };
}

// ---------------------------------------------------------------------------

test('a face-up card renders its rank and suit', async () => {
  const { Card } = await import('../src/components/card/Card');
  const { html, text, label } = await mount(
    <Card
      view={{
        id: 'c1', state: 'faceup', face: { rank: 13, suit: 'H' },
        marks: [], memory: 0,
      }}
      size="md"
      tiltOnHover={false}
    />,
  );
  assert.ok(html.length > 100, 'the card rendered nothing');
  assert.ok(text.includes('K'), `no rank index on the card: ${text}`);
  // Suits are drawn as SVG rather than glyph text, so the readable identity
  // lives on the accessible label.
  assert.match(label, /king/i, `card is not labelled with its rank: "${label}"`);
  assert.match(label, /heart/i, `card is not labelled with its suit: "${label}"`);
  assert.ok(html.includes('<svg'), 'no suit art was drawn');
});

test('a face-down card does not leak an identity into the DOM', async () => {
  const { Card } = await import('../src/components/card/Card');
  const { text, label, html } = await mount(
    <Card
      view={{ id: 'c2', state: 'facedown', face: null, marks: [], memory: 0 }}
      size="md"
      tiltOnHover={false}
    />,
  );
  for (const glyph of ['♥', '♠', '♦', '♣']) {
    assert.ok(!text.includes(glyph), `a face-down card put ${glyph} in the DOM`);
  }
  for (const rank of ['King', 'Queen', 'Jack', 'Ace', 'Hearts', 'Spades']) {
    assert.ok(!label.includes(rank), `a face-down card leaked "${rank}" in its label`);
    assert.ok(!html.includes(rank), `a face-down card leaked "${rank}" into the DOM`);
  }
});

test('every card state renders without throwing', async () => {
  const { Card } = await import('../src/components/card/Card');
  const states = [
    { id: 'q', state: 'quantum' as const, face: null, marks: [], memory: 0,
      possible: [{ rank: 14, suit: 'S' as const }, { rank: 2, suit: 'D' as const }] },
    { id: 'q2', state: 'quantum' as const, face: null, marks: [], memory: 0 },
    { id: 'v', state: 'veiled' as const, face: null, marks: [], memory: 0, rank: 13 },
    { id: 'v2', state: 'veiled' as const, face: null, marks: [], memory: 0, suit: 'C' as const },
    { id: 'm', state: 'faceup' as const, face: { rank: 7, suit: 'D' as const },
      marks: ['wild' as const, 'blooded' as const, 'echo' as const], memory: 3, diverged: true, entangled: true },
  ];

  for (const view of states) {
    const { html } = await mount(<Card view={view} size="md" tiltOnHover={false} />);
    assert.ok(html.length > 50, `state "${view.state}" rendered nothing`);
  }
});

test('every court card and ace renders art', async () => {
  const { Card } = await import('../src/components/card/Card');
  for (const rank of [11, 12, 13, 14]) {
    const { html } = await mount(
      <Card
        view={{ id: `r${rank}`, state: 'faceup', face: { rank, suit: 'S' }, marks: [], memory: 0 }}
        size="md"
        tiltOnHover={false}
      />,
    );
    assert.ok(html.includes('<svg'), `rank ${rank} rendered no SVG art`);
  }
});

test('the menu mounts and offers a way in', async () => {
  const Menu = (await import('../src/scenes/Menu')).default;
  const { text } = await mount(<Menu />);
  assert.ok(text.includes('HEXHOLD'), 'the title is missing');
  assert.ok(/Host a Table/i.test(text), 'no way to host a table');
  assert.ok(/Join with a Code/i.test(text), 'no way to join a table');
});

test('the codex lists the rules, sigils and relics', async () => {
  const Codex = (await import('../src/components/Codex')).default;
  const { text } = await mount(<Codex onClose={() => {}} />);
  assert.ok(/mana/i.test(text), 'the codex never mentions mana');
  assert.ok(/stack/i.test(text), 'the codex never explains the stack');
  assert.ok(/Flush Five/i.test(text), 'the impossible hands are undocumented');
});

test('the whole app mounts without a canvas or an audio context', async () => {
  const App = (await import('../src/App')).default;
  const { html, text } = await mount(<App />);
  assert.ok(html.length > 200, 'the app rendered nothing');
  assert.ok(text.includes('HEXHOLD'), 'the app did not reach the menu');
});

test('the sigil card shows its cost and school', async () => {
  const SigilCard = (await import('../src/components/table/SigilCard')).default;
  const { text } = await mount(
    <SigilCard
      inst={{ uid: 'u1', defId: 'superpose' }}
      castable
      cost={2}
      affordable
    />,
  );
  assert.ok(text.includes('Superpose'), 'the sigil name is missing');
  assert.ok(text.includes('2'), 'the mana cost is missing');
  assert.ok(/Entropy/i.test(text), 'the school is missing');
});

// ------------------------------------------------- the fun layer renders

test('the omen bar shows the rules in force', async () => {
  const OmenBar = (await import('../src/components/OmenBar')).default;
  const { text } = await mount(
    <OmenBar
      omens={[
        { id: 'blurred', ante: 2 },
        { id: 'unmade', ante: 4, rank: 9 },
        { id: 'inversion', ante: 5 },
      ]}
    />,
  );
  assert.match(text, /Blurred/i, 'an active omen is not named');
  assert.match(text, /Inversion/i, 'an active omen is not named');
  assert.match(text, /Nines/i, 'a struck rank is not shown');
});

test('the omen bar renders nothing before the first ante', async () => {
  const OmenBar = (await import('../src/components/OmenBar')).default;
  const { html } = await mount(<OmenBar omens={[]} />);
  assert.equal(html.trim(), '', 'the omen bar should be invisible with no omens');
});

test('the profile card stays hidden until a run has been played', async () => {
  const ProfileCard = (await import('../src/components/profile/ProfileCard')).default;
  const { html } = await mount(<ProfileCard />);
  assert.equal(html.trim(), '', 'an empty profile should render nothing');
});

test('a finished run is banked against the coven it was played as', async () => {
  const { recordRun, loadProfile } = await import('../src/components/profile/profile');
  const base = {
    at: Date.now(), placement: 1, players: 4, handsWon: 3, antesSurvived: 4,
    bestHand: 'Flush, Ace high', bestCat: 5, impossible: 0,
    omens: [], relics: [],
  };
  recordRun({ ...base, coven: 'loom', won: true });
  recordRun({ ...base, coven: 'loom', antesSurvived: 6, impossible: 2, won: false });
  recordRun({ ...base, coven: 'ashen', won: false });

  const { covens } = loadProfile();
  // The loom's win, at the default hex, opened the next one.
  assert.deepEqual(covens.loom, { runs: 2, wins: 1, deepestAnte: 6, impossible: 2, hex: 2 });
  assert.deepEqual(covens.ashen, { runs: 1, wins: 0, deepestAnte: 4, impossible: 0, hex: 1 });
  // Seven separate records, not one pooled total: the whole point is that a
  // player can see which openings they have actually got anywhere with.
  assert.equal(covens.quiet, undefined, 'a coven never played should have no record');
});

test('a hex opens only by winning at the top open hex, never from a daily', async () => {
  const { nextHex } = await import('../src/components/profile/profile');
  assert.equal(nextHex(1, { won: true, hex: 1 }), 2);
  assert.equal(nextHex(3, { won: true, hex: 2 }), 3, 'a win below the top does not climb');
  assert.equal(nextHex(3, { won: false, hex: 3 }), 3, 'a loss does not climb');
  assert.equal(nextHex(2, { won: true, hex: 2, daily: '2026-09-25' }), 2, 'a daily does not climb');
  assert.equal(nextHex(5, { won: true, hex: 5 }), 5, 'the ladder has a top');
});

test('the best result of a day is kept, and every attempt counted', async () => {
  const { recordRun, loadProfile } = await import('../src/components/profile/profile');
  const base = {
    at: Date.now(), players: 4, handsWon: 1, bestHand: '', bestCat: -1, impossible: 0,
    omens: [], relics: [], coven: 'quiet', daily: '2026-09-25', hex: 2,
  };
  recordRun({ ...base, placement: 3, antesSurvived: 3, won: false });
  recordRun({ ...base, placement: 2, antesSurvived: 5, won: false });
  recordRun({ ...base, placement: 4, antesSurvived: 2, won: false });
  const day = loadProfile().daily['2026-09-25'];
  assert.equal(day.placement, 2);
  assert.equal(day.attempts, 3);
});

test('a profile written before covens existed still loads', async () => {
  // A week of runs must not be thrown away by a schema that grew a key.
  //
  localStorage.setItem('hexhold.profile', JSON.stringify({
    runs: [{ at: 1, placement: 2, players: 4, handsWon: 1, antesSurvived: 3, bestHand: 'Pair', bestCat: 1, impossible: 0, omens: [], relics: [], won: false }],
    totals: { runs: 1, wins: 0, handsWon: 1, impossible: 0, bestCat: 1, bestHand: 'Pair', deepestAnte: 3, omensSeen: [], relicsOwned: [] },
  }));
  const { loadProfile } = await import('../src/components/profile/profile');
  const p = loadProfile();
  assert.equal(p.runs.length, 1, 'the old runs survived');
  assert.deepEqual(p.covens, {}, 'and the new key arrives empty rather than undefined');
});

test('the profile card reports a finished run', async () => {
  const { recordRun } = await import('../src/components/profile/profile');
  recordRun({
    at: Date.now(), placement: 1, players: 4, handsWon: 7, antesSurvived: 5,
    bestHand: 'Flush House, Fives over Aces', bestCat: 10, impossible: 1,
    omens: ['blurred', 'inversion'], relics: ['deep_well'], coven: 'ashen', won: true,
  });

  const ProfileCard = (await import('../src/components/profile/ProfileCard')).default;
  const { text } = await mount(<ProfileCard />);
  assert.match(text, /Flush House/i, 'the best hand is missing');
  assert.match(text, /impossible/i, 'an impossible hand is not called out');
  assert.match(text, /took the table/i, 'the last run result is missing');
});

test('the intro flow opens on its first panel', async () => {
  const IntroFlow = (await import('../src/components/onboarding/IntroFlow')).default;
  const { text, html } = await mount(<IntroFlow open onClose={() => {}} />);
  assert.ok(html.length > 400, 'the intro rendered nothing');
  assert.match(text, /skip/i, 'the intro cannot be skipped');
});

test('one press of F never folds a free check, and one press of A never shoves', async () => {
  // From the 2026-10-09 playtest: LB (F) folded a free check and Y (A) went all
  // in, each on a single press. The pad sends those same keys.
  define('HTMLInputElement', dom.window.HTMLInputElement);
  define('HTMLTextAreaElement', dom.window.HTMLTextAreaElement);
  const { useGame } = await import('../src/store/net');
  const ActionBar = (await import('../src/components/table/ActionBar')).default;
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');

  const sent: unknown[] = [];
  const realAct = useGame.getState().act;
  useGame.setState({ act: (a: unknown) => { sent.push(a); } } as never);

  const base = {
    yourTurn: true, currentBet: 0, minRaise: 200, bb: 200, pot: 300, phase: 'flop',
    handNumber: 1, toCall: 0, actingUntil: Date.now() + 30_000,
    config: { actionSeconds: 30 }, stack: null,
    // The bar names whoever the table is waiting on when it is not you.
    players: [], actingId: null,
  };
  const me = { bet: 0, chips: 5000, folded: false, eliminated: false } as never;
  const host = dom.window.document.createElement('div');
  container.appendChild(host);
  const root = createRoot(host);
  const press = (key: string) => act(async () => {
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key }));
  });
  try {
    await act(async () => { root.render(<ActionBar view={{ ...base, canCheck: true } as never} me={me} blocked={false} />); });

    await press('f');
    assert.equal(sent.length, 0, 'a single F folded a free check');
    assert.match(host.textContent ?? '', /again to fold/i, 'no prompt for the second press');
    await press('f');
    assert.deepEqual(sent, [{ kind: 'fold' }], 'two presses should fold');

    sent.length = 0;
    await press('a');
    assert.equal(sent.length, 0, 'a single A went all in');
    assert.match(host.textContent ?? '', /again to go all in/i);
    await press('a');
    assert.deepEqual(sent, [{ kind: 'allin' }], 'two presses should go all in');

    // Facing a bet, folding is a real choice: one press still folds.
    sent.length = 0;
    await act(async () => {
      root.render(<ActionBar view={{ ...base, canCheck: false, currentBet: 400, toCall: 400 } as never} me={me} blocked={false} />);
    });
    await press('f');
    assert.deepEqual(sent, [{ kind: 'fold' }], 'facing a bet, F should fold at once');

    // Settings > Gameplay > Confirm before folding, turned off: the player
    // asked for one press, so a free check folds at once. (It used to be a
    // switch nothing read.)
    const { setPrefs } = await import('../src/components/shell/prefs');
    setPrefs({ confirmFold: false });
    try {
      sent.length = 0;
      await act(async () => { root.render(<ActionBar view={{ ...base, canCheck: true, handNumber: 2 } as never} me={me} blocked={false} />); });
      await press('f');
      assert.deepEqual(sent, [{ kind: 'fold' }], 'with the confirm turned off, one F should fold');
    } finally { setPrefs({ confirmFold: true }); }
  } finally {
    await act(async () => { root.unmount(); });
    useGame.setState({ act: realAct } as never);
  }
});

test('holding F or A is one press: key repeat never confirms the guard', async () => {
  // Holding a key past the OS repeat delay (about 500ms on Windows, 600ms on
  // Linux and the Deck) sends a first keydown and then repeats with
  // repeat:true, well inside the 1.5s confirm window. Steam Input sends the
  // same when it maps a held pad button to a key. One long press must not
  // fold a free check or go all in.
  define('HTMLInputElement', dom.window.HTMLInputElement);
  define('HTMLTextAreaElement', dom.window.HTMLTextAreaElement);
  const { useGame } = await import('../src/store/net');
  const ActionBar = (await import('../src/components/table/ActionBar')).default;
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');

  const sent: unknown[] = [];
  const realAct = useGame.getState().act;
  useGame.setState({ act: (a: unknown) => { sent.push(a); } } as never);

  const base = {
    yourTurn: true, currentBet: 0, minRaise: 200, bb: 200, pot: 300, phase: 'flop',
    handNumber: 1, toCall: 0, actingUntil: Date.now() + 30_000,
    config: { actionSeconds: 30 }, stack: null, canCheck: true,
    players: [], actingId: null,
  };
  const me = { bet: 0, chips: 5000, folded: false, eliminated: false } as never;
  const host = dom.window.document.createElement('div');
  container.appendChild(host);
  const root = createRoot(host);
  const hold = (key: string, repeats: number) => act(async () => {
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key }));
    for (let i = 0; i < repeats; i++) {
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, repeat: true }));
    }
  });
  try {
    await act(async () => { root.render(<ActionBar view={base as never} me={me} blocked={false} />); });

    await hold('f', 5);
    assert.equal(sent.length, 0, 'holding F folded a free check');
    assert.match(host.textContent ?? '', /again to fold/i, 'the first keydown should still arm');

    await act(async () => { root.render(<ActionBar view={{ ...base, handNumber: 2 } as never} me={me} blocked={false} />); });
    await hold('a', 5);
    assert.equal(sent.length, 0, 'holding A went all in');

    // A second, deliberate press still confirms.
    await hold('a', 0);
    assert.deepEqual(sent, [{ kind: 'allin' }], 'a real second press should go all in');
  } finally {
    await act(async () => { root.unmount(); });
    useGame.setState({ act: realAct } as never);
  }
});

test('Reduce flashing stops flashes, colour splits and shake, and leaves other motion on', async () => {
  // From the 2026-10-09 playtest: the worst table frames still blink 30-70k
  // pixels, and the only way to stop that was "Reduce motion", which also
  // takes away every other animation.
  const prefs = await import('../src/components/shell/videoPrefs');
  const { prefersReducedFlashing, prefersReducedMotion } = await import('../src/vfx/particles');
  try {
    prefs.setReducedFlashing(false);
    assert.equal(prefersReducedFlashing(), false);
    prefs.setReducedFlashing(true);
    assert.equal(document.documentElement.dataset.reducedFlashing, '1');
    assert.equal(prefersReducedFlashing(), true, 'the VFX gate does not see the setting');
    assert.equal(prefersReducedMotion(), false, 'reduce flashing must not switch off all motion');
    assert.equal(localStorage.getItem('hexhold.reduceFlashing'), '1', 'the setting is not saved');
  } finally {
    prefs.setReducedFlashing(false);
  }

  // Each of the three effects checks the gate before it runs.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/vfx/VfxLayer.tsx', import.meta.url), 'utf8');
  for (const method of ['shake(power: number', 'flash(color: string', 'chromatic(ms = ']) {
    const at = src.indexOf(`  ${method}`);
    assert.ok(at > 0, `VfxLayer.${method.split('(')[0]} not found`);
    assert.match(src.slice(at, at + 900), /prefersReducedFlashing\(\)/, `${method.split('(')[0]} ignores Reduce flashing`);
  }
});

test('Spell cards: Auto reads a new spell in full and a known one briefly; Full, Brief, Off', async () => {
  // From the playtest (P6): a cast fills the middle of the table for 2.6s
  // after it resolves, and ante 1 averages 6.8 casts a hand. A first run
  // needs Full; by hour three it is in the way (26% of your own turns,
  // measured). Auto, the default since round 3, is Full until a sigil has
  // resolved in front of you AUTO_LEARNED_AFTER times, then Brief.
  const StackOverlay = (await import('../src/components/table/StackOverlay')).default;
  const { LINGER_MS, AUTO_LEARNED_AFTER, resetSeen, timesSeen } = await import('../src/components/shell/prefs');
  const { setPrefs, getPrefs, DEFAULT_PREFS } = await import('../src/components/shell/prefs');
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  // Exits finish at once, so what is measured is the linger, not the fade.
  const { MotionGlobalConfig } = await import('framer-motion');
  MotionGlobalConfig.skipAnimations = true;

  assert.equal(DEFAULT_PREFS.spellCards, 'auto', 'the default learns');
  assert.equal(AUTO_LEARNED_AFTER, 3);
  assert.ok(LINGER_MS.full >= 2000 && LINGER_MS.brief > 0 && LINGER_MS.brief < 1000 && LINGER_MS.off === 0);

  const me = { id: 'me', name: 'You', sigils: [], mana: 5, relics: [] };
  const bot = { id: 'b', name: 'Quill', sigils: [], mana: 5, relics: [] };
  const entry = {
    id: 'e1', casterId: 'b', sigilId: 'burn', targets: {}, countered: false, costPaid: 2,
    sigilName: 'Burn', casterName: 'Quill', school: 'ruin',
  };
  const view = (live: boolean, pending: string[] = []) => ({
    handNumber: 1, players: [me, bot], board: [], config: { responseSeconds: 10 },
    stack: live ? { entries: [entry], pending, closesAt: Date.now() + 10_000 } : null,
    stackEntries: live ? [entry] : [],
  }) as never;

  const host = dom.window.document.createElement('div');
  container.appendChild(host);
  const root = createRoot(host);
  const render = (v: unknown) => act(async () => { root.render(<StackOverlay view={v as never} me={me as never} onBeginCast={() => {}} />); });
  const shown = () => !!host.querySelector('.stackview');
  const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

  try {
    for (const mode of ['full', 'brief', 'off'] as const) {
      setPrefs({ spellCards: mode });
      await render(view(true));
      assert.equal(shown(), mode !== 'off', `${mode}: a bot's cast you cannot answer`);
      await render(view(true, ['me']));
      assert.equal(shown(), true, `${mode}: a cast you can answer must always show`);
      await render(view(false));
      await wait(LINGER_MS.brief + 250);
      assert.equal(shown(), mode === 'full', `${mode}: still on screen ${LINGER_MS.brief + 250}ms after it resolved`);
      await render({ ...(view(false) as object), handNumber: 2 });
      await wait(450);
    }
    assert.equal(JSON.parse(localStorage.getItem('hexhold.prefs') ?? '{}').spellCards, 'off', 'the choice is not saved');

    // The server sends a fresh view on every bet. A resolved card has to
    // leave on its own clock all the same: it used to restart nothing and
    // clear its timer on the next view, so it sat over the board, and over
    // the showdown, until the next hand or a click (seen filming the trailer).
    setPrefs({ spellCards: 'full' });
    await render(view(true));
    await render(view(false));
    await wait(100);
    await render(view(false));
    await render(view(false));
    assert.equal(shown(), true, 'a resolved card is read before it goes');
    await wait(LINGER_MS.full + 250);
    assert.equal(shown(), false, `still on screen ${LINGER_MS.full + 250}ms after it resolved, with the table still talking`);
    await render({ ...(view(false) as object), handNumber: 2 });
    await wait(50);
    setPrefs({ spellCards: 'off' });

    // Auto: a Burn never seen before stays to be read, three times; the
    // fourth flashes by like Brief.
    resetSeen();
    setPrefs({ spellCards: 'auto' });
    for (let n = 0; n <= AUTO_LEARNED_AFTER; n++) {
      await render(view(true));
      await render(view(false));
      await wait(LINGER_MS.brief + 250);
      const learned = n >= AUTO_LEARNED_AFTER;
      assert.equal(shown(), !learned, `auto, reading ${n + 1}: ${learned ? 'a known spell lingered' : 'a new spell flashed by'}`);
      await render({ ...(view(false) as object), handNumber: 3 + n });
      await wait(50);
    }
    assert.equal(timesSeen('burn'), AUTO_LEARNED_AFTER + 1);
    assert.ok(JSON.parse(localStorage.getItem('hexhold.seenSpells') ?? '{}').burn > 0, 'what was seen is not saved');
  } finally {
    resetSeen();
    setPrefs({ spellCards: 'full' });
    MotionGlobalConfig.skipAnimations = false;
    await act(async () => { root.unmount(); });
  }
  assert.equal(getPrefs().spellCards, 'full');
});

// ------------------------------------------------- the arcade layer (2026-10-11)

test('a cut-in banner shows, ignores the click that raised it, and skips on the next', async () => {
  const { act } = await import('react');
  const { MotionGlobalConfig } = await import('framer-motion');
  MotionGlobalConfig.skipAnimations = true;
  const BannerLayer = (await import('../src/components/BannerLayer')).default;
  const { bannerBusyMs, SKIP_GUARD_MS } = await import('../src/components/BannerLayer');
  const { root } = await mount(<BannerLayer />);
  const fire = (window as unknown as { __hexholdFx: (e: unknown[]) => void }).__hexholdFx;
  const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
  const key = () => act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
  });
  try {
    await act(async () => { fire([{ t: 'banner', text: 'FLUSH FIVE', sub: 'A hand that cannot exist', tone: 'impossible' }]); });
    // It mounts two frames late, after whatever else the fx batch painted.
    await wait(80);
    assert.match(root.textContent ?? '', /FLUSH FIVE/, 'the banner never showed');
    assert.ok(bannerBusyMs() > 3000, 'the banner does not hold the screen');
    await key();
    await wait(20);
    assert.match(root.textContent ?? '', /FLUSH FIVE/, 'the input inside the guard skipped it');
    await wait(SKIP_GUARD_MS + 20);
    await key();
    await wait(400);
    assert.doesNotMatch(root.textContent ?? '', /FLUSH FIVE/, 'a key did not skip the banner');
    assert.ok(bannerBusyMs() < 300, `a skipped banner still holds the screen for ${bannerBusyMs()}ms`);
  } finally {
    MotionGlobalConfig.skipAnimations = false;
  }
});

test('a count-up lands exactly on its total, and the total holds the space', async () => {
  const { act } = await import('react');
  const { CountUp } = await import('../src/components/fx/CountUp');
  const { root } = await mount(<CountUp value={4200} duration={300} />);
  const hold = root.querySelector('.hx-countup__hold');
  const live = root.querySelector('.hx-countup__live');
  // The flow (and a screen reader) has the final value from the first frame;
  // only the overlay counts.
  assert.match(hold?.textContent ?? '', /^(4,200|4200)$/, 'the total does not hold the space');
  assert.equal(live?.getAttribute('aria-hidden'), 'true', 'a screen reader would hear every digit of the count');
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  assert.match(live?.textContent ?? '', /^(4,200|4200)$/, root.innerHTML);
});

test('a stamp names its verdict without speaking it twice', async () => {
  const { Stamp } = await import('../src/components/fx/Stamp');
  const { root } = await mount(<Stamp text="BUSTED" />);
  const el = root.querySelector('.hx-stamp');
  assert.ok(el, 'no stamp');
  assert.equal(el?.textContent, 'BUSTED');
  // The seat already says OUT; the stamp is the picture of it.
  assert.equal(el?.getAttribute('aria-hidden'), 'true');
});

test('a real counter, by the player or by a bot, slams COUNTERED onto the spell it cancelled', async () => {
  // plans/FINDINGS.md: the stamp shipped proven against a staged view and
  // could not appear in a real game. `resolveStack` clears the live stack and
  // only then unwinds it, so the counter happened where no view could see it,
  // and the resolved card lingered on the counterspell with the cancelled
  // spell beneath it looking as if it had landed. Nothing here is staged: the
  // engine plays the casts and the answer through the same `cast` the sockets
  // and the bots call, and the overlay is fed every view the host was sent.
  const { Engine } = await import('../server/game/engine');
  const { viewFor } = await import('../server/game/table');
  const { DEFAULT_CONFIG } = await import('../shared/types');
  const StackOverlay = (await import('../src/components/table/StackOverlay')).default;
  const { getPrefs, setPrefs } = await import('../src/components/shell/prefs');
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const { MotionGlobalConfig } = await import('framer-motion');
  type View = import('../shared/types').TableView;
  type Ticks = { tick(): void; botClock: Map<string, number> };

  /** A started three-seat table on the turn, its clock stopped, every host view kept. */
  function game(seed: string) {
    const views: View[] = [];
    let e: InstanceType<typeof Engine> | null = null;
    e = new Engine('CNTR', 'host', { ...DEFAULT_CONFIG, seed }, () => {}, () => { if (e) views.push(viewFor(e.table, 'host')); });
    e.addPlayer('host', 'Hero');
    e.addBot();
    e.addBot();
    e.start();
    e.dispose();
    const t = e.table;
    for (const p of t.players) { p.sigils = []; p.relics = []; p.mana = 9; }
    t.phase = 'turn';
    t.stack = null;
    const hero = t.players.find((p) => p.id === 'host')!;
    const bot = t.players.find((p) => p.isBot)!;
    return { e, t, hero, bot, views, ix: e as unknown as Ticks };
  }

  const prior = getPrefs().spellCards;
  setPrefs({ spellCards: 'full' });
  MotionGlobalConfig.skipAnimations = true;
  const host = dom.window.document.createElement('div');
  container.appendChild(host);
  const root = createRoot(host);

  /** Play the views into the overlay, in order, and read what the resolved card shows. */
  async function shown(views: View[]) {
    for (const v of views) {
      const me = v.players.find((p) => p.isYou)!;
      await act(async () => { root.render(<StackOverlay view={v} me={me} onBeginCast={() => {}} />); });
    }
    const feature = host.querySelector('.stack-feature');
    return {
      countered: !!feature?.classList.contains('is-countered'),
      name: feature?.querySelector('.stack-feature__name')?.textContent ?? null,
      stamp: feature?.querySelector('.hx-stamp')?.textContent ?? null,
      list: [...host.querySelectorAll('.stack-item strong')].map((n) => n.textContent),
    };
  }

  /** What every run must show, whoever countered. */
  function resolvedWithCounter(views: View[], cancelled: string): void {
    // The old trigger: no live stack a client receives ever carries a counter.
    assert.ok(views.every((v) => v.stackEntries.every((x) => !x.countered)), 'a live stack carried a counter');
    const last = views[views.length - 1];
    assert.equal(last.stack, null, 'the stack never resolved');
    assert.deepEqual(last.resolvedEntries.map((x) => [x.sigilId, x.countered]), [[cancelled, true], ['nullify', false]]);
  }

  try {
    // 1. The player answers a bot's Hex with Nullify.
    {
      const { e, t, hero, bot, views, ix } = game('counter:player');
      bot.sigils = [{ uid: 'hx', defId: 'hex' }];
      hero.sigils = [{ uid: 'nf', defId: 'nullify' }];
      /* The opening cast is an action, so the table is on whoever makes it
         (castBlock's `turn` rule). The Nullify that answers it is a response
         and is exempt — that is what a response window is for. */
      t.actingId = bot.id;
      assert.ok(e.cast(bot.id, 'hx', { playerId: hero.id }).ok);
      assert.ok(e.cast(hero.id, 'nf', {}).ok);
      ix.tick(); // nobody can answer the Nullify: the stack resolves
      resolvedWithCounter(views, 'hex');
      const card = await shown(views);
      assert.equal(card.stamp, 'COUNTERED', 'the player countered a Hex and no stamp landed');
      assert.equal(card.countered, true);
      assert.equal(card.name, 'Hex', 'the stamp is on the counterspell, not the spell it cancelled');
      assert.deepEqual(card.list, ['Nullify']);
      await act(async () => { root.render(<></>); });
    }

    // 2. A bot answers the player's Hex, on its own judgement (runBots). It
    //    nearly always counters a Hex aimed at it; a few seeds keep this from
    //    hanging on one roll of its dice.
    let botCountered = false;
    for (let s = 0; s < 8 && !botCountered; s++) {
      const { e, t, hero, bot, views, ix } = game(`counter:bot:${s}`);
      hero.sigils = [{ uid: 'hx', defId: 'hex' }];
      bot.sigils = [{ uid: 'nf', defId: 'nullify' }];
      t.actingId = hero.id;
      assert.ok(e.cast(hero.id, 'hx', { playerId: bot.id }).ok);
      ix.botClock.clear(); // its thinking time is up
      ix.tick();
      if (t.stack?.entries.length !== 2) continue;
      botCountered = true;
      ix.tick();
      resolvedWithCounter(views, 'hex');
      const card = await shown(views);
      assert.equal(card.stamp, 'COUNTERED', 'a bot countered your Hex and no stamp landed');
      assert.equal(card.name, 'Hex');
      assert.deepEqual(card.list, ['Nullify']);
    }
    assert.ok(botCountered, 'no bot answered a Hex aimed at it in 8 hands');
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
    MotionGlobalConfig.skipAnimations = false;
    setPrefs({ spellCards: prior });
  }
});

// ------------------------------------------------- the trailer's ear (2026-10-11)

test('the trailer recorder hears every sound the game asks for, and nothing listens otherwise', async () => {
  // tools/trailer/record_trailer.mjs mixes the game's own synths onto the
  // frames that asked for them; this is the only way it learns which.
  const { playSfx, setMusic } = await import('../src/lib/sound');
  const w = window as unknown as { __hexholdSoundTap?: (k: string, n: string, o?: { vol?: number }) => void };
  const heard: Array<[string, string, number | undefined]> = [];
  w.__hexholdSoundTap = (k, n, o) => { heard.push([k, n, o?.vol]); };
  try {
    playSfx('card_deal', { vol: 0.5 });
    setMusic('table');
  } finally {
    delete w.__hexholdSoundTap;
  }
  playSfx('card_flip');
  assert.deepEqual(heard, [['sfx', 'card_deal', 0.5], ['music', 'table', undefined]]);
});

// ------------------------------------------------- covens as unlock (2026-10-22)

/** A finished run's end screen, for the player at a first-run or later table. */
function endedRun(unlocked: boolean, demo = false): unknown {
  return {
    code: 'UNLK', phase: 'gameover', handNumber: 9, ante: 3, omens: [], winnerId: 'b1',
    demoComplete: demo, youId: 'p1', hostId: 'p1',
    config: { hex: 1, ...(unlocked ? { unlocked: true } : {}), ...(demo ? { demoAntes: 3 } : {}) },
    players: [
      { id: 'p1', isYou: true, name: 'You', chips: 0, handsWon: 2, relics: ['creed_last_word'], avatar: 'a',
        isBot: false, eliminated: true, coven: 'unaligned', biggestPot: 0 },
      { id: 'b1', isYou: false, name: 'Bot', chips: 80000, handsWon: 7, relics: [], avatar: 'b',
        isBot: true, eliminated: false, coven: 'unaligned', biggestPot: 0 },
    ],
  };
}

async function endScreen(view: unknown): Promise<string> {
  const GameOver = (await import('../src/components/table/GameOver')).default;
  const { act } = await import('react');
  const { root } = await mount(<GameOver view={view as never} />);
  // It waits for the end-of-run banner before it takes the screen (polled).
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  return root.textContent ?? '';
}

test('a first run\'s menu asks nothing: no coven picker', async () => {
  // clearProfile, not only localStorage.clear(): the runs this file banked
  // above also count as finished in this session (profile.ts runsFinished).
  (await import('../src/components/profile/profile')).clearProfile();
  localStorage.clear();
  const Menu = (await import('../src/scenes/Menu')).default;
  const { root } = await mount(<Menu />);
  assert.equal(root.querySelectorAll('.menu-coven').length, 0, 'a new player was asked to pick a coven');
  assert.match(root.textContent ?? '', /13 sigils, 12 relics/, 'the Codex link counts the first run\'s pools');
});

test('after one finished run, the menu offers all seven covens and the larger pools', async () => {
  const { clearProfile, recordRun } = await import('../src/components/profile/profile');
  clearProfile();
  recordRun({
    at: 1, placement: 3, players: 4, handsWon: 1, antesSurvived: 2, bestHand: 'Pair', bestCat: 1,
    impossible: 0, omens: [], relics: [], coven: 'unaligned', won: false, hex: 1,
  });
  const Menu = (await import('../src/scenes/Menu')).default;
  const { root } = await mount(<Menu />);
  assert.equal(root.querySelectorAll('.menu-coven').length, 7);
  assert.equal(root.querySelectorAll('.menu-coven.is-locked').length, 0, 'the full game locks no coven');
  assert.ok(root.querySelector('[role="radiogroup"][aria-label="Choose your coven"]'));
  assert.match(root.textContent ?? '', /16 sigils, 16 relics/);
  clearProfile();
});

test('the run that opens the later game says what is new; a later run\'s end screen does not', async () => {
  const first = await endScreen(endedRun(false));
  assert.match(first, /New from your next run/);
  assert.match(first, /Pick one of 7 on the menu/);
  assert.match(first, /3 sigils, 3 omens and 4 relics join the deck/);
  assert.match(first, /Choose a coven/);

  const later = await endScreen(endedRun(true));
  assert.doesNotMatch(later, /New from your next run/, 'every later run repeated the news');

  const demo = await endScreen(endedRun(false, true));
  assert.match(demo, /3 are open in the demo, all 7 in the full game/);
  // Without the reveal, the demo's pitch is where the covens are said.
  const demoLater = await endScreen(endedRun(true, true));
  assert.doesNotMatch(demoLater, /New from your next run/);
  assert.match(demoLater, /All 7 covens from your second run/, 'the demo pitch should say when covens open');
});
