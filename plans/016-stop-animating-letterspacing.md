# 016 — Stop animating letter-spacing in the phase banner

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: MEDIUM
- **Category**: 5 (Performance) / 2 (Easing & duration)
- **Estimated scope**: 1 file, small

## Problem

```tsx
/* src/components/BannerLayer.tsx:102-117 — current */
<motion.h1
  initial={{ y: 26, opacity: 0, letterSpacing: '0.5em' }}
  animate={{ y: 0, opacity: 1, letterSpacing: '0.16em' }}
  exit={{ y: -14, opacity: 0 }}
  transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
  style={{
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(30px, 7vw, var(--fs-3xl))',
    fontWeight: 900,
    /* ... */
  }}
>
```

`letterSpacing` is a text-layout property. framer-motion tweens it on the main thread, and every frame forces the browser to re-shape the text run, re-measure the `<h1>`, and re-lay-out its wrapper — which is width-capped:

```tsx
/* src/components/BannerLayer.tsx:88-99 — current */
width: 'min(94vw, 1100px)',
boxSizing: 'border-box',
overflowWrap: 'break-word',
```

The comment at `:93-96` explains the cap exists because the text is server-authored and unbounded (an omen's name, a relic's text). So during the 620ms sweep the headline can genuinely **re-wrap between lines** as the tracking shrinks: layout → paint → composite, ~37 frames, at `clamp(30px, 7vw, var(--fs-3xl))` display size, full-screen.

It also fires on impossible-hand and end-of-run banners — exactly the moments the particle system is busiest.

Two smaller problems in the same component: `y` is a framer shorthand rather than a full transform string, and the sibling elements at `:53` and `:123` have `duration` with no `ease` while `:74` and `:106` do declare one — inconsistency inside one file.

## Target

Drop the `letterSpacing` tween. The tracking becomes a static value in `style`, and the arrival is carried by opacity and a transform, which composite.

```tsx
/* target — src/components/BannerLayer.tsx:102-117 */
<motion.h1
  initial={{ opacity: 0, transform: 'translateY(26px)' }}
  animate={{ opacity: 1, transform: 'translateY(0px)' }}
  exit={{ opacity: 0, transform: 'translateY(-14px)' }}
  transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
  style={{
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(30px, 7vw, var(--fs-3xl))',
    fontWeight: 900,
    letterSpacing: '0.16em',
    /* ...rest unchanged... */
  }}
>
```

If the tracking sweep is wanted as an effect, it can be had for free with a transform: `scaleX` from `1.04` to `1` reads as the letters settling inward and composites on the GPU. That is optional; the safe change is the static value.

The full transform string (`transform: 'translateY(26px)'`) rather than the `y` shorthand is deliberate — shorthands run on the main thread. `src/components/fx/SpellFlight.tsx:160-168` already uses the full-string form and is the in-repo exemplar.

Apply the same treatment to the other two shorthand `y` animations in the file (`:105` exit, `:121` subtitle) and add the missing `ease` at `:53` and `:123`.

## Repo conventions to follow

- `src/components/fx/SpellFlight.tsx:160-168` is the exemplar: full `transform` strings in a keyframe array, not `x`/`y`/`scale` shorthands.
- After plan 015 lands, `[0.16, 1, 0.3, 1]` becomes `EASE_OUT` from `src/styles/motion.ts`. If 015 has already landed, use the constant; if not, use the literal and 015 will convert it.
- The 620ms duration stays: this is a full-screen celebratory announcement, which the duration budget explicitly allows to run long. Only the *property* is wrong.

## Steps

1. `src/components/BannerLayer.tsx:103-105` — remove `letterSpacing` from `initial` and `animate`; convert `y` to a full `transform` string in `initial`, `animate` and `exit`.
2. `src/components/BannerLayer.tsx:107-116` — add `letterSpacing: '0.16em'` to the `style` object so the final tracking is preserved.
3. `src/components/BannerLayer.tsx:120-122` — convert the subtitle's `y: 14 → 0` to full transform strings.
4. `src/components/BannerLayer.tsx:53` and `:123` — add `ease: [0.16, 1, 0.3, 1]` to both transitions, matching the siblings at `:74` and `:106`.
5. Leave `:71-73` (`scaleX` wipe) alone — it is a legitimate reveal and its container clips the overshoot, as the comment at `:61-65` explains. Note that plan 001 changes that element's `style` transform to `translate`; the two changes are compatible but 001 should land first.

## Boundaries

- Do NOT change the banner's duration, delay, colours, font size or the width cap.
- Do NOT remove the width cap or `overflowWrap` — the comment at `:93-96` explains they exist because the text is server-authored and unbounded.
- Do NOT touch the `scaleX` wipe bar.
- Do NOT add a dependency.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run responsive` passes — the banner is width-sensitive and this is the harness that covers it.
- **Feel check**: run `npm run dev` and deal a hand so the flop/turn/river banners fire:
  - DevTools → Performance, record while a banner plays. Before the fix there is a Layout entry every frame for the `<h1>`; after there should be **none**.
  - Trigger a banner with a long title (an omen name). At 1280×800 it wraps to two lines — confirm it does not **re-wrap mid-animation**, which is the visible symptom of the old behaviour.
  - Confirm the final tracking looks identical to before: the settled headline must have the same letter spacing it always had.
  - Trigger an impossible-hand banner (the heaviest case, with particles firing). Confirm the frame rate holds.
  - Check at 3840×2160 and at the minimum window size.
- **Done when**: no Layout entry appears during a banner animation, the settled headline is visually identical, and long titles do not reflow mid-flight.
