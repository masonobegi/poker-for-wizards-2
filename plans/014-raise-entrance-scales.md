# 014 — Raise entrance scales into the physical band

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: MEDIUM
- **Category**: 3 (Physicality & origin)
- **Estimated scope**: 5 files, small

## Problem

Nothing in the real world appears from nothing. The target band for an entrance is `scale(0.9–0.97)` with `opacity: 0` — small enough to read as arrival, large enough that the eye does not read it as inflation. Six entrances start far below that band.

```tsx
/* src/components/table/Seat.tsx:160-168 — current (seat emote) */
<motion.span
  key={emote.at}
  className="seat-emote"
  initial={{ opacity: 0, scale: 0.4, y: 10 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  exit={{ opacity: 0, scale: 0.8, y: -10 }}
  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
>
```

`0.4` is the worst in the set, and the emote is one of the most frequently seen transient elements at the table.

```tsx
/* src/components/table/Seat.tsx:132 — current (bet chip) */
initial={{ opacity: 0, scale: 0.6, y: 8 }}
```

Fires on every bet, check and call.

```tsx
/* src/components/table/ShowdownPanel.tsx:44 — current (impossible-hand banner) */
initial={{ scale: 0.7, opacity: 0 }}
```

```tsx
/* src/components/OmenBar.tsx:32 — current (omen chip) */
initial={{ opacity: 0, scale: 0.7, y: -8 }}
```

```tsx
/* src/components/table/GameOver.tsx:33 — current (winner block) */
initial={{ scale: 0.8, opacity: 0 }}
```

```css
/* src/components/achievements.css:29 — current (achievement mark) */
0% { transform: rotate(-90deg) scale(0.4); opacity: 0; }
```

`src/components/table/Board.tsx:114` (`scale: 0.85`) is the borderline case — just outside the band, and on the pot, which is permanently on screen.

## Target

Every entrance scale moves into 0.9–0.97. The spring does the work of making it feel alive; the scale distance is not what makes an entrance read.

```tsx
/* target — src/components/table/Seat.tsx:163-166 */
initial={{ opacity: 0, scale: 0.94, y: 6 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.96, y: -6 }}
transition={{ type: 'spring', duration: 0.35, bounce: 0.25 }}
```

The `y` travel drops from 10 to 6 as well: on an element this small, 10px of travel plus a 60% scale change is two effects doing the same job.

```tsx
/* target — src/components/table/Seat.tsx:132 */
initial={{ opacity: 0, scale: 0.94, y: 6 }}
```

```tsx
/* target — src/components/table/ShowdownPanel.tsx:44 */
initial={{ scale: 0.94, opacity: 0 }}
```

This one is a celebration, so it may keep a livelier spring — but the *start* scale still belongs in the band.

```tsx
/* target — src/components/OmenBar.tsx:32 */
initial={{ opacity: 0, scale: 0.94, y: -6 }}
```

```tsx
/* target — src/components/table/GameOver.tsx:33 */
initial={{ scale: 0.94, opacity: 0 }}
```

```css
/* target — src/components/achievements.css:29 */
0% { transform: rotate(-20deg) scale(0.94); opacity: 0; }
```

The rotation drops from 90° to 20° for the same reason: a quarter turn plus a 0.4 scale is a thing being assembled, not a thing arriving.

```tsx
/* target — src/components/table/Board.tsx:114 */
initial={{ opacity: 0, scale: 0.94 }}
```

## Repo conventions to follow

- Framer springs in this repo are currently hand-tuned `{ stiffness, damping, mass }` objects. Plan 015 replaces them with the `{ type: 'spring', duration, bounce }` form. Where this plan touches a transition, **use the new form** — it is the target shape and plan 015 will not need to revisit these lines.
- Bounce: 0.1–0.3 generally, and reserve visible bounce for celebration. Emote and bet chip get 0.25; the showdown banner may go to 0.35 as a deliberate celebration.
- `src/components/Toasts.tsx` is the repo's cleanest entrance and already sits inside the band.

## Steps

1. `src/components/table/Seat.tsx:163-167` — apply the emote target above.
2. `src/components/table/Seat.tsx:132-135` — apply the bet-chip target; convert its spring to the `{ type: 'spring', duration, bounce }` form.
3. `src/components/table/ShowdownPanel.tsx:44` — change `scale: 0.7` to `scale: 0.94`.
4. `src/components/OmenBar.tsx:32` — change `scale: 0.7` to `0.94` and `y: -8` to `-6`.
5. `src/components/table/GameOver.tsx:33` — change `scale: 0.8` to `0.94`.
6. `src/components/achievements.css:29` — change the `0%` keyframe as in **Target**.
7. `src/components/table/Board.tsx:114` — change `scale: 0.85` to `0.94`; leave the `exit` at `0.9`.
8. Sweep for any missed case: `grep -rn "scale: 0\.[0-8]" src --include=*.tsx` and `grep -rn "scale(0\.[0-8]" src --include=*.css`. Judge each hit — a **press** state legitimately sits at 0.94–0.98 and a hover legitimately goes above 1; only *entrances* are in scope here.

## Boundaries

- Do NOT change any `exit` scale that is already ≥ 0.9.
- Do NOT touch press/`:active` scales (plan 007) or hover scales (plan 011) — different rules apply to those.
- Do NOT remove any entrance.
- Do NOT add a dependency.
- `src/components/BannerLayer.tsx:71` `initial={{ scaleX: 0 }}` is **not** in scope: it is a full-bleed gradient bar performing a legitimate wipe reveal, and the container clips its overshoot. Leave it.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run play` completes.
- **Feel check**: run `npm run dev`:
  - Send an emote from the chat bar. It should appear to **arrive**, not to inflate. Watch it at 10% in the Animations panel — at no point should it look like a dot growing.
  - Make a bet and watch the chip appear at the seat — same check.
  - Trigger an omen (play to the next ante). The chip should settle into the bar rather than pop out of nothing.
  - Unlock an achievement (`npm run play` reports which unlock). The mark should rotate slightly into place, not spin a quarter turn.
  - Reach a showdown with an impossible hand if you can; the banner should still feel like an event.
- **Done when**: no entrance in `src/` starts below `scale: 0.9`, and every one of the above still reads as an arrival.
