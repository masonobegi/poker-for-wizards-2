# 018 — Give the end of a run its delight budget

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: MEDIUM (additive — a missed opportunity, not a defect)
- **Category**: 8 (Missed opportunities)
- **Estimated scope**: 2 files, small

## Problem

The delight budget is inverted. A single mid-run impossible hand — something a player sees several times per session — gets the full arsenal:

```ts
/* src/lib/fxbridge.ts:157-166 — current */
if (e.impossible) {
  burst('impossible', seatPt ?? screenCentre());
  shake(shakePx(1), 700);
  flash('#f0c465', 0.6);
  chromatic(420);
  slowmo(0.42, 900);
  confetti(seatPt);
}
```

The end of an entire run — the rarest, highest-emotion moment the game has — gets a generic panel spring and a list fade:

```tsx
/* src/components/table/GameOver.tsx:22-27 — current */
<motion.div
  className="gameover-panel"
  initial={{ y: 40, scale: 0.94 }}
  animate={{ y: 0, scale: 1 }}
  transition={{ type: 'spring', stiffness: 260, damping: 28 }}
>
```

and `fxbridge`'s event switch has cases for `win`, `eliminate`, `flash`, `banner`, `reveal` — and **no `gameover` case at all**. Rare, high-emotion, first-time moments are exactly where a delight budget belongs, and this is the rarest moment in the product.

The tools are already built, already imported in that file, and already documented in `src/vfx/README.md`.

## Target

A `gameover` case in the fx bridge that plays a short, composed sequence — and is *different in kind* from the impossible-hand hit, so the two do not read as the same event.

The impossible hand is a **shock**: instant, loud, over in under a second. The end of a run should be a **settle**: slower, wider, resolving.

```ts
/* target — src/lib/fxbridge.ts, a new case alongside 'win' and 'eliminate' */
case 'gameover': {
  const seatEl = elementForSeat(e.winnerId);
  const seatPt = centerOf(seatEl);

  // A settle, not a shock: the vignette closes in and holds while the panel
  // arrives, then the confetti lands on the winner. No chromatic split and no
  // shake — this moment is not violent, it is final.
  vignette('#f0c465', 1600);
  slowmo(0.55, 1200);
  window.setTimeout(() => {
    confetti(seatPt ?? screenCentre());
    flash('#f0c465', 0.35);
  }, 420);
  break;
}
```

The 420ms delay is deliberate: the panel's spring settles first, then the celebration lands on top of it, rather than both firing into the same frame.

The panel itself keeps its spring but gains a longer, calmer entrance that has room to be watched:

```tsx
/* target — src/components/table/GameOver.tsx:22-27 */
<motion.div
  className="gameover-panel"
  initial={{ opacity: 0, transform: 'translateY(40px) scale(0.94)' }}
  animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
  transition={{ type: 'spring', duration: 0.6, bounce: 0.2 }}
>
```

## Repo conventions to follow

- `src/lib/fxbridge.ts` is the single place gameplay events are translated into vfx calls. Every effect in this plan goes there, not into the component — the file's whole purpose is that separation.
- The helpers `elementForSeat`, `centerOf`, `screenCentre`, `shakePx` are already defined in that file; reuse them rather than writing new ones.
- `src/vfx/README.md` documents every call used here. `vignette(color, ms)` restarts rather than stacking; `confetti(at?)` defaults to the top of the viewport.
- The event type must exist on the wire before the case can fire. Check `shared/` for the event union and whether a `gameover` event is already emitted; if the server does not emit one, either derive it client-side from the existing game-over state transition in `src/scenes/GameTable.tsx`, or add it to the shared type — **ask before changing the wire format**.

## Steps

1. Read `src/lib/fxbridge.ts` in full and find the event union it switches on. Determine whether a `gameover`/`runover` event already reaches it.
2. If no such event exists: do **not** invent a wire event. Instead, fire the sequence from the client when `GameOver` mounts, by calling the same `vfx` functions from a `useEffect` in `src/components/table/GameOver.tsx`. Keep the composition identical to **Target** and add a comment saying why it lives in the component (no server event).
3. If the event does exist: add the case in **Target** to `src/lib/fxbridge.ts`, next to `case 'win'`.
4. `src/components/table/GameOver.tsx:22-27` — apply the panel transition in **Target**.
5. Confirm the sequence respects reduced motion. `vfx.vignette`, `vfx.flash` and `vfx.confetti` already soften or scale themselves; `slowmo` publishes nothing after plan 013, so it is inert either way. Verify by eye with the toggle on.
6. Confirm particle density 'off' (plan 003) suppresses the confetti but leaves the vignette and flash — that is the intended split.

## Boundaries

- Do NOT change the impossible-hand sequence at `src/lib/fxbridge.ts:157-165`. It is correct for what it is; this plan makes the rarer moment *different*, not smaller.
- Do NOT add a screen shake or a chromatic split to the game-over sequence. Those read as impact; this moment is a resolution.
- Do NOT change the game-over panel's content, the leaderboard, or any game logic.
- Do NOT change the wire format without asking.
- Do NOT add a dependency.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run play` must still complete — the Playwright harness drives through to game over.
- **Feel check**: run `npm run dev`, play a short run to completion (or force a game-over state):
  - The panel should arrive, settle, and **then** the confetti should land — not simultaneously.
  - Compare it back to back with an impossible hand. They must not feel like the same event: one is a hit, one is a close.
  - Turn on reduce motion and confirm the moment still lands, quietly.
  - Set particles to 'off' and confirm the vignette and flash still play.
  - Confirm nothing lingers: after the sequence, the vignette must be fully cleared, not stuck at partial opacity.
- **Done when**: the end of a run is visibly the biggest moment in the game, it reads as distinct from an impossible hand, and it degrades cleanly under both accessibility settings.
