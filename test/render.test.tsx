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

test('the profile card reports a finished run', async () => {
  const { recordRun } = await import('../src/components/profile/profile');
  recordRun({
    at: Date.now(), placement: 1, players: 4, handsWon: 7, antesSurvived: 5,
    bestHand: 'Flush House, Fives over Aces', bestCat: 10, impossible: 1,
    omens: ['blurred', 'inversion'], relics: ['deep_well'], won: true,
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
