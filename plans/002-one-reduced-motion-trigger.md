# 002 — Make reduced motion one trigger, and gentle rather than zero

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: HIGH
- **Category**: 6 (Accessibility)
- **Estimated scope**: 6 files, medium

## Problem

There are **two independent ways** to ask HEXHOLD for less motion, and they reach almost disjoint sets of code.

**Path A — the OS setting.** `@media (prefers-reduced-motion: reduce)` fires. Three blocks respond: `src/styles/tokens.css:145-158`, `src/components/card/card.css:846-867`, `src/vfx/effects.css:377-395`.

**Path B — the in-game toggle** in Settings. It sets a data attribute:

```ts
/* src/components/shell/videoPrefs.ts:112-118 — current */
function applyReducedMotion(v: boolean): void {
  if (!hasDom()) return;
  try { document.documentElement.dataset.reducedMotion = v ? '1' : ''; } catch { /* ignore */ }
}
```

Exactly **five** CSS rules key off that attribute, verified by grep:

```
src/components/fx/SpellFlight.css:51
src/scenes/table.css:235, :440, :654, :937
```

So a player who has the OS setting off and ticks the in-game toggle on gets: reduced particle counts, no screen shake, no spell flights — and **nothing else**. All 24 `infinite` animations in `card.css` keep running, the 3D card flip keeps rotating, grain/scanlines/shimmer/runes/aura keep animating, and every duration token stays at full length. The toggle's own hint text in `src/components/SettingsPanel.tsx:219-221` promises it cuts "card phasing", which is `hx-q-phase` at `src/components/card/card.css:361` — killed only inside the OS-only media query. The hint is factually wrong for that player.

**Second defect: the OS path removes everything rather than softening it.**

```css
/* src/styles/tokens.css:143-158 — current */
/* Nobody should be motion-sick from a poker game. */
@media (prefers-reduced-motion: reduce) {
  :root {
    --t-instant: 1ms;
    --t-fast: 1ms;
    --t-base: 1ms;
    --t-slow: 1ms;
    --t-scene: 1ms;
  }
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

Reduced motion means fewer and gentler animations, **not zero** — keep the transitions that aid comprehension, remove the position changes. This does the opposite. Concretely:

- A player folding jumps instantly to `opacity: .42` + `grayscale(.6)` (`src/scenes/table.css:128-130`) with no cue that anything changed.
- `animation-iteration-count: 1` does not stop a keyframe — it runs it **once at 1ms**, so elements freeze at whatever their end keyframe is. `hx-float` (`src/components/card/card.css:792-795`) ends at `translateY(-4.5%)`, so winning cards sit permanently half-lifted. `hx-breathe` freezes at `opacity: .55`.
- `!important` on a `*` selector makes per-component reduced-motion handling **impossible to express**: a normal `@media (prefers-reduced-motion: reduce) { .x { animation: fade .2s ease } }` loses to `*{...!important}` at any specificity. The proof is in-repo — three files were forced to escalate: `card.css:861` `animation: none !important`, `card.css:865` `transition: none !important`, `effects.css:386` `animation: none !important`.

**Third defect: four non-equivalent sources of truth.**

| Source | Reads OS? | Reads in-game toggle? | Used by |
| --- | --- | --- | --- |
| `src/components/fx/useReducedMotionPref.ts:24` | yes | yes | RollingNumber, ActionBar, ShowdownPanel, StackOverlay |
| `src/components/shell/reducedMotion.ts:26` | yes | yes | ConnectionBadge, SystemMenu |
| framer's `useReducedMotion()` | yes | **no** | Card.tsx:237, Hints.tsx:55, IntroFlow.tsx:240 |
| `prefersReducedMotion()` in `src/vfx/particles.ts:149` | yes | yes | the particle system |

`src/components/card/Card.tsx:237` uses framer's hook, so the in-game toggle does not disable the deal-in arc, the flip, the shadow pulse or the pointer tilt — on the most motion-heavy component in the game.

Worse, two different hooks share one name: `src/components/shell/videoPrefs.ts:135` exports `useReducedMotionPref()` returning `[boolean, setter]`, while `src/components/fx/useReducedMotionPref.ts:24` exports `useReducedMotionPref()` returning a bare `boolean`. A wrong import is a silent accessibility regression, because the tuple is always truthy.

## Target

**One trigger.** The OS media query sets the same attribute the toggle does, so all CSS keys off `:root[data-reduced-motion='1']` and there is exactly one condition to reason about.

```ts
/* target — src/components/shell/videoPrefs.ts, near applyReducedMotion */

