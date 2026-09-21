# HEXHOLD vfx

This folder is the "juice" layer for HEXHOLD: a dependency-free canvas particle
system, a handful of full-screen camera effects (shake, flash, vignette,
chromatic aberration, slow-mo), and a small set of CSS-driven presentational
components for glows, shimmer, orbiting runes, and breathing pulses. Nothing
in here depends on anything but React. The goal is Balatro-grade feedback —
fast attack, quick decay, never obscuring the cards — on a poker table that
still has to run smoothly with six players and a busy pot.

Everything public is re-exported from `src/vfx/index.ts`, so in practice you
only ever need:

```tsx
import { vfx, VfxLayer, Aura, Shimmer, Runes, Pulse } from '@/vfx';
```

## Mounting the layer

`VfxLayer` is a single React component that should be mounted exactly once,
near the root of the app:

```tsx
import { VfxLayer } from '@/vfx';

function App() {
  return (
    <>
      {/* ...the rest of the app... */}
      <VfxLayer />
    </>
  );
}
```

It renders a full-screen canvas plus a few overlay `<div>`s (flash, vignette,
film grain, optional scanlines) through a React portal into `document.body`,
regardless of where in the tree it is mounted. That's deliberate: camera
shake and the chromatic-aberration filter are applied to the *app root*
element (see "Setting the root" below), and a CSS `filter` creates a new
containing block for fixed-position descendants. If the fx layer lived
inside the shaking root, the particles would shake along with the screen
they're supposed to be layered over. Portalling to `<body>` keeps them
independent.

`VfxLayer` accepts a handful of props, all optional:

- `grain` (`boolean`, default `true`) — an animated film-grain texture over
  the whole app, generated once at mount time as a cached data URI and then
  just re-tiled. Turn it off for a cleaner, flatter look.
- `scanlines` (`boolean`, default `false`) — CRT-style scanlines. Off by
  default because it reads as a lot on top of a poker table; opt in for a
  specific theme or mode.
- `ambientDust` (`boolean`, default `true`) — every 5.5 seconds, a very
  faint `dust` burst of slow-drifting motes over the felt. Cheap and
  meant to be nearly subliminal.
- `root` (`HTMLElement | null`) — shortcut for calling `vfx.setRoot()` from
  a prop instead of an effect. See below.
- `grainOpacity` (`number`, 0..1) — override the grain's opacity. Defaults
  to `0.045`, or `0.025` when the user prefers reduced motion.

If no 2D canvas context is available (a very old browser, a locked-down
embed), `VfxLayer` degrades silently: the overlay effects (flash, vignette,
grain, shake) still work, particles simply never spawn. The game still
plays; it's just quieter.

### Setting the root

Camera shake and the chromatic RGB-split filter need an element to apply a
CSS transform / `filter` to. By default that's `#root` if it exists,
otherwise `document.body`. To point it at a more specific element (say, the
table's own wrapper, so a modal or toast overlay doesn't shake with it),
call `vfx.setRoot()` once, or pass the `root` prop to `VfxLayer`:

```tsx
const appRootRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  vfx.setRoot(appRootRef.current);
  return () => vfx.setRoot(null);
}, []);
```

If the chosen root happens to *contain* the fx layer's own DOM node (it
normally won't, since the layer is portalled to `<body>`), shake and
chromatic are silently skipped for safety rather than risk the fx layer
dragging itself around.

## The `vfx` imperative API

`vfx` is a single module-level object — import it anywhere and call it
directly, no context provider, no prop drilling, no ref forwarding. Calls
made before `<VfxLayer />` has mounted are queued (up to 64 deep) and
replayed the moment it attaches, so it's safe to fire effects from the very
first render of your app.

### `vfx.burst(preset, at, opts?)`

```ts
burst(preset: PresetName | (string & {}), at: Vec2, opts?: BurstOptions): void
```

