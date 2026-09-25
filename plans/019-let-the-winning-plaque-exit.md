# 019 — Let the winning-hand plaque exit

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: LOW (additive)
- **Category**: 8 (Missed opportunities)
- **Estimated scope**: 1 file, tiny

## Problem

```tsx
/* src/components/table/Seat.tsx:174-183 — current */
{p.result && view.phase === 'payout' && !p.folded ? (
  <motion.div
    className={`seat-result ${p.result.impossible ? 'is-impossible' : ''}`}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.3 }}
  >
    {p.result.handName}
  </motion.div>
) : null}
```

This is a bare conditional. It is not wrapped in `AnimatePresence` and has no `exit` prop — unlike its three siblings in the same component, at `:128`, `:145` and `:159`, which are all inside `AnimatePresence` and all exit properly.

So the plaque naming the winning hand fades politely in, and then **vanishes on a single frame** when the phase leaves `payout`. The one beat per hand where the table learns who won ends on a hard cut, and it is the only transient badge on the seat that behaves this way.

It also has a delay-only transition (no duration, no easing), so the fade-in runs on framer's default `ease`, which starts slow.

## Target

```tsx
/* target — src/components/table/Seat.tsx:174-185 */
<AnimatePresence>
  {p.result && view.phase === 'payout' && !p.folded ? (
    <motion.div
      className={`seat-result ${p.result.impossible ? 'is-impossible' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
    >
      {p.result.handName}
    </motion.div>
  ) : null}
</AnimatePresence>
```

The exit travels **upward** (`y: -6`) while the entrance comes from below (`y: 8`) — the plaque rises past and away, rather than retracing its path. That reads as the hand being cleared rather than undone.

The `delay: 0.3` is kept: it lets the cards resolve before the name appears. But note the delay applies to the exit as well in framer, which would hold the plaque 300ms past the phase change. If that reads as sticky, move the delay into the `animate` transition only:

```tsx
animate={{ opacity: 1, y: 0, transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1], delay: 0.3 } }}
exit={{ opacity: 0, y: -6, transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } }}
```

Use this second form — it is unambiguous and matches how the siblings in this file separate their timings.

## Repo conventions to follow

- `src/components/table/Seat.tsx:159-172` (the emote) is the exemplar three lines above: `AnimatePresence` wrapping a keyed `motion.span` with `initial`, `animate` and `exit`. Match its structure exactly.
- After plan 015, the literal `[0.16, 1, 0.3, 1]` becomes `EASE_OUT` from `src/styles/motion.ts`. Use the constant if 015 has landed.
- After plan 014, this element's siblings use the `{ type: 'spring', duration, bounce }` form. A plain tween is correct here — the plaque is text, and text does not bounce.

## Steps

1. `src/components/table/Seat.tsx:174-183` — wrap in `AnimatePresence` and add the `exit` prop, using the per-variant transition form in **Target**.
2. Check whether `AnimatePresence` is already imported in the file. It is used at `:127` and `:158`, so it will be — confirm rather than re-adding.
3. Confirm the new `AnimatePresence` does not interfere with the sibling one at `:158`: they must be separate instances, not nested. If the existing one already encloses this region, add the `exit` prop and skip the wrapper.
4. Check `src/scenes/table.css` for `.seat-result` — if it carries its own `transition` or `animation`, make sure it does not fight the framer exit.

## Boundaries

- Do NOT change when the plaque appears (the `p.result && phase === 'payout' && !p.folded` condition) or what it says.
- Do NOT change the `.is-impossible` variant's styling.
- Do NOT add a spring — this is text.
- Do NOT add a dependency.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run play` completes.
- **Feel check**: run `npm run dev` against bots, play to a showdown:
  - Watch the winning seat as the payout phase ends and the next hand begins. The hand-name plaque must **fade upward and out**, not disappear between frames.
  - With the Animations panel at 10%, confirm the exit plays fully before the element unmounts.
  - Confirm the plaque still waits ~300ms after the payout phase starts before appearing.
  - Win with an impossible hand and confirm the `is-impossible` styling still applies through both the entrance and the exit.
- **Done when**: no transient badge on the seat disappears without an exit animation, and the showdown beat ends on a fade rather than a cut.
