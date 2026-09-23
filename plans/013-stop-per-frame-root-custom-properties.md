# 013 — Stop writing custom properties to the app root every frame

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: MEDIUM
- **Category**: 5 (Performance)
- **Estimated scope**: 2 files, small

## Problem

Custom properties inherit. Writing one on the app root invalidates computed style for **every descendant** — the whole table: six seats, ~17 cards, the rail, the action bar. The VFX layer does this three times per frame during a shake, and once per frame during a slow-mo ramp and a chromatic split.

```ts
/* src/vfx/VfxLayer.tsx:265-269 — current */
root.classList.add('vfx-shaking');
root.style.setProperty('--vfx-shake-x', `${cx.toFixed(2)}px`);
root.style.setProperty('--vfx-shake-y', `${cy.toFixed(2)}px`);
root.style.setProperty('--vfx-shake-rot', `${cr.toFixed(3)}deg`);
```

The only consumer is the root's own `.vfx-shaking` rule (`src/vfx/effects.css:124`). No child reads these, so the whole-subtree invalidation is pure waste — the values are being routed through the inheritance system to reach the element they were set on.

```ts
/* src/vfx/VfxLayer.tsx:386 — current */
document.documentElement.style.setProperty('--vfx-time-scale', String(r));
```

Per-frame write on `<html>` — the broadest possible invalidation — during every slow-mo ramp. And `--vfx-time-scale` has **no consumer anywhere in the codebase**. Verified:

```
$ grep -rn "vfx-time-scale" src
src/vfx/README.md:226   (documents the intended usage)
src/vfx/README.md:230   (documents the intended usage)
src/vfx/VfxLayer.tsx:386
src/vfx/VfxLayer.tsx:450
```

`README.md:226-230` describes an intended `animation-duration: calc(var(--t-base) / var(--vfx-time-scale, 1))` pattern that was never written into any stylesheet. The README is honest about this — it says "Treat it as a broadcast, not an enforcement" — but the broadcast currently reaches nobody at full per-frame cost.

```ts
/* src/vfx/VfxLayer.tsx:359 — current */
if (root !== null) root.style.setProperty('--vfx-ab', `${v}px`);
```

Called every frame from `tickChromatic`. Its only consumer is `.vfx-chromatic-cheap` (`src/vfx/effects.css:139-140`), which animates a two-layer `text-shadow` — a text repaint property — on the fallback path.

## Target

**Shake**: write the transform directly. One element's style changes; nothing inherits.

```ts
/* target — src/vfx/VfxLayer.tsx:265-269 */
root.classList.add('vfx-shaking');
/* Set the transform on the element itself rather than routing it through
   inherited custom properties — a custom property on the root invalidates
   computed style for every descendant, and nothing but this element reads it. */
root.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0) rotate(${cr.toFixed(3)}deg)`;
```

and on reset (`src/vfx/VfxLayer.tsx:255-260`):

```ts
/* target */
this.shakeActive = false;
root.classList.remove('vfx-shaking');
root.style.transform = '';
return;
```

`src/vfx/effects.css:123-127` keeps `will-change: transform` on `.vfx-shaking` — that part is already correct, scoped to the duration of the shake.

**Slow-mo**: delete the publication entirely. It costs a per-frame `<html>` invalidation and reaches nothing.

```ts
/* target — src/vfx/VfxLayer.tsx, slowmo */
/* The ramp still runs and still drives anything that reads it through the
   controller; it no longer writes a CSS variable nobody consumes. */
```

If a future consumer wants it, reintroduce it then — and read it in exactly one place rather than inheriting it to the whole document.

**Chromatic**: keep the custom property (its consumer is real), but only write it when the value actually changed at the precision the CSS uses:

```ts
/* target — src/vfx/VfxLayer.tsx:355-362 */
const px = v.toFixed(2);
if (px !== this.lastAb) {
  this.lastAb = px;
  if (root !== null) root.style.setProperty('--vfx-ab', `${px}px`);
}
```

A 260ms chromatic split at 60fps resolves to far fewer than 16 distinct values at 2dp near the tail, so this cuts most of the writes for free.

## Repo conventions to follow

- `src/vfx/VfxLayer.tsx` already guards against the fx layer shaking itself (`transformableRoot()` at `:150` returns null if the chosen root contains the layer's own node). That guard stays — the new code must still go through `transformableRoot()`, not `document.documentElement` directly.
- `src/vfx/README.md` documents the public surface of `vfx`. Any removal must be reflected there.

## Steps

1. `src/vfx/VfxLayer.tsx:265-269` — replace the three `setProperty` calls with the direct `root.style.transform` assignment in **Target**.
2. `src/vfx/VfxLayer.tsx:255-260` — replace the three zeroing `setProperty` calls with `root.style.transform = '';`.
3. `src/vfx/effects.css:123-127` — the `.vfx-shaking` rule currently composes the transform from the three custom properties. Replace its `transform` declaration with nothing (the inline style now carries it) but **keep** `will-change: transform`. Read the rule first; if it also sets `transform-origin` or similar, keep those.
4. `src/vfx/VfxLayer.tsx:386` — delete the `--vfx-time-scale` write. Keep the easing ramp itself if anything else reads `r`; if `r` becomes unused, remove the ramp's body but keep `vfx.slowmo()` as a no-op-with-a-comment rather than removing the public method — `src/lib/fxbridge.ts:163` calls it.
5. `src/vfx/VfxLayer.tsx:450` — update or remove the doc comment for slow-mo to match.
6. `src/vfx/README.md:220-235` — rewrite the `vfx.slowmo` section to say plainly that it currently has no consumer and publishes nothing, or remove the section if step 4 removed the method's effect. Do not leave the README describing behaviour that does not exist.
7. `src/vfx/VfxLayer.tsx:355-362` — add the `lastAb` dedupe as in **Target**; declare `private lastAb = '';` on the controller class and reset it when the chromatic effect ends.

## Boundaries

- Do NOT remove `vfx.slowmo` from the public API — `fxbridge.ts` calls it and removing it breaks the impossible-hand sequence.
- Do NOT remove `--vfx-ab`; it has a real consumer on the fallback path.
- Do NOT change the shake maths, the clamps (`SHAKE_CLAMP_PX`, `SHAKE_CLAMP_DEG`), the decay curve, or the 8-shake limit.
- Do NOT bypass `transformableRoot()`.
- Do NOT add a dependency.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `grep -rn "vfx-time-scale" src` should return only README text (or nothing). `npm run play` completes.
- **Feel check**: run `npm run dev`:
  - Trigger a big shake (win an all-in, or an impossible hand). The shake must look **identical** to before — same magnitude, same decay, same rotation.
  - Fire several shakes in quick succession; they must still layer rather than restart.
  - Confirm the fx layer itself does not shake with the root (particles should stay still while the table shakes).
  - DevTools → Performance, record during a shake. In the flame chart, "Recalculate Style" entries should drop sharply — before the fix each frame recalculates the whole table subtree.
  - Trigger a chromatic split; the RGB fringe must look unchanged.
  - Confirm the impossible-hand sequence (`fxbridge.ts:159-165`) still runs end to end without throwing.
- **Done when**: the shake is visually unchanged, Recalculate Style cost during a shake is a fraction of what it was, and nothing writes a CSS variable that has no reader.
