# 004 — Stop animations gating keyboard and gamepad navigation

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: HIGH
- **Category**: 1 (Purpose & frequency)
- **Estimated scope**: 6 files, medium

## Problem

HEXHOLD is playable entirely by keyboard and gamepad. Animation on a keyboard-initiated action is the single worst placement in the frequency table — those actions happen 100+ times a session and get **no animation, ever**. This codebase animates most of them, and one line turns each of those animations into an actual input block.

**The mechanism.** The gamepad focus system skips anything still fading in:

```tsx
/* src/components/shell/GamepadLayer.tsx:74-75 — current */
if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
if (Number(cs.opacity) < 0.2) continue;
```

Every `initial={{ opacity: 0 }}` in the app therefore makes its element unreachable by d-pad until the fade passes 20%. This converts each finding below from "looks slow" into "the controller does not respond yet".

**1. Scene transitions — ~840ms of dead time.**

```tsx
/* src/App.tsx:34-39 — current */
const sceneMotion = {
  initial: { opacity: 0, scale: 0.985 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.01 },
  transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const },
};
```

```tsx
/* src/App.tsx:129-130 — current */
<AnimatePresence mode="wait">
  <motion.div key={screen} className="scene" {...sceneMotion}>
```

`mode="wait"` serialises exit **then** enter: 420ms + 420ms. "Practice vs Bots" (`src/scenes/Menu.tsx:56-69`) crosses menu → lobby → game and pays it twice back to back.

**2. Menu pane navigation — ~680ms per press.**

```tsx
/* src/scenes/Menu.tsx:234-239 — current */
const paneMotion = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const },
};
```

with `<AnimatePresence mode="wait">` at `src/scenes/Menu.tsx:103`. The `autoFocus` field at `:160`/`:186` cannot take focus until the new pane mounts, so a controller user presses A and waits.

**3. The pause menu.** This is the command-palette case: a palette that opens instantly is correct; one that animates is not.

```tsx
/* src/components/shell/SystemMenu.tsx:93 — current (scrim) */
transition={{ duration: motionDuration(0.18, reduceMotion) }}
/* src/components/shell/SystemMenu.tsx:104-107 — current (panel) */
initial={{ opacity: 0, y: 16, scale: 0.97 }}
/* ... */
transition={{ duration: motionDuration(0.22, reduceMotion) }}
```

It is opened **only** by Escape (`:56-74`) or pad Start/B (`GamepadLayer.tsx:164-166, 185-187`), and it animates in *and* out — so Escape-to-resume also delays the return of input to a table that does not pause.

**4. Intro panels.** `<AnimatePresence mode="wait">` at `src/components/onboarding/IntroFlow.tsx:320` with `duration: 0.32` (`:286`). Navigation is ArrowLeft/ArrowRight/Enter (`:262-271`), so each arrow press costs 640ms across seven panels.

**5. The codex list.** Re-mounts on a `role="tab"` switch (`:41-43`) and on every school filter chip (`:56-70`), both keyboard/pad driven:

```tsx
/* src/components/Codex.tsx:85-87 — current */
transition={{ delay: Math.min(i * 0.015, 0.3), duration: 0.24 }}
```

Up to 300ms of stagger plus 240ms before the last entry is focusable.

## Target

The rule: **if the only way to trigger it is a key or a pad button, it does not animate.** Where a fade genuinely helps (a full scene swap), keep a short one but never serialise exit before enter.

```tsx
/* target — src/App.tsx:34-39 */
const sceneMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] as const },
};
```

```tsx
/* target — src/App.tsx:129 */
<AnimatePresence>
```

Dropping `mode="wait"` means the two scenes crossfade rather than queue: total time 160ms instead of 840ms. The `scale` goes because a scale on a full-screen crossfade reads as drift, not as motion with a purpose.

```tsx
/* target — src/scenes/Menu.tsx:234-239 */
const paneMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.12, ease: [0.16, 1, 0.3, 1] as const },
};
```

with `<AnimatePresence>` (no `mode="wait"`) at `src/scenes/Menu.tsx:103`.