/** The OS preference and the in-game toggle resolve to one attribute, so every
 *  stylesheet has a single condition to key off. The toggle wins when it is on;
 *  when it is off we follow the OS. */
function systemPrefersReduced(): boolean {
  if (!hasDom()) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

function applyReducedMotion(v: boolean): void {
  if (!hasDom()) return;
  const on = v || systemPrefersReduced();
  try { document.documentElement.dataset.reducedMotion = on ? '1' : ''; } catch { /* ignore */ }
}
```

plus a listener so an OS change mid-session re-applies:

```ts
/* target — src/components/shell/videoPrefs.ts, module scope, after the initial apply */
if (hasDom()) {
  try {
    window.matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', () => { applyReducedMotion(reducedMotion); });
  } catch { /* ignore */ }
}
```

**Gentle, not zero.** Replace the `*` nuke with a rule that keeps opacity and colour and kills movement:

```css
/* target — src/styles/tokens.css, replacing lines 143-158 */

/* Reduce motion: fewer and calmer, never blunter. Opacity and colour still
   carry state changes — those are what tell you a player folded. Movement,
   looping ambience and overshoot go. The OS media query and the in-game toggle
   both resolve to [data-reduced-motion='1'] in videoPrefs.ts, so this is the
   only condition anything needs to match. */
:root[data-reduced-motion='1'] {
  --t-instant: 60ms;
  --t-fast: 100ms;
  --t-base: 140ms;
  --t-slow: 180ms;
  --t-scene: 200ms;

  /* Overshoot reads as nausea, not delight, under reduced motion. */
  --ease-snap: cubic-bezier(0.16, 1, 0.3, 1);
}
```

Note what this deliberately does **not** contain: no `*` selector, no `!important`, no `animation-iteration-count`. Components that need their own reduced-motion behaviour can now express it normally, at normal specificity.

The per-file blocks then change their condition and drop their `!important` escalations, since nothing outranks them any more.

## Repo conventions to follow

- `src/vfx/effects.css:377-395` is the model to imitate — it stops motion but authors a real resting state rather than a frozen mid-keyframe:
  ```css
  /* src/vfx/effects.css:389-392 — the correct pattern, already in the repo */
  .vfx-pulse i {
    animation: none;
    opacity: calc(var(--pulse-intensity, .75) * .5);
    transform: scale(1.1);
  }
  ```
  Its comment at `:374` states the goal: "Nothing disappears — it just stops moving."
- `src/components/fx/useReducedMotionPref.ts:3-9` already declares itself "the single source of truth". Make that true.

## Steps

1. `src/components/shell/videoPrefs.ts` — add `systemPrefersReduced()` and rewrite `applyReducedMotion` exactly as in **Target**. Add the `matchMedia` change listener at module scope, after the existing `applyReducedMotion(reducedMotion);` call on line ~119.
2. `src/styles/tokens.css:143-158` — delete the whole `@media (prefers-reduced-motion: reduce)` block and replace it with the `:root[data-reduced-motion='1']` block in **Target**.
3. `src/components/card/card.css:846` — change the block's opening from `@media (prefers-reduced-motion: reduce) {` to a set of `:root[data-reduced-motion='1'] <selector>` rules: every selector inside must be prefixed by the attribute instead of nested in a media query — i.e. `.hx-card__lift { ... }` becomes `:root[data-reduced-motion='1'] .hx-card__lift { ... }`. Then remove the now-unnecessary `!important` at `:861` and `:865`.
   **For each animation this block kills, add an authored resting state**, following the `effects.css:389-392` exemplar. At minimum: `hx-float` must rest at `transform: none` (not the `translateY(-4.5%)` it currently freezes at), and `hx-breathe` must rest at `opacity: 1`.
4. `src/vfx/effects.css:377` — same conversion from media query to attribute selector; drop the `!important` at `:386`. Its resting states are already correct — keep them verbatim.
5. `src/components/card/Card.tsx:237` — replace `const reduced = useReducedMotion() === true;` with the repo's own hook: `import { useReducedMotionPref } from '../fx/useReducedMotionPref';` and `const reduced = useReducedMotionPref();`. Remove `useReducedMotion` from the `framer-motion` import list at `src/components/card/Card.tsx:34-38` if nothing else in the file uses it.
6. Same substitution in `src/components/onboarding/Hints.tsx:55` and `src/components/onboarding/IntroFlow.tsx:240`.
7. Resolve the name collision: rename the shell hook `src/components/shell/videoPrefs.ts:135` from `useReducedMotionPref` to `useReducedMotionSetting` (it returns a `[value, setter]` tuple for the settings UI). Update its importers — `src/components/SettingsPanel.tsx` and `src/components/shell/reducedMotion.ts:8`. Then verify with `grep -rn "useReducedMotionPref" src` that every remaining call site resolves to `src/components/fx/useReducedMotionPref.ts`.
8. Delete the now-dead override channel: `setReducedMotion(value: boolean | null)` at `src/vfx/particles.ts:155` has zero callers in `src/` (verify with `grep -rn "setReducedMotion" src` — the only other hit is the unrelated `videoPrefs.ts` setter). Remove it and the `reducedForced` variable, and simplify `prefersReducedMotion()` at `:149` to `return reduced || reducedByAttribute();`. Update `src/vfx/index.ts` and `src/vfx/README.md`'s "Reduced motion" section to match.
9. `src/components/SettingsPanel.tsx:219-221` — the hint text is now true; verify it matches what actually happens and correct it if not.

## Boundaries

- Do NOT remove reduced-motion handling anywhere. This plan makes it reach further, not less far.
- Do NOT delete the five existing `:root[data-reduced-motion='1']` rules in `table.css` and `SpellFlight.css` — they are already the right pattern.
- Do NOT change any particle preset, or the 0.2× count scaling at `particles.ts:359-361`.
- Do NOT add a dependency.
- If step 3's block does not match what you find, STOP and report — do not guess at resting states for animations you have not read.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green (104 tests). `grep -rn "prefers-reduced-motion" src` should return only `videoPrefs.ts` (the matchMedia calls) and `src/components/fx/useReducedMotionPref.ts` — no stylesheet should still gate on the media query directly.
- **Feel check**: run `npm run dev`. With the OS setting **off**, open Settings and tick "Reduce motion and particles", then:
  - Deal a hand. Cards must arrive without the swooping arc, and no card back should show the `hx-gleam` sweep.
  - Win a hand. The winning cards must sit **flat**, not frozen half-lifted — this is the `hx-float` end-state bug; confirm it is gone.
  - Fold a player. Their seat must still **fade** to 42% opacity over ~140ms — it must not teleport. This is the comprehension cue the old rule destroyed.
  - Press a button. It must still visibly respond; overshoot must be gone.
  - Open DevTools → Rendering → "Emulate prefers-reduced-motion: reduce" with the in-game toggle **off**, and confirm you get the same result.
  - Turn the toggle off with OS emulation off, and confirm full motion returns.
- **Done when**: the in-game toggle and the OS setting produce identical behaviour; no element freezes mid-keyframe; opacity and colour transitions still play at the shortened durations; and `grep -rn '!important' src/components/card/card.css src/vfx/effects.css` returns nothing motion-related.
