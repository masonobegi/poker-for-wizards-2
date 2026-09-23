# 009 — Cut the steady-state animation load

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: HIGH
- **Category**: 5 (Performance)
- **Estimated scope**: 5 files, medium

## Problem

A realistic table sits at roughly **45–70 concurrent infinite animations**, and a board with two quantum cards pushes past 80 — before a single particle spawns. Nothing pauses when a card is off-screen, occluded by a modal, or idle. `src/components/card/card.css` alone declares 24 `infinite` animations; `src/vfx/effects.css` declares 8.

Several of them animate properties that cannot be composited, so each is a repaint every frame, not a GPU transform.

**Box-shadow animations — three of them, one running five times at once.**

```css
/* src/scenes/table.css:159-162 — current */
.seat.is-winner .seat-pod {
  border-color: var(--gold);
  box-shadow: var(--e-3), 0 0 40px rgba(240, 196, 101, 0.55);
  animation: winpulse 1.4s var(--ease-both) infinite;
}
@keyframes winpulse {
  50% { box-shadow: var(--e-3), 0 0 60px rgba(240, 196, 101, 0.8); }
}
```

```css
/* src/scenes/table.css:166-172 — current */
.seat.is-targetable .seat-pod {
  border-color: var(--veil);
  box-shadow: 0 0 0 2px rgba(110, 200, 255, 0.28), 0 0 30px rgba(110, 200, 255, 0.4);
  animation: targetpulse 1.1s var(--ease-both) infinite;
}
@keyframes targetpulse { 50% { box-shadow: 0 0 0 5px rgba(110, 200, 255, 0.16), 0 0 40px rgba(110, 200, 255, 0.55); } }
```

During any player-targeting prompt **every** opposing seat gets `.is-targetable`, so five infinite two-layer box-shadow repaints run concurrently while the target prompt is open.

```css
/* src/styles/ui.css:325-336 — current */
.pulse-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--good);
  box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.6);
  animation: dotpulse 2s var(--ease-out) infinite;
}
@keyframes dotpulse {
  70%  { box-shadow: 0 0 0 8px rgba(74, 222, 128, 0); }
  100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
}
```

Permanently on screen as a connection indicator.

**Two full-viewport paint animations that never idle.**

```css
/* src/vfx/effects.css:78-84 — current */
opacity: var(--vfx-grain-opacity, 0.045);
background-repeat: repeat;
background-size: 128px 128px;
mix-blend-mode: overlay;
animation: vfx-grain-shift 900ms steps(6, end) infinite;
will-change: background-position;
```

`background-position` is a paint property — a 1MP `mix-blend-mode: overlay` layer repainted ~6.7 times a second, forever. And `will-change: background-position` promotes a permanent full-screen GPU layer for a property that **cannot** be composited: all cost, no benefit.

```css
/* src/vfx/effects.css:95-104 — current */
.vfx-scanlines {
  /* ... */
  mix-blend-mode: multiply;
  animation: vfx-scanline-drift 7s linear infinite;
}
```

**A 200%-of-viewport rotating starfield.**

```css
/* src/styles/base.css:84-91 — current */
  background-size: 480px 480px, 620px 620px, 540px 540px, 700px 700px, 400px 400px;
  opacity: 0.7;
  animation: drift 240s linear infinite;
  z-index: 0;
```

`.app::before` is `inset: -50%` — 2560×1600 on a Deck — painted with five stacked radial gradients and rotating forever, so its layer is re-composited with a non-axis-aligned transform every frame for the life of the app.

**`will-change` left on permanently, including on invisible elements.**

```css
/* src/vfx/effects.css:210 — current */
  will-change: opacity, transform;   /* on .vfx-aura::before */
```

The base `::before` always carries it, but the animation is only applied by the separate `[data-pulse='true']` rule at `:223-225` — so every non-pulsing aura holds a compositing layer it never uses.

