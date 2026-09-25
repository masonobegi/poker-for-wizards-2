# 003 — Wire the particle-density setting to the VFX layer

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: HIGH
- **Category**: 6 (Accessibility)
- **Estimated scope**: 3 files, small

## Problem

Settings presents a three-way particle-density control:

```tsx
/* src/components/SettingsPanel.tsx:181-185 — current */
const PARTICLE_OPTIONS: ParticleDensity[] = ['off', 'low', 'full'];
/* ... */
const [density, setDensity] = useParticleDensity();
```

`setParticleDensity` persists to `localStorage['hexhold.particles']` and notifies subscribers. **Nothing in `src/vfx/` ever reads it.** Verified:

```
$ grep -rn "ParticleDensity|hexhold.particles|particleDensity" src
src/components/SettingsPanel.tsx   (the UI)
src/components/shell/videoPrefs.ts (the store)
src/lib/cloud.ts:23                (syncs the key to Steam Cloud)
```

The particle system has exactly one density knob, and it is driven by the *reduced-motion* flag, not by this setting:

```ts
/* src/vfx/particles.ts:358-361 — current */
private spawn(spec: EmitSpec): void {
  const lite = prefersReducedMotion();
  let count = spec.count;
  if (lite) count = Math.max(1, Math.round(count * 0.2));
```

So selecting **"off"** does not turn particles off. It changes nothing, persists the non-effect, and syncs it to the player's other devices via `cloud.ts`. A player who turns particles off for performance or comfort reasons gets the full 1400-particle budget and no indication anything is wrong.

## Target

`particles.ts` reads the density setting the same lazy, module-level way it already reads the reduced-motion attribute — no new imports into `src/vfx/` from `src/components/`, which would invert the dependency direction the folder is built on ("Nothing in here depends on anything but React", `src/vfx/README.md`).

The setting is published as a data attribute, exactly like reduced motion:

```ts
/* target — src/components/shell/videoPrefs.ts, alongside applyReducedMotion */

/** Published as an attribute so `src/vfx/` can read it without importing from
 *  the component tree — same mechanism as data-reduced-motion. */
function applyParticleDensity(v: ParticleDensity): void {
  if (!hasDom()) return;
  try { document.documentElement.dataset.particles = v; } catch { /* ignore */ }
}
```

```ts
/* target — src/vfx/particles.ts, next to reducedByAttribute() at :142 */

/** 'off' | 'low' | 'full', published by videoPrefs.ts. Unset means 'full'. */
function densityScale(): number {
  if (typeof document === 'undefined') return 1;
  const v = document.documentElement.dataset.particles;
  if (v === 'off') return 0;
  if (v === 'low') return 0.35;
  return 1;
}
```

```ts
/* target — src/vfx/particles.ts, replacing the head of spawn() at :358-361 */
private spawn(spec: EmitSpec): void {
  const scale = densityScale();
  if (scale === 0) return;                       // 'off' means off.
  let count = spec.count;
  if (scale !== 1) count = Math.max(1, Math.round(count * scale));
  if (prefersReducedMotion()) count = Math.max(1, Math.round(count * 0.2));
  const room = MAX_PARTICLES - this.n;
  if (room <= 0) return;
  if (count > room) count = room;
```

Scale values: `off` = 0 (no particles at all), `low` = 0.35, `full` = 1. The reduced-motion 0.2× multiplier stacks on top, so "low + reduced motion" is 0.07× rather than either one alone — both preferences are honoured.

## Repo conventions to follow

- `src/vfx/particles.ts:142-145` already reads a preference off `document.documentElement.dataset` at call time rather than caching it:
  ```ts
  /* src/vfx/particles.ts:142-145 — the exemplar */
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.reducedMotion === '1';
  ```
  Imitate this exactly: `typeof document === 'undefined'` guard first, read at call time so a settings change takes effect on the next burst with no subscription plumbing.
- `videoPrefs.ts` applies its side effect in an `applyX` function called both at module init and from the setter. Follow that shape.

## Steps

1. `src/components/shell/videoPrefs.ts` — add `applyParticleDensity` as in **Target**. Call it once at module scope right after `let particleDensity: ParticleDensity = ...` (line ~42), and again inside `setParticleDensity` at `:47-48`, before notifying subscribers.
2. `src/vfx/particles.ts` — add `densityScale()` immediately after `reducedByAttribute()` (around line 146).
3. `src/vfx/particles.ts:358-361` — replace the head of `spawn()` as in **Target**.
4. `src/vfx/README.md` — in the "Reduced motion" section, add a sentence that the particle count is additionally scaled by `document.documentElement.dataset.particles` (`off` = 0, `low` = 0.35, `full` = 1), set by the in-game Settings panel.
5. Confirm `src/lib/cloud.ts:23` still lists `'hexhold.particles'` — it should; the key now means something.

## Boundaries

- Do NOT import anything from `src/components/` into `src/vfx/`. The folder's independence is a stated design property.
- Do NOT change `MAX_PARTICLES` (1400), any preset, or the pool allocation.
- Do NOT change what 'off' means for the non-particle effects (shake, flash, vignette, chromatic) — those follow reduced motion, not this setting, and that split is intentional.
- Do NOT add a dependency.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green.
- **Feel check**: run `npm run dev`, play to a showdown, then:
  - Settings → Particles → **off**. Win a hand. Confirm **zero** particles spawn — no coins, no sparks, no confetti — while the screen flash and shake still play.
  - Settings → Particles → **low**. Win a hand. Confirm particles appear but visibly thinner than full.
  - Settings → Particles → **full**. Confirm the original density.
  - Change the setting **mid-hand** and fire an effect; it must take effect on the next burst with no reload.
  - In DevTools, confirm `<html data-particles="off">` is present.
- **Done when**: each of the three options produces a visibly different particle count, 'off' produces none, and the setting survives a reload.
