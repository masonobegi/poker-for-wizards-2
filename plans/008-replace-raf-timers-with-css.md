# 008 — Replace the two rAF timer loops with CSS

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: HIGH
- **Category**: 5 (Performance)
- **Estimated scope**: 3 files, medium

## Problem

Two components drive a purely linear sweep by calling React `setState` from a `requestAnimationFrame` loop — 60 React renders per second each, for something CSS does on the compositor with no main-thread work at all.

**1. The turn timer.**

```tsx
/* src/components/fx/TurnTimer.tsx:30-50 — current */
useEffect(() => {
  lastTick.current = null;
  if (!until || total <= 0) { setPct(1); return; }
  let raf = 0;
  const tick = (): void => {
    const leftMs = Math.max(0, until - Date.now());
    const left = leftMs / 1000;
    setPct(Math.min(1, left / total));

    if (sound && left <= urgentAt && left > 0) {
      const whole = Math.ceil(left);
      if (lastTick.current !== whole) {
        lastTick.current = whole;
        playSfx('ui_warn', { pitch: 1 + (urgentAt - whole) * 0.06, vol: 0.7 });
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}, [until, total, sound, urgentAt]);
```

`pct` drives a `strokeDashoffset` on an SVG ring. `src/components/table/Seat.tsx:67` mounts one per acting player and the ActionBar mounts another for the hero, so this is a re-render storm on an already-busy table.

**2. The spell-stack response timer.**

```tsx
/* src/components/table/StackOverlay.tsx:157-164 — current */
const tick = () => {
  setPct(Math.min(1, left / (seconds * 1000)));
  raf = requestAnimationFrame(tick);
};
```

feeding

```tsx
/* src/components/table/StackOverlay.tsx:173 — current */
style={{ transform: `scaleX(${pct})` }}
```

The element it drives is already set up for CSS:

```css
/* src/scenes/table.css:960-966 — current */
.stack-timerfill {
  height: 100%;
  background: linear-gradient(90deg, var(--veil), var(--entropy));
  transform-origin: left;
  will-change: transform;
}
```

A one-line CSS animation would do it.

## Target

Drive both sweeps with a CSS animation whose duration is set once from the remaining time, and let the compositor run it. React renders once when the timer arms, not sixty times a second.

**Stack timer** — the simple case, since it is already a `transform`:

```css
/* target — src/scenes/table.css, replacing .stack-timerfill at :960-966 */
.stack-timerfill {
  height: 100%;
  background: linear-gradient(90deg, var(--veil), var(--entropy));
  transform-origin: left;
  will-change: transform;
  animation: stack-drain linear forwards;
  animation-duration: var(--stack-ms, 0ms);
}
@keyframes stack-drain {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}
```

```tsx
/* target — src/components/table/StackOverlay.tsx, replacing the rAF block and :173 */
/* Remove the `pct` state and the entire rAF effect. Set the duration once from
   the time actually remaining when the bar mounts, so a reconnect mid-window
   still lands in the right place. */
<div
  className="stack-timerfill"
  style={{ ['--stack-ms' as string]: `${Math.max(0, deadline - Date.now())}ms` }}
/>
```

`linear` is correct here: this is constant motion, which is the one case where `linear` is the right easing.

**Turn timer** — the ring is an SVG `strokeDashoffset`, which animates fine in CSS:

```css
/* target — new rules in src/scenes/table.css, near the .fx-turntimer block at :220 */
.fx-turntimer-fill {
  filter: drop-shadow(0 0 6px var(--gold));
  transition: stroke var(--t-fast) var(--ease-out), filter var(--t-fast) var(--ease-out);
  animation: turntimer-drain linear forwards;
  animation-duration: var(--turn-ms, 0ms);
}
@keyframes turntimer-drain {
  from { stroke-dashoffset: var(--turn-from, 0); }
  to   { stroke-dashoffset: var(--turn-to, 0); }
}
```

```tsx
/* target — src/components/fx/TurnTimer.tsx */
/* Delete the `pct` state and the rAF loop entirely. Compute the dash geometry
   once at mount, publish it plus the remaining duration as custom properties on
   the <circle>, and let CSS run the sweep. Keep the per-second warning sound,
   but on a 1Hz interval rather than a 60Hz rAF: */
useEffect(() => {
  if (!sound || !until) return;
  const id = window.setInterval(() => {
    const left = Math.max(0, until - Date.now()) / 1000;
    if (left <= 0 || left > urgentAt) return;
    const whole = Math.ceil(left);
    if (lastTick.current === whole) return;
    lastTick.current = whole;
    playSfx('ui_warn', { pitch: 1 + (urgentAt - whole) * 0.06, vol: 0.7 });
  }, 250);
  return () => window.clearInterval(id);
}, [until, sound, urgentAt]);
```