```css
/* src/vfx/effects.css:256-264 — current */
  animation: vfx-shimmer-sweep var(--shimmer-speed, 2.8s) var(--shimmer-ease, cubic-bezier(0.4, 0, 0.2, 1)) infinite;
  animation-delay: var(--shimmer-delay, 0s);
  will-change: transform;
}

.vfx-shimmer[data-active='false'] .vfx-shimmer-sweep {
  animation-play-state: paused;
  opacity: 0;
}
```

The rule that turns the shimmer *off* leaves `will-change: transform` in force — a paused, zero-opacity element keeps a GPU layer.

**Card-level filter animations.** `card.css:361-362` runs `hx-q-phase` with `will-change: opacity, filter` on up to 3 stacked layers per quantum card, animating `filter: blur()` — a per-frame re-rasterisation. `card.css:563` and `:683` both run `hx-burn-flicker`, so a burning card runs **two** infinite `filter: brightness()` animations.

## Target

Three changes, in order of payoff.

**1. Convert the three box-shadow pulses to `transform` + `opacity` on a pseudo-element.** The repo already contains this exact pattern — `.vfx-pulse i` in `src/vfx/effects.css:345-354` is a ring that expands via transform. Imitate it.

```css
/* target — src/scenes/table.css, replacing :159-162 */
.seat.is-winner .seat-pod {
  border-color: var(--gold);
  box-shadow: var(--e-3), 0 0 40px rgba(240, 196, 101, 0.55);
}
.seat.is-winner .seat-pod::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 0 60px rgba(240, 196, 101, 0.8);
  opacity: 0;
  animation: winpulse 1.4s var(--ease-both) infinite;
  pointer-events: none;
}
@keyframes winpulse {
  0%, 100% { opacity: 0; }
  50%      { opacity: 1; }
}
```

The shadow is now static and the *opacity* animates — compositable, no repaint. Same transformation for `targetpulse` (`:166-172`) and `dotpulse` (`src/styles/ui.css:325-336`); for `dotpulse` the ring should expand with `transform: scale()` and fade with `opacity`, since it is a radiating ring rather than a glow.

**2. Idle out the always-on full-screen layers.** Grain and scanlines should not animate when nothing is happening.

```css
/* target — src/vfx/effects.css:78-84 */
opacity: var(--vfx-grain-opacity, 0.045);
background-repeat: repeat;
background-size: 128px 128px;
mix-blend-mode: overlay;
/* No animation and no will-change by default: background-position cannot be
   composited, so promoting a layer for it is pure cost. The static grain tile
   reads as grain without moving. */
```

If the moving grain is wanted for specific moments, gate it behind a class that `VfxLayer` adds during an effect and removes after, the way `.vfx-shaking` already works (`src/vfx/effects.css:123-127`, added at `VfxLayer.tsx:265`, removed at `:256`).

```css
/* target — src/styles/base.css:89 */
  /* The starfield drift is a 2560x1600 rotating layer. It is menu dressing,
     not table feedback — the table scene turns it off. */
  animation: drift 240s linear infinite;
}
.app.is-table::before { animation: none; }
```

and add `is-table` to the app root's className when the active screen is the game table (`src/App.tsx` already knows `screen`).

**3. Remove every `will-change` that is not on a currently-animating element.**

```css
/* target — src/vfx/effects.css:210 */
  /* will-change removed from the base rule */
```
```css
/* target — src/vfx/effects.css, moved to the pulsing variant only */
.vfx-aura[data-pulse='true']::before {
  animation: vfx-aura-breathe var(--aura-speed, 2.6s) ease-in-out infinite;
  will-change: opacity;
}
```
```css
/* target — src/vfx/effects.css:261-264 */
.vfx-shimmer[data-active='false'] .vfx-shimmer-sweep {
  animation-play-state: paused;
  opacity: 0;
  will-change: auto;     /* release the layer while it is not sweeping */
}
```

## Repo conventions to follow

- `src/vfx/effects.css:345-354` (`.vfx-pulse i`) is the in-repo exemplar for a ring pulse done with `transform` + `opacity`. Match its structure.
- `src/vfx/effects.css:121-127` is the exemplar for scoped `will-change`: the hint lives on a class that JS adds for the duration of the effect and removes afterward. Its comment states the reasoning.
- Keyframe names in `table.css` are unprefixed (`winpulse`, `targetpulse`, `pot-jump`); in `card.css` they are `hx-`-prefixed; in `effects.css` they are `vfx-`-prefixed. Keep each file's convention.

