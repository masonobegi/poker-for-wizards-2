# 001 — Stop framer-motion's inline transform from clobbering CSS centring

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: HIGH
- **Category**: 3 (Physicality & origin) / rendering correctness
- **Estimated scope**: 5 files, small

## Problem

This is a live rendering bug, not a polish item. Three elements centre themselves
with a `transform` in the stylesheet, and are then animated by framer-motion,
which writes its own `transform` to the element's inline `style`. Inline style
beats the stylesheet, so the centring transform is silently discarded for the
entire life of the element.

**1. Every tooltip in the game.**

```css
/* src/styles/ui.css:227-244 — current */
.tip-body {
  position: absolute;
  z-index: var(--z-modal);
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: 280px;
  /* ... */
}
.tip-body::after {
  content: '';
  position: absolute;
  top: 100%; left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--line);
}
```

```tsx
/* src/components/ui/kit.tsx:165-173 — current */
<motion.span
  className="tip-body"
  role="tooltip"
  initial={{ opacity: 0, y: 6, scale: 0.96 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  exit={{ opacity: 0, y: 4, scale: 0.98 }}
  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
>
```

framer writes `transform: translateY(6px) scale(0.96)` on mount and
`transform: none` at rest. `translateX(-50%)` never applies. Every tooltip
renders with its left edge at the trigger's centre instead of being centred on
it — offset by half its own width, up to 140px. `Tooltip` is used on the pot
side-pots, every seat relic and every seat flag.

**2. The omen popover.** Same defect, vertical:

```css
/* src/components/omens.css:63-68 — current */
.omen-tip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-modal);
  width: 270px;
```

```tsx
/* src/components/OmenBar.tsx:53-59 — current */
<motion.div
  className="omen-tip"
  role="tooltip"
  initial={{ opacity: 0, y: -6 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -4 }}
  transition={{ duration: 0.16 }}
>
```

A fixed 270px tip, so it hangs 135px to the right of its chip.

**3. The banner glow bar.**

```tsx
/* src/components/BannerLayer.tsx:70-85 — current */
<motion.div
  initial={{ scaleX: 0, opacity: 0 }}
  animate={{ scaleX: 1, opacity: 1 }}
  exit={{ scaleX: 1.2, opacity: 0 }}
  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
  style={{
    position: 'absolute',
    inset: '0 0 auto',
    top: '50%',
    height: 170,
    transform: 'translateY(-50%)',
    /* ... */
  }}
/>
```

A `transform` in the `style` prop of a `motion` component is overwritten by the
animated `scaleX`. The bar is 170px tall and is supposed to be centred on
`top: 50%`; without the `-50%` correction it sits 85px below the headline it is
meant to sit behind.

## Target

The rule is: **an element that framer-motion animates must not rely on a CSS
`transform` for its layout position.** Move positioning to layout properties, and
leave `transform` entirely to the animation.

```css
/* target — src/styles/ui.css */
.tip-body {
  position: absolute;
  z-index: var(--z-modal);
  bottom: calc(100% + 10px);
  left: 50%;
  translate: -50% 0;        /* independent of `transform`; framer does not write it */
  width: max-content;
  max-width: 280px;
  /* ...rest unchanged... */
}
```

`translate` is a separate longhand from `transform` in CSS Transforms Level 2.
framer-motion writes only `transform`, so the two no longer collide. It is
supported in Chrome 104+, and this ships in Electron 44 (Chromium 136+) and
modern browsers only — `package.json` already targets `node20`/Electron 44.

The `::after` arrow is a plain pseudo-element that framer never touches, so it
keeps `transform: translateX(-50%)` and needs no change.

```css
/* target — src/components/omens.css */
.omen-tip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  translate: -50% 0;
  z-index: var(--z-modal);
  width: 270px;
  /* ...rest unchanged... */
}
```

```tsx
/* target — src/components/BannerLayer.tsx:70-85 */
<motion.div
  initial={{ scaleX: 0, opacity: 0 }}
  animate={{ scaleX: 1, opacity: 1 }}
  exit={{ scaleX: 1.2, opacity: 0 }}
  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
  style={{
    position: 'absolute',
    inset: '0 0 auto',
    top: '50%',
    height: 170,
    translate: '0 -50%',
    /* ...rest unchanged, MINUS the `transform` key... */
  }}
/>
```

## Repo conventions to follow

- The codebase already gets this right in one place: `src/scenes/table.css:747`
  (`.sigil-tip`) is animated by **CSS transitions**, not framer, so its
  `transform: translateX(-50%) translateY(6px)` is safe as-is. Do not "fix" it.
- Tooltips keep their existing `--z-modal` and `--e-3`/`--e-4` tokens.

## Steps

1. `src/styles/ui.css:232` — in `.tip-body`, replace `transform: translateX(-50%);`
   with `translate: -50% 0;`. Leave `.tip-body::after` (line 245-252) untouched.
2. `src/components/omens.css:67` — in `.omen-tip`, replace
   `transform: translateX(-50%);` with `translate: -50% 0;`.
3. `src/components/BannerLayer.tsx:80` — in the glow bar's `style` object, replace
   `transform: 'translateY(-50%)',` with `translate: '0 -50%',`.
4. Grep for any other collision before finishing:
   `grep -rn "translateX(-50%)\|translateY(-50%)" src --include=*.css --include=*.tsx`
   For each hit, check whether the element carries a `motion.` component or a
   framer `style`/`animate` transform. If it does, apply the same fix. If it is
   animated only by a CSS transition, leave it alone.

## Boundaries

- Do NOT touch `src/scenes/table.css` `.sigil-tip` — it is CSS-transition driven and correct.
- Do NOT change the tooltip's trigger logic, timing, placement side, or z-index.
- Do NOT change the animation values in this plan — only where the position lives.
- Do NOT add a dependency (no Floating UI, no Popper).
- If a step does not match what you find, STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` (104 tests) stays green.
- **Feel check**: run `npm run dev`, then:
  - Hover the pot when there is a side pot (needs 3+ players, one all-in). The
    tooltip must be **horizontally centred over the pot**, with its arrow pointing
    at the pot's middle. Before the fix it sits visibly to the right.
  - Hover a seat relic icon — same check.
  - Open the omen bar and hover an omen chip; the 270px tip must be centred under
    the chip, not hanging off its right edge.
  - Trigger a phase banner (deal a hand; the flop banner fires). The dark glow bar
    must sit **behind the headline text**, vertically centred on it.
  - In DevTools, inspect a live `.tip-body` and confirm the computed `translate`
    is `-50% 0` and that the inline `transform` from framer no longer affects
    horizontal position.
- **Done when**: all three elements are centred on their trigger at rest and
  mid-animation, at 1280x800 and at 3840x2160 (`npm run responsive` covers the
  resolutions; check the tooltips by eye at two of them).
