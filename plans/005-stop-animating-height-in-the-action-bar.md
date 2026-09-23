# 005 — Stop animating height in the action bar

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: HIGH
- **Category**: 5 (Performance) / 1 (Purpose & frequency)
- **Estimated scope**: 2 files, small

## Problem

The raise panel animates `height`, which is the first property the performance rules name: it triggers layout, then paint, then composite, on every frame.

```tsx
/* src/components/table/ActionBar.tsx:95-101 — current */
<AnimatePresence>
  {raising ? (
    <motion.div
      className="ab-raise"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
```

`height: 'auto'` forces framer-motion to measure the element, then tween a pixel height, reflowing `.ab-raise` and everything below it in the action bar on each of ~13 frames.

Two things make this the worst possible placement. First, frequency: the panel is opened many times per hand. Second, it is opened by keyboard and by pad —

```tsx
/* src/components/table/ActionBar.tsx:60 — current */
else if (k === 'r' && canRaise) setRaising((v) => !v);
```

and gamepad X routes to the same key (`src/components/shell/GamepadLayer.tsx:169-170`). So the costliest animation in the app sits on a keyboard-initiated action, which the frequency rules say should not animate at all.

The entrance of the action bar itself compounds it:

```tsx
/* src/components/table/ActionBar.tsx:81-91 — current */
<AnimatePresence mode="wait">
  {yourTurn ? (
    <motion.div
      key="acting"
      className="ab-inner"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 42, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
      transition={reducedMotion
        ? { duration: 0.12 }
        : { type: 'spring', stiffness: 480, damping: 28, mass: 0.9 }}
    >
```

`mode="wait"` serialises the idle text's exit before Fold/Check/Call mount, then slides them 42px on a spring — on **every turn**, hundreds of times per session, on the highest-frequency element in the game.

## Target

Animate `grid-template-rows` from `0fr` to `1fr`, which the compositor handles without framer measuring anything, and which needs no JS at all. The panel keeps its reveal; the reflow storm goes.

```tsx
/* target — src/components/table/ActionBar.tsx, replacing the AnimatePresence block at :95-101 */
<div className={`ab-raisewrap ${raising ? 'is-open' : ''}`}>
  <div className="ab-raise">
    {/* ...existing children, unchanged... */}
  </div>
</div>
```

```css
/* target — new rules in src/scenes/table.css, next to the existing .ab-raise rule */
.ab-raisewrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--t-fast) var(--ease-out),
              opacity var(--t-fast) var(--ease-out);
  opacity: 0;
}
.ab-raisewrap.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
}
.ab-raise {
  overflow: hidden;   /* required: the 0fr row must clip its content */
  min-height: 0;      /* required: grid items default to min-content */
}
```

`--t-fast` is 160ms, inside the 150–250ms dropdown budget and shorter than the current 220ms.

For the action bar's own entrance, keep the spring but drop `mode="wait"` so the idle text and the buttons crossfade instead of queueing, and cut the travel from 42px to 12px — a 42px slide on something you see every turn is decoration, not explanation:

```tsx
/* target — src/components/table/ActionBar.tsx:81-91 */
<AnimatePresence>
  {yourTurn ? (
    <motion.div
      key="acting"
      className="ab-inner"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      transition={reducedMotion
        ? { duration: 0.12 }
        : { type: 'spring', duration: 0.3, bounce: 0.1 }}
    >
```

`{ type: 'spring', duration: 0.3, bounce: 0.1 }` is the Apple-style spring form — a duration and a bounce rather than four hand-tuned physics constants. Bounce stays low because this is a crisp control, not a celebration.

## Repo conventions to follow

- Motion durations come from `src/styles/tokens.css`: `--t-instant: 90ms`, `--t-fast: 160ms`, `--t-base: 260ms`. Use the token in CSS, never a literal.
- `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` is the house entrance curve.
- The action-bar styles live in `src/scenes/table.css` around `.ab-raise` / `.ab-presets` (`:830`+). Put the new rules there, not in a new file.

## Steps

1. `src/scenes/table.css` — find the existing `.ab-raise` rule and add `overflow: hidden; min-height: 0;` to it. Add the new `.ab-raisewrap` and `.ab-raisewrap.is-open` rules directly above it, exactly as in **Target**.
2. `src/components/table/ActionBar.tsx:95-101` — replace the `AnimatePresence` + `motion.div` with the plain wrapper markup in **Target**. The children of `.ab-raise` do not change. Keep the `raising` state and the `r`-key toggle exactly as they are.
3. `src/components/table/ActionBar.tsx:81-91` — apply the entrance changes in **Target**: drop `mode="wait"`, drop `scale`, reduce `y` to 12/6, and replace the spring config.
4. Check whether `AnimatePresence` is still imported and used elsewhere in the file; if step 2 removed the last use of a symbol, remove it from the import.
5. Confirm the raise panel still traps nothing and that the bet slider inside it still receives focus when opened — the wrapper must not introduce `pointer-events: none` or a stacking context that breaks it.

## Boundaries

- Do NOT change the raise slider, the preset buttons, the amount state, or any `act()` call.
- Do NOT change the keyboard handling at `src/components/table/ActionBar.tsx:55-62`.
- Do NOT remove the `reducedMotion` branches — they are load-bearing.
- Do NOT add a dependency.
- If the `.ab-raise` markup differs from what is quoted, STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run play` (Playwright full playthrough) must still complete — it drives the betting phase.
- **Feel check**: run `npm run dev`, sit at the table, and on your turn:
  - Press `r` repeatedly, fast. The panel must open and close smoothly and **retarget mid-travel** — it must never jump or restart.
  - Open DevTools → Performance, record while pressing `r` five times. Confirm there are **no "Layout" entries** attributable to `.ab-raise` during the open/close. Before the fix there is one per frame.
  - With the Animations panel at 10%, confirm the panel grows from the top edge downward and the buttons below it do not judder.
  - On your turn, confirm Fold/Check/Call appear as the idle text fades — overlapping, not one after the other.
- **Done when**: no layout is triggered by opening the raise panel, the `r` key can be hammered without visual glitching, and `npm run play` and `npm run play:pad` are both green.