250ms rather than 1000ms so the whole-second boundary is never missed by more than a quarter second — still 4 timer callbacks per second against 60 React renders.

Note the `transition: stroke 200ms, filter 200ms;` at `src/scenes/table.css:225` is also being fixed here: it had no easing function (so it fell back to CSS default `ease`) and a hardcoded `200ms` matching no token. The target uses `var(--t-fast)` (160ms) and `var(--ease-out)`.

## Repo conventions to follow

- Durations come from tokens in `src/styles/tokens.css`; a per-instance *dynamic* duration is passed as a custom property on the element, which is what `src/components/card/Card.tsx` and `src/vfx/effects.css` already do for per-element timing (e.g. `--aura-speed`, `--shimmer-delay`).
- `src/vfx/effects.css:281` is the exemplar for a CSS-driven continuous sweep: `animation: vfx-orbit var(--runes-speed, 14s) linear infinite;` — duration via custom property, `linear` for constant motion.
- The existing reduced-motion rule at `src/scenes/table.css:235` must keep working. After plan 002 it keys off `:root[data-reduced-motion='1']`.

## Steps

1. `src/scenes/table.css:960-966` — replace `.stack-timerfill` and add the `stack-drain` keyframes as in **Target**.
2. `src/components/table/StackOverlay.tsx` — delete the `pct` state and the rAF effect at `:155-168`. Replace the inline `transform` style at `:173` with the `--stack-ms` custom property. Read the deadline from whatever prop currently feeds `seconds`; if the component receives a duration rather than a deadline, compute the deadline once in a `useRef` on mount so a re-render does not restart the drain.
3. `src/scenes/table.css:223-226` — replace the `.fx-turntimer-fill` rule as in **Target** and add the `turntimer-drain` keyframes below it.
4. `src/components/fx/TurnTimer.tsx` — delete the `pct` state and the rAF effect at `:30-50`. Compute the circle's circumference once (it already derives `r` at `:52`), publish `--turn-from`, `--turn-to` and `--turn-ms` on the `<circle>` element's style, and remove `strokeDashoffset={...}` from the JSX in favour of the animation. Add the 250ms interval effect for the warning sound exactly as in **Target**.
5. Verify the urgent state still works: `.fx-turntimer.is-urgent` adds `turntimer-glow` (`src/scenes/table.css:227-229`). Two animations on one element is fine — CSS composes them — but confirm the `animation-duration` you set does not clobber the glow's. If it does, give the fill's drain its own `animation-name`/`animation-duration` longhands rather than the shorthand.
6. Confirm the timer still resets correctly between turns. The animation must restart when `until` changes; if it does not, key the element on `until` in JSX (`key={until}`) so React remounts it — that is the correct restart mechanism here since the timer genuinely is a new animation each turn.

## Boundaries

- Do NOT change the warning-sound pitch formula or the `urgentAt` threshold.
- Do NOT change the ring's size, stroke, colour or geometry.
- Do NOT remove the `will-change: transform` from `.stack-timerfill` — it is correctly scoped to a short-lived animating element.
- Do NOT add a dependency.
- If the SVG structure in `TurnTimer.tsx` does not match what step 4 assumes, STOP and report rather than restructuring the component.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run play` must pass — it drives a full hand and therefore the turn timer.
- **Feel check**: run `npm run dev`, sit at a table with bots:
  - Watch an opponent's turn ring drain. It must be smooth and must reach zero exactly when the turn ends — no drift, no jump at the end.
  - Open DevTools → Performance and record 5 seconds of an active turn. Confirm **no `TurnTimer` render entries** in the flame chart. Before the fix there are ~60/second per acting seat.
  - React DevTools → Profiler: record a turn. `TurnTimer` should render once or twice, not continuously.
  - Let a timer run into the urgent zone. The per-second warning sound must still fire once per second, and the red glow must still pulse.
  - Trigger a counterspell window so the stack timer appears. Its bar must drain left-to-right in exactly the allotted seconds.
  - Reconnect mid-turn (kill and restore the socket) and confirm both timers resume at the correct position rather than restarting from full.
- **Done when**: neither component re-renders per frame, both sweeps end on time, and the warning sound cadence is unchanged.
