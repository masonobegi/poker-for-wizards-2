# 017 — Fix the staggers

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: LOW
- **Category**: 7 (Cohesion & tokens)
- **Estimated scope**: 5 files, small

## Problem

Stagger belongs in the 30–80ms band, and it is decorative — it must never delay comprehension or block interaction. Three sites miss the band in one direction or the other, and three group entrances have no stagger where one belongs.

**Too slow — the showdown.**

```tsx
/* src/components/table/ShowdownPanel.tsx:113-117 — current */
transition={{ delay: 0.35 + i * 0.1 }}
/* and :155 */
transition={{ delay: 0.5 + i * 0.1, ... }}
```

100ms per row. At a 6-seat table the last row lands 500ms after the first, on top of a 350ms base delay — roughly **850ms before the showdown is fully readable**, on a panel already gated behind a 250ms spring delay at `:36`. The showdown is the moment the player most wants to read quickly.

**Too fast to be a stagger at all — the codex.**

```tsx
/* src/components/Codex.tsx:87 — current */
transition={{ delay: Math.min(i * 0.015, 0.3), duration: 0.24 }}
```

15ms is below the band, so it reads as a single simultaneous pop rather than a cascade — it pays the complexity cost of a stagger without delivering one. It also blocks gamepad focus for up to 300ms on a keyboard-driven tab switch, which is why plan 004 removes it outright.

**Missing entirely — three group entrances.**

```tsx
/* src/components/OmenBar.tsx:29-35 — current, no per-index delay */
<motion.li key={o.id} layout initial={{ opacity: 0, scale: 0.7, y: -8 }} ... transition={{ type: 'spring', stiffness: 380, damping: 24 }}>
```

By late antes several omens mount together and all pop at once.

```tsx
/* src/scenes/Lobby.tsx:70-77 — current, no per-index delay */
<motion.li key={p.id} layout ... transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
```

"+ Bot" adds three seats at once; all three slide in simultaneously.

```tsx
/* src/components/table/Board.tsx:50-75 — current */
/* .board-mods children carry `layout` and no per-index delay */
```

Multiple board modifiers arrive together at a street change.

## Target

Every stagger sits at **60ms**, one value, used everywhere — which also makes the cascade recognisable as the same effect across the app.

```tsx
/* target — src/components/table/ShowdownPanel.tsx:117 */
transition={{ ...ENTER, delay: 0.2 + i * 0.06 }}
```

```tsx
/* target — src/components/table/ShowdownPanel.tsx:155 */
transition={{ ...ENTER, delay: 0.3 + i * 0.06 }}
```

Base delay drops too (0.35 → 0.2, 0.5 → 0.3): at 6 seats the last row now lands at 0.2 + 0.3 = 500ms rather than 850ms.

```tsx
/* target — src/components/OmenBar.tsx:35 */
transition={{ ...SPRING_SOFT, delay: i * 0.06 }}
```

```tsx
/* target — src/scenes/Lobby.tsx:77 */
transition={{ ...ENTER, delay: i * 0.06 }}
```

```tsx
/* target — src/components/table/Board.tsx, on each .board-mods child */
transition={{ ...ENTER, delay: i * 0.06 }}
```

Cap every stagger so a long list cannot run away:

```tsx
delay: Math.min(i * 0.06, 0.3)
```

Apply the cap wherever the list length is not bounded by the 6-seat maximum — the omen bar and the board-mods row both qualify.

The codex stagger is deleted by plan 004; nothing to do here.

**Three staggers already in band — do not touch them**: `src/components/table/SigilCard.tsx:67` (40ms), `src/scenes/Shop.tsx:129` (60ms), `src/components/table/GameOver.tsx:50` (70ms), and `src/components/card/Card.tsx:81` (`STAGGER = 0.07`, the deal cascade — 70ms and load-bearing for the arc).

`src/components/table/ManaPips.tsx:27` (`delay: i * 0.02`) is also **not** a finding: 20ms across six adjacent 6px pips is a tight ripple on a value change, not a group entrance, and it reads correctly at that scale. Leave it. (Its separate problem — every lit pip replaying the pop rather than just the one that changed — is out of scope here.)

## Repo conventions to follow

- `src/scenes/Shop.tsx:129` is the exemplar already at the target value: `delay: index * 0.06`.
- After plan 015, `ENTER` and `SPRING_SOFT` come from `src/styles/motion.ts`. If 015 has not landed, spell the transition out inline in the same shape the file already uses, and 015 will convert it.

## Steps

1. `src/components/table/ShowdownPanel.tsx:117` and `:155` — apply the targets above.
2. `src/components/table/ShowdownPanel.tsx:36` — check the panel's own 250ms spring delay. With the row delays reduced, confirm the panel still reads as settling before the rows cascade; if it now feels like the rows beat the panel, reduce the row base delays further rather than raising the panel's.
3. `src/components/OmenBar.tsx:35` — add `delay: Math.min(i * 0.06, 0.3)`.
4. `src/scenes/Lobby.tsx:77` — add `delay: Math.min(i * 0.06, 0.3)`.
5. `src/components/table/Board.tsx:50-75` — add the same capped delay to the `.board-mods` children. The map's index may not currently be destructured; add it.
6. Verify no stagger outside the band remains: `grep -rn "i \* 0\.\|index \* 0\." src --include=*.tsx`. Every hit should be `0.04`, `0.06` or `0.07`, or be one of the two documented exceptions (`ManaPips` at 0.02, `Card` at 0.07).

## Boundaries

- Do NOT add a stagger to a list that is not a group entrance — a single item appearing alone does not cascade.
- Do NOT stagger anything that gates interaction. If a staggered element is focusable, the cascade must not delay its focusability; plan 004 removed the gamepad opacity gate that made this dangerous, but keep the principle.
- Do NOT touch `SigilCard.tsx:67`, `Shop.tsx:129`, `GameOver.tsx:50`, `Card.tsx:81` or `ManaPips.tsx:27`.
- Do NOT add a dependency.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run play` completes.
- **Feel check**: run `npm run dev`:
  - Play to a 6-player showdown. Time it roughly: the last result row should be readable in about half a second, not most of a second. It should read as a cascade, not as a queue.
  - Reach an ante where three or more omens are active. They should arrive one after another, not all at once.
  - In the lobby, press "+ Bot" three times quickly. The seats should cascade.
  - Trigger a street change with multiple board modifiers active.
  - With a controller, confirm every staggered item is focusable as soon as it exists.
- **Done when**: every stagger in `src/` is 40–70ms, no cascade runs longer than 300ms of total delay, and the showdown is fully readable within ~500ms of the panel appearing.