```tsx
/* target — src/components/shell/SystemMenu.tsx: no animation at all */
/* Replace the two motion.div wrappers with plain <div>s and drop the
   AnimatePresence. The pause menu appears and disappears on the frame the key
   is pressed. A table that does not pause must not delay the pause key. */
```

```tsx
/* target — src/components/onboarding/IntroFlow.tsx:320 */
<AnimatePresence>   /* no mode="wait" */
/* and at :286 */
transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] as const }
```

```tsx
/* target — src/components/Codex.tsx:85-87 */
transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
```

Stagger removed entirely: it is decorative and it was blocking pad focus for up to 300ms on a tab switch.

**And fix the focus gate itself**, so a future entrance animation cannot silently re-create this class of bug:

```tsx
/* target — src/components/shell/GamepadLayer.tsx:74-75 */
if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
/* An element that is mounted and hit-testable is focusable, even mid-fade.
   Gating on opacity made every entrance animation an input block. */
```

## Repo conventions to follow

- Framer transitions in this repo are written inline as `transition={{ duration: n, ease: [0.16, 1, 0.3, 1] }}`. Plan 015 tokenises these; until then, match the existing literal form exactly so 015's find-and-replace still works.
- `src/components/Toasts.tsx:17` is the repo's own example of a short, correct, non-blocking entrance — `duration: 0.24` with no `mode="wait"`.

## Steps

1. `src/components/shell/GamepadLayer.tsx:75` — delete the `if (Number(cs.opacity) < 0.2) continue;` line. Verify nothing else in `candidates()` depends on it.
2. `src/App.tsx:34-39` — replace `sceneMotion` as in **Target**. `src/App.tsx:129` — change `<AnimatePresence mode="wait">` to `<AnimatePresence>`.
3. `src/scenes/Menu.tsx:234-239` — replace `paneMotion` as in **Target**. `src/scenes/Menu.tsx:103` — drop `mode="wait"`.
4. `src/components/shell/SystemMenu.tsx:88-110` — replace the `AnimatePresence` + two `motion.div`s with plain `div`s carrying the same `className`, `role`, `aria-modal` and ref props. Remove the now-unused `motion`/`AnimatePresence` imports and the `motionDuration`/`reduceMotion` usage **only if** nothing else in the file needs them. Keep the focus trap (`useFocusTrap`) and the Escape handling exactly as they are.
5. `src/components/onboarding/IntroFlow.tsx:320` — drop `mode="wait"`. `:286` — change `duration: 0.32` to `duration: 0.16`.
6. `src/components/Codex.tsx:87` — replace the transition as in **Target**, removing the `delay` entirely.

## Boundaries

- Do NOT remove the `AnimatePresence` wrappers themselves except in SystemMenu — exit animations elsewhere depend on them.
- Do NOT touch the focus-trap logic, the Escape key handling, or any `autoFocus` prop.
- Do NOT change what the scenes are or how routing works — motion only.
- Do NOT touch `src/components/table/ActionBar.tsx` here; it is plan 005.
- Do NOT add a dependency.
- If step 4's markup does not match, STOP and report rather than restructuring the dialog.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. **`npm run play:pad` must pass all 9 checks** — this is the controller harness and it is the direct regression test for step 1.
- **Feel check**: run `npm run dev` with a controller connected (or use `npm run play:pad`):
  - Press Start to open the pause menu. It must appear **on the frame you press**, with no fade. Press B to close — same.
  - On the menu, press A into "Host" and immediately press d-pad down. Focus must move on the first press, not after a wait.
  - Start "Practice vs Bots" and count: menu → lobby → table should feel roughly half as long as before.
  - In the Codex, hold the d-pad and switch tabs repeatedly. Every entry must be focusable immediately; nothing should be skipped.
  - With DevTools Animations panel at 25% speed, switch a menu pane and confirm the outgoing and incoming panes **overlap** rather than queue.
- **Done when**: `npm run play:pad` is green, the pause menu has no transition, and no d-pad press is ever swallowed by an element still fading in.