Fires a named particle preset at a viewport-space point (`{ x, y }`, in CSS
pixels, same coordinate space as `getBoundingClientRect()`). `preset` is one
of the names in the catalogue below, or any string — an unknown name just
logs a dev-mode warning and does nothing, so a typo never crashes the game.
`opts` is a `PresetOptions` bag (school, amount, target, colour overrides,
scale, count, angle — see each preset's description) whose fields every
preset uses a subset of.

```ts
vfx.burst('cast', { x: 640, y: 360 }, { school: 'entropy' });
vfx.burst('chips', potCenter, { amount: 250 });
```

### `vfx.burstAtEl(preset, el, opts?)`

```ts
burstAtEl(preset: PresetName | (string & {}), el: Element | null, opts?: BurstOptions): void
```

The same as `burst`, but takes a DOM element instead of a point and centres
the burst on its bounding box. This is the one you reach for most often in
practice — you rarely know a card or button's pixel position ahead of time,
you just have the ref:

```ts
vfx.burstAtEl('cast', cardRef.current, { school: 'ruin' });
```

If the element is `null` or has no box (unmounted, `display: none`), the
call is a silent no-op.

### `vfx.shake(power, ms?)`

```ts
shake(power: number, ms = 420): void
```

Camera shake on the configured root, driven by decaying value noise rather
than a fixed keyframe, so repeated calls layer naturally instead of visibly
restarting. `power` is roughly pixels of peak travel — `4` reads as a tap,
`26` reads as the table is genuinely unhappy; it's clamped to ±34px / ±2.2°
of rotation regardless of how large a value you pass. `ms` is how long the
shake takes to decay to zero (quadratic decay — punchy start, clean
settle). Up to 8 shakes can be in flight at once; past that, the newest call
steals the weakest of the existing ones rather than being dropped. Under
`prefers-reduced-motion`, magnitude is cut to 20% rather than disabled
outright — you keep the *cue* without the vestibular discomfort.

```ts
vfx.shake(6, 180);   // a light tap — a card lands
vfx.shake(22, 500);  // a big hit — an all-in call, a bomb spell
```

### `vfx.flash(color, power?)`

```ts
flash(color: string, power = 0.55): void
```

A full-screen colour flash, composited with `mix-blend-mode: screen` (so it
only ever brightens, never muddies, what's underneath) and decaying on a
fixed ~0.26s curve regardless of `ms` — there's no duration parameter
because a flash is meant to read as instantaneous. `power` is peak opacity,
0..1; if a flash is already fading out, a new call only raises the peak, it
never lowers it. Reduced motion cuts `power` to 25%.

```ts
vfx.flash('#ffffff', 0.4);       // a big reveal
vfx.flash('var(--ruin)', 0.6);   // damage / a bad beat
```

### `vfx.vignette(color, ms)`

```ts
vignette(color: string, ms: number): void
```

A radial vignette that pulses in and back out over `ms` milliseconds,
following a fixed eased keyframe (fast in, a settle around 55–80% opacity,
fade out). Unlike `flash`, calling it again while one is already running
restarts the animation from zero rather than stacking. Good for framing a
moment — a school's colour breathing at the edges of the screen while a
spell resolves.

```ts
vfx.vignette('var(--entropy)', 900);
```

### `vfx.chromatic(ms?)`

```ts
chromatic(ms = 260): void
```

A brief RGB channel split across the whole app root, implemented as an
inline SVG filter (`VfxLayer` ships the `<filter id="vfx-rgb-split">`
definition itself) whose offset eases back to zero over `ms`. This is a
no-op entirely under `prefers-reduced-motion` — a channel split reads as
pure visual noise once it isn't punchy, so it's skipped rather than
softened.

```ts
vfx.chromatic(300);
```

### `vfx.timeRipple(at)`

```ts
timeRipple(at: Vec2): void
```

A composed effect for anything "rewind time" flavoured: it fires the
`rewindRipple` particle preset at `at`, triggers a 340ms chromatic split, a
620ms slow-mo dip to 55% speed, and a soft cold-blue flash, all in one call.
Reach for this instead of hand-assembling the four calls yourself whenever
a Chronos-school effect rewinds a bet, a hand, or a round.

### `vfx.slowmo(scale, ms)`

```ts
slowmo(scale: number, ms: number): void
```

Publishes a CSS custom property, `--vfx-time-scale`, on `document.documentElement`,
eased back to `1` over `ms` with an ease-out cubic. `scale` is clamped to
0.05–4. `vfx.slowmo` does not itself slow down `requestAnimationFrame` or
any game logic — it only writes the CSS variable. It's on your own
animations (CSS `animation-duration: calc(var(--t-base) / var(--vfx-time-scale, 1))`,
or a Framer Motion transition read from it) to actually honour the value.
Treat it as a broadcast, not an enforcement.

```ts
vfx.slowmo(0.4, 700); // dip to 40% speed, ease back over 700ms
```

### `vfx.confetti(at?)`

```ts
confetti(at?: Vec2): void
```

Fires the `confetti` preset. With no argument it rains from a point just
above the top-centre of the viewport; pass a point to celebrate from
somewhere specific (a winner's seat, the pot).

```ts
vfx.confetti();                       // top of the screen
vfx.confetti(centerOf(winnerSeatEl)); // from the winner's seat
```

### `vfx.setRoot(el)`

```ts
setRoot(el: HTMLElement | null): void
```

See "Setting the root" above. Pass `null` to fall back to the default
(`#root`, then `document.body`) and clear any shake/chromatic styling that
was left on the previously-set element.

### Also on the controller

A few more members exist on `vfx` beyond the effect calls above:

- `vfx.clear()` — removes every live and pending particle immediately. Handy
  when tearing down a scene or resetting between hands.
- `vfx.ready` (`readonly boolean`) — `true` once `<VfxLayer />` has mounted
  and its canvas is live. Calls made while `false` are queued, not lost.
- `vfx.particleCount` (`readonly number`) — the current live particle count.
  Useful for a debug HUD; not meant to gate calls (the pool caps itself
  internally at `MAX_PARTICLES`, currently 1400).

## Particle preset catalogue

Each preset is a small function that takes an origin point and an optional
`PresetOptions` and returns the burst(s) that make it up — some are a
single burst, others layer two or three (a main burst plus an echo ring, a
flash of sparks over a cloud of smoke). All of them read school colours and
other design tokens from `src/styles/tokens.css` lazily, at fire time, so a
live theme change is picked up for free.

Common `PresetOptions` fields, used by different presets:

| field | type | meaning |
| --- | --- | --- |
| `school` | `School` | which school's palette to use (`cast`) |
| `amount` | `number` | pot/bet size — scales particle count (`chips`) |
| `target` | `Vec2` | the point particles are pulled toward (`potCollect`, `collapse`) |
| `colors` | `string[]` | override the palette entirely |
| `color` | `string` | a single colour, merged in front of the default palette |
| `scale` | `number` | overall size/energy multiplier, default `1` |
| `count` | `number` | hard override for the headline burst's particle count |
| `angle` | `number` | primary direction in radians, on presets that have one |

**`cast`** — a school-coloured ring: a burst of sparks, a scatter of slowly
drifting glyphs, and two soft expanding rings. The general-purpose "a spell
was cast here" effect. Pass `school` to colour it (defaults to `entropy`).
Use it on tap/click of any spell button, or at a targeted card/seat when the
spell resolves.

**`collapse`** — shards and sparks pulled inward from a ring around the
origin toward a `target` point, ending in a white flash and an expanding
ring at the moment of impact. Built for wavefunction collapse — a
superposed (quantum) card resolving to one real state — but works for any
"several things become one thing" moment.

**`superpose`** — two mirrored, ghostly plumes of glyphs and motes drifting
apart from a shared origin at low opacity and a slow drag. The inverse of
`collapse`: use it the moment a card enters superposition, and pair it with
`collapse` for when it resolves. `angle` picks the axis the plumes split
along.

**`burn`** — flickering embers rising with dark smoke beneath them and a few
fast white-hot sparks. The `ruin`-school damage/fire effect — a losing all-in,
a card being destroyed, a burn-over-time tick.

**`chips`** — gold coins tumbling upward and arcing back down under gravity,
with a few bright sparks at the launch. `amount` scales the coin count
(roughly `6` at a small bet up to `40` at a max bet, clamped). Fire this
from a bet or raise action.

**`potCollect`** — a denser stream of coins and sparks pulled from a spread
area toward `target` (the pot, or a winner's stack), with a final ring of
sparks landing 420ms later. Use this once, at showdown, rather than `chips`
repeatedly — it's tuned to read as a single continuous pull rather than a
volley.

**`impossible`** — the biggest preset in the file, and the one the whole
engine exists for: a prism of shards in every school colour, a burst of
matching sparks, an arc of gold coins, drifting glyphs, three staggered
expanding rings, and a final scatter of flickering motes. Reserve it for
the actual "impossible" moments the game is named for — a hand that
shouldn't exist, a run of the table.

**`sparkleTrail`** — tiny, cheap, glowing dots with a short lifetime and
heavy drag. Meant to be called every frame (or every few frames) behind a
moving element — a card being dragged, a chip sliding to the pot — not
fired once. Keep its `count` low (default `3`); it accumulates fast if
called on every `pointermove`.

**`rewindRipple`** — three sets of concentric rings (cyan, rose, and the
chronos gold, each offset by a couple of pixels for a chromatic feel) plus
an inward pull of sparks. This is what `vfx.timeRipple()` fires for you
automatically; call it directly only if you want the ring without the
accompanying chromatic/slow-mo/flash.

**`dust`** — very faint, very slow ambient motes spread across roughly half
the viewport, with a long 6–12s lifetime. `VfxLayer`'s `ambientDust` prop
fires this automatically every 5.5 seconds; call it yourself only if you
want an extra pass (e.g. a denser dust moment for a particular scene).

**`eliminate`** — dark ash-coloured shards and embers falling away with
gravity, low glow, and a muted palette. The "this player is out" effect.

**`confetti`** — bright shards and gold coins, in every school colour plus
gold, falling from a horizontal band near `at` under strong gravity. This is
what `vfx.confetti()` fires.

Every preset name is available at runtime as the `PRESET_NAMES` array (handy
for a debug menu), and `resolvePreset(name, at, opts)` — what `vfx.burst`
calls internally — is exported if you ever need the raw `EmitSpec[]` a
preset produces without spawning it.

### Writing your own burst

You don't have to go through a named preset. `vfx` doesn't expose the raw
`ParticleSystem` for spawning custom one-off bursts directly (that instance
lives inside `VfxLayer`), but every preset is just a function returning
`EmitSpec[]`, and `EmitSpec` (documented in full in `particles.ts`) is the
complete vocabulary: origin, count, speed range, angle/spread, a spawn
radius or area, lifetime, size, colours, shape (`'dot' | 'spark' | 'glyph' |
'ring' | 'shard' | 'coin'`), gravity, drag, glow, an optional attractor
target, fade curve, and more. If a new named effect is needed, the cleanest
path is adding a new entry to the `PRESETS` object in `particles.ts` next to
the existing ones — that keeps every burst discoverable through
`PRESET_NAMES` and usable via `vfx.burst('yourPreset', ...)` everywhere,
rather than one-off imperative particle code scattered through the UI.

## Presentational components

`Aura`, `Shimmer`, `Runes`, and `Pulse` are the CSS-driven counterparts to
the particle system — cheap, always-on decorations that don't need a RAF
loop or a canvas. None of them hold per-frame React state; every one of
them is just a `<span>`/`<div>` whose inline `style` sets a handful of CSS
custom properties that `effects.css` animates via `@keyframes`. That makes
them safe to render dozens of at once (a table full of active
enchantments, a hand full of foil cards) without any performance concern.
Reduced motion is handled centrally in `effects.css`'s
`@media (prefers-reduced-motion: reduce)` block, which disables every
animation these produce in favour of a static equivalent — none of that
logic needs to be duplicated in the components themselves.

All four accept a `color` prop typed as `School | (string & {})` — pass a
school name (`'entropy'`, `'veil'`, `'chronos'`, `'bind'`, `'ruin'`,
`'weave'`) and it resolves to that school's token automatically, or pass
any literal CSS colour (`'#ffcc00'`, `'var(--gold)'`, `'rgba(255,255,255,.6)'`)
and it's used as-is.

### `<Aura />`

An animated soft glow halo rendered behind its children via a blurred
`::before` pseudo-element, at `z-index: -1` inside its own stacking
context. It wraps its children in an inline-flex `<span>`, so it never
changes layout — no extra margin, no reflow.

```tsx
<Aura color="entropy" glow={22} intensity={0.6}>
  <SpellButton school="entropy" />
</Aura>
```

| prop | type | default | meaning |
| --- | --- | --- | --- |
| `color` | `School \| string` | gold token | halo colour |
| `glow` | `number` | `18` | how far the halo reaches past the edge, px |
| `intensity` | `number` | `0.55` | peak opacity, 0..1 |
| `pulse` | `boolean` | `true` | breathe in and out, vs. a flat static glow |
| `speed` | `number` | `2.6` | seconds per breath |
| `shape` | `'circle' \| 'pill' \| 'rounded'` | `'rounded'` | corner treatment of the glow |

Use it behind a pot leader's avatar (`shape="circle"`), an active/glowing
button (`shape="pill"`), or a card or panel that just became special
(`shape="rounded"`, the default).

### `<Shimmer />`

A diagonal specular sweep that loops across its children, composited with
`mix-blend-mode: screen` so it only ever brightens what's underneath. The
wrapper clips to `border-radius: inherit`, so it follows whatever shape its
child already has — a rounded card frame, a pill-shaped badge.

```tsx
<Shimmer speed={2.4} delay={0.3}>
  <RareCardFace card={card} />
</Shimmer>
```

| prop | type | default | meaning |
| --- | --- | --- | --- |
| `active` | `boolean` | `true` | play the sweep; `false` pauses and hides it |
| `color` | `School \| string` | soft white | tint of the sweep band |
| `hot` | `School \| string` | near-white | tint of the sweep's bright centre line |
| `speed` | `number` | `2.8` | seconds per pass |
| `delay` | `number` | `0` | seconds before the first pass — stagger several items |

This is the one to reach for on foil/rare card frames and premium shop
items. Stagger a grid of them with a different `delay` each so they don't
all sweep in lockstep.

### `<Runes />`

Small arcane glyph characters (from the same `RUNE_GLYPHS` pool the
`glyph`-shaped particles use) slowly orbiting a centre point, each
counter-rotating on its own animation so it stays upright through the
orbit, and gently twinkling in opacity.

`Runes` has two modes. Give it `children` and it wraps them in its own
positioned anchor, centring the orbit on them:

```tsx
<Runes color="veil" count={6} radius={58} speed={12}>
  <QuantumCard card={card} />
</Runes>
```

Omit `children` and it renders as a bare absolutely-positioned overlay,
expecting you've already put it inside a `position: relative` parent (a
card wrapper you control the layout of already):

```tsx
<div className="seat" style={{ position: 'relative' }}>
  <SeatAvatar player={player} />
  {player.hasActiveWard && <Runes color="bind" count={4} radius={40} />}
</div>
```

| prop | type | default | meaning |
| --- | --- | --- | --- |
| `color` | `School \| string` | entropy token | glyph colour |
| `count` | `number` | `6` | how many glyphs orbit |
| `radius` | `number` | `52` | orbit radius, px |
| `speed` | `number` | `14` | seconds per full revolution |
| `size` | `number` | `13` | glyph font size, px |
| `opacity` | `number` | `0.82` | peak glyph opacity (they twinkle down to ~40% of this) |
| `dir` | `'cw' \| 'ccw'` | `'cw'` | orbit direction |
| `glyphs` | `string[]` | `RUNE_GLYPHS` | override the glyph pool |

Used for quantum (superposed) cards and to mark an actively-enchanted seat
or pot — anywhere something is under a standing magical effect rather than
reacting to a one-off event (that's what the particle presets are for).

### `<Pulse />`

Three concentric rings expanding outward and fading, staggered on a shared
loop via plain CSS `nth-child` delays — a heartbeat for "this is active
right now."

Like `Runes`, it supports both a wrapping mode (pass `children`, get a
self-contained anchored component) and a bare overlay mode (omit
`children`, drop it inside a `position: relative` parent you already have):

```tsx
<Pulse color="bind" size={54}>
  <SeatFrame player={activePlayer} />
</Pulse>
```

```tsx
<div className="ward-icon" style={{ position: 'relative' }}>
  <WardIcon />
  <Pulse color="chronos" size={30} speed={1.6} />
</div>
```

| prop | type | default | meaning |
| --- | --- | --- | --- |
| `color` | `School \| string` | bind token | ring colour |
| `size` | `number` | `46` | ring diameter at rest, px |
| `width` | `number` | `2` | ring stroke width, px |
| `speed` | `number` | `2.2` | seconds per pulse |
| `intensity` | `number` | `0.75` | peak opacity a ring reaches |

Reach for it on the current turn's seat indicator, a standing ward icon, or
any other "this is live" marker that needs to read at a glance without
stealing focus from the cards.

## Reduced motion

`prefersReducedMotion()` (exported from `particles.ts`, re-exported from the
barrel) reflects the OS-level `prefers-reduced-motion: reduce` media query,
and can be overridden in code with `setReducedMotion(true | false | null)`
(`null` goes back to following the OS setting) — useful for an in-game
accessibility toggle that shouldn't require an OS-level change to test.
Every part of this folder honours it without extra wiring on the caller's
part:

- The particle system spawns 20% as many particles per burst and turns
  glow off, rather than skipping bursts entirely — the shape of the effect
  still reads, it's just calmer.
- `vfx.shake` cuts magnitude to 20%; `vfx.flash` cuts peak opacity to 25%;
  `vfx.chromatic` is skipped entirely (a channel split with no punch is
  just noise).
- `tokens.css` collapses every motion-duration custom property to `1ms` and
  forces `animation-iteration-count: 1` globally, which is what makes the
  `effects.css` keyframes settle instantly rather than looping.
- `effects.css`'s own reduced-motion block additionally freezes the
  `Shimmer` sweep, `Runes` orbit/twinkle, and `Pulse` rings in place at a
  fixed opacity, and disables `Aura`'s breathing — each becomes a still,
  legible version of itself instead of vanishing.

Nothing in this folder should ever be the reason a player turns reduced
motion on and then has to reach for it again out of frustration — the
effects should get calmer, never blunter.