## Steps

1. `src/scenes/table.css:159-162` — convert `winpulse` to the pseudo-element/opacity form in **Target**. Confirm `.seat-pod` has `position: relative` (it does, `:136`).
2. `src/scenes/table.css:166-172` — convert `targetpulse` the same way.
3. `src/styles/ui.css:325-336` — convert `dotpulse` to `transform: scale()` + `opacity` on a `::after` ring. Keep `.pulse-dot.off { animation: none }` working.
4. `src/vfx/effects.css:82-83` — remove `animation: vfx-grain-shift ...` and `will-change: background-position` from the base `.vfx-grain` rule. Decide with the repo owner whether to gate the moving variant behind a class or drop `vfx-grain-shift` entirely; if gating, follow the `.vfx-shaking` pattern and wire it in `src/vfx/VfxLayer.tsx`.
5. `src/vfx/effects.css:103` — same treatment for `.vfx-scanlines`. Note `scanlines` already defaults to `false` in `VfxLayer`, so this only affects opted-in themes.
6. `src/styles/base.css:89` — add the `.app.is-table::before { animation: none; }` rule, and set the `is-table` class in `src/App.tsx` based on the current `screen`.
7. `src/vfx/effects.css:210` — delete `will-change: opacity, transform;` from `.vfx-aura::before`; add `will-change: opacity;` to the `[data-pulse='true']` rule at `:223-225`.
8. `src/vfx/effects.css:263` — add `will-change: auto;` to the `[data-active='false']` shimmer rule.
9. `src/components/card/card.css:361-362` — remove `will-change: opacity, filter` from `.hx-q__layer`. Keep the animation; the `will-change` on up to 3 layers per quantum card costs more than it saves.
10. `src/components/card/card.css:683` — the burning badge duplicates `hx-burn-flicker` from `:563`. Remove the badge's copy; one flicker per burning card is enough.
11. Re-run the census afterwards: `grep -rn "infinite" src --include=*.css | wc -l` should drop, and `grep -rn "will-change" src --include=*.css` should return only hints on elements that are animating at that moment.

## Boundaries

- Do NOT delete the winner, targetable or connection states — only change **how** they animate. The cue must survive.
- Do NOT touch `src/vfx/particles.ts` or its rAF loop; canvas particle simulation is correct as-is.
- Do NOT remove `will-change` from `.vfx-shaking` (`effects.css:123`) or `.fx-spellflight` (`SpellFlight.css:21`) — both are correctly scoped to short-lived elements.
- Do NOT change any colour, radius or blur value; this plan changes which property carries the animation, not the look.
- Do NOT add a dependency.
- Steps 4 and 5 change a visible ambient texture. If the grain reads as dead once static, report it rather than reinstating the animation — the answer is a lower-frequency gated variant, not a permanent repaint.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run responsive` passes all seven resolutions. `npm run play` completes.
- **Feel check**: run `npm run dev` at 1280×800 (Steam Deck resolution):
  - Open DevTools → Rendering → enable **Paint flashing**. At an idle table, before the fix the whole viewport flashes continuously from the grain; after, it should be still.
  - Enable **Layer borders**. Count the composited layers at an idle table before and after; the aura and shimmer layers should be gone when not animating.
  - Trigger a targeting prompt so five seats go `.is-targetable`. With Paint flashing on, the seat pods must **not** repaint each frame — only the pseudo-element's opacity changes.
  - Win a hand and confirm the winner glow still visibly pulses.
  - Disconnect to make the connection dot go red, then reconnect; confirm the green pulse ring still radiates.
  - Performance panel: record 10 seconds of an idle table. Compare the total scripting+rendering time before and after; rendering should drop substantially.
- **Done when**: paint flashing shows a still viewport at an idle table, no `will-change` remains on a non-animating element, and every state cue (winner, targetable, connected) still reads.
