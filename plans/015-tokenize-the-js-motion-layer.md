# 015 — Tokenize the JS motion layer

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: MEDIUM
- **Category**: 7 (Cohesion & tokens) / 2 (Easing & duration)
- **Estimated scope**: ~25 files, medium — mechanical but wide

## Problem

The CSS layer is fully tokenized. The JS layer is not tokenized at all. Four symptoms:

**1. One curve, hand-typed at 13 sites.** `[0.16, 1, 0.3, 1]` is byte-identical to `--ease-out` in `src/styles/tokens.css:116`, and appears literally at:

```
src/App.tsx:38                    src/components/ui/kit.tsx:171
src/components/BannerLayer.tsx:74  src/components/ui/kit.tsx:217
src/components/BannerLayer.tsx:106 src/scenes/Lobby.tsx:77
src/components/onboarding/Hints.tsx:87   src/scenes/Menu.tsx:80
src/components/onboarding/IntroFlow.tsx:286   src/scenes/Menu.tsx:238
src/components/onboarding/IntroFlow.tsx:308
src/components/table/ActionBar.tsx:100
src/components/Toasts.tsx:17
```

Change `--ease-out` and all 13 silently desync.

**2. Sixteen distinct durations against a five-value scale.** The tokens are `90/160/260/420/700`ms. The JS uses `0.16, 0.18, 0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.32, 0.34, 0.4, 0.42, 0.46, 0.5, 0.62, 0.8`. Some are exact duplicates of a token (`0.16`, `0.26`, `0.42`); most are near-misses that match nothing (`0.18`, `0.22`, `0.24`, `0.28`, `0.32`, `0.34`, `0.4`).

**3. Twenty unshared spring configs.** No two components agree, and none use the recommended form:

```
340/26 AchievementToast.tsx:45   380/24 OmenBar.tsx:35
240/26/0.8 + 170/21/0.95 Card.tsx:348,:350
260/28 + 300/20 GameOver.tsx:26,:35
380/25 + 150/14/1 Board.tsx:117,:121
460/26/0.9 StackOverlay.tsx:74   480/28/0.9 ActionBar.tsx:91
320/26 SigilCard.tsx:67
300/30 + 380/18 + 420/20 ShowdownPanel.tsx:36,:46,:155
260/24/1 + 420/26 + 300/22/0.8 + 400/20 Seat.tsx:94,:135,:139,:167
260/24/1 Rail.tsx:95   280/28 + 300/26 Shop.tsx:47,:129
340/28 TargetPrompt.tsx:37
```

**4. Around twenty framer entrances with no `ease` at all**, which inherit framer's default `[0.25, 0.1, 0.25, 1]` — CSS `ease`, which starts slow. Entrances should be `ease-out`. Sites include `src/components/ChatBox.tsx:46`, `src/components/LogPanel.tsx:35`, `src/components/OmenBar.tsx:56`, `src/components/table/ManaPips.tsx:26`, `src/components/ConnectionBadge.tsx:62,:78,:91`, `src/components/shell/SystemMenu.tsx:93,:107`, `src/components/BannerLayer.tsx:53,:123`, `src/components/Codex.tsx:87`, `src/components/profile/ProfileCard.tsx:34`, plus six scrims with no `transition` prop at all (`src/scenes/Shop.tsx:36`, `src/components/table/TargetPrompt.tsx:24`, `src/components/table/GameOver.tsx:16`, `src/components/table/ActionBar.tsx:176`, `src/components/ui/kit.tsx:203`, `src/components/onboarding/IntroFlow.tsx:294`), and five delay-only transitions (`src/components/table/Seat.tsx:175`, `src/components/table/GameOver.tsx:46`, `src/components/table/StackOverlay.tsx:88`, `src/components/table/ShowdownPanel.tsx:113`).

**Two smaller cohesion defects in the same dimension:**

`--ease-snap` (`cubic-bezier(0.34, 1.56, 0.64, 1)`, an overshoot curve) is the codebase's de-facto default hover and press curve rather than an accent — 13 sites including the base button's press (`src/styles/ui.css:21`), the slider thumb, the toggle knob, the chat emote, the omen pill, the lobby code, the sigil pop, the pot jump and the card flip. When everything bounces, nothing reads as special. The press feedback rule is explicit that a press is `scale(0.97)` with `160ms ease-out` — not an overshoot.

`--ease-in: cubic-bezier(0.7, 0, 0.84, 0)` (`src/styles/tokens.css:117`) is defined and referenced **zero times** anywhere in `src/` (verified). A dead token whose only effect is to invite a future author to apply `ease-in` to a UI entrance — the one curve that is always wrong on UI.

Finally, five hardcoded millisecond values sit inside the otherwise-tokenized CSS: `src/scenes/table.css:429` (`320ms`), `:433` (`460ms`), `:648` (`260ms`, an exact duplicate of `--t-base`), `:926` (`320ms`), `:225` (`200ms`, twice). Plans 008 and 012 delete four of them; `:429` remains.

## Target

A single motion module that mirrors the CSS tokens, imported everywhere.

```ts
/* target — new file: src/styles/motion.ts */
import type { Transition } from 'framer-motion';

/* Mirrors the motion tokens in tokens.css. Change a value here and in
   tokens.css together — the two layers must not drift. */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;      // --ease-out
export const EASE_BOTH = [0.65, 0, 0.35, 1] as const;    // --ease-both
export const EASE_SNAP = [0.34, 1.56, 0.64, 1] as const; // --ease-snap, celebration only

export const T_INSTANT = 0.09;  // --t-instant
export const T_FAST = 0.16;     // --t-fast
export const T_BASE = 0.26;     // --t-base
export const T_SLOW = 0.42;     // --t-slow
export const T_SCENE = 0.7;     // --t-scene

/** The default entrance/exit: fast start, clean settle. */
export const ENTER: Transition = { duration: T_FAST, ease: EASE_OUT };
/** A slightly longer entrance for panels and overlays. */
export const ENTER_PANEL: Transition = { duration: T_BASE, ease: EASE_OUT };
/** Movement of something already on screen. */
export const MOVE: Transition = { duration: T_BASE, ease: EASE_BOTH };

/* Springs use the duration/bounce form rather than stiffness/damping/mass:
   it states the intent (how long, how springy) instead of the physics, and it
   is the form the motion guidance recommends. Bounce stays 0.1-0.3; visible
   bounce is reserved for celebration. */
export const SPRING_CRISP: Transition = { type: 'spring', duration: 0.3, bounce: 0.1 };
export const SPRING_SOFT: Transition = { type: 'spring', duration: 0.45, bounce: 0.2 };
export const SPRING_PLAYFUL: Transition = { type: 'spring', duration: 0.5, bounce: 0.35 };
```

Three springs cover the twenty. Map each existing config by what it is doing, not by its numbers:

| Current site | Role | Target |
| --- | --- | --- |
| `ActionBar.tsx:91` (480/28/0.9) | a control appearing | `SPRING_CRISP` |
| `StackOverlay.tsx:74` (460/26/0.9) | a control appearing | `SPRING_CRISP` |
| `SigilCard.tsx:67` (320/26) | hover lift | `SPRING_CRISP` |
| `Seat.tsx:94,:135,:139,:167` | seat badges | `SPRING_CRISP` |
| `Rail.tsx:95` (260/24/1) | rail reflow | `SPRING_SOFT` |
| `Board.tsx:117` (380/25) | pot appearing | `SPRING_SOFT` |
| `Board.tsx:121` (150/14/1) | pot number roll | keep as-is — it is a `RollingNumber` spring, tuned for the count |
| `Card.tsx:348,:350` | the deal arc | **keep both as-is** — the split per-axis springs are what bend the deal into an arc; a comment at `Board.tsx:88-98` depends on it |
| `OmenBar.tsx:35` (380/24) | omen chip | `SPRING_SOFT` |
| `Shop.tsx:47,:129` | shop panel + cards | `SPRING_SOFT` |
| `TargetPrompt.tsx:37` (340/28) | prompt panel | `SPRING_SOFT` |
| `AchievementToast.tsx:45` (340/26) | rare celebration | `SPRING_PLAYFUL` |
| `GameOver.tsx:26,:35` | end of run | `SPRING_PLAYFUL` |
| `ShowdownPanel.tsx:36,:46,:155` | showdown | `SPRING_PLAYFUL` |

And in CSS, `--ease-snap` retreats to celebration use only:

```css
/* target — src/styles/ui.css:21 */
  transition:
    transform var(--t-fast) var(--ease-out),
    box-shadow var(--t-fast) var(--ease-out),
    border-color var(--t-fast) var(--ease-out),
    background var(--t-fast) var(--ease-out),
    filter var(--t-fast) var(--ease-out);
```

```css
/* target — src/styles/tokens.css:117 */
/* --ease-in deleted: ease-in on UI starts slow exactly when the user is
   watching. There is no correct use for it here. */
```

## Repo conventions to follow

- Place the module at `src/styles/motion.ts`, next to `tokens.css`, so the pairing is obvious. Import as `import { ENTER, SPRING_CRISP } from '@/styles/motion';` — check `vite.config.ts` for the `@` alias and match how other files import (some use relative paths; follow whatever the file being edited already does).
- Add a comment at the top of `src/styles/tokens.css`'s motion block pointing at `motion.ts`, so the next author changing a curve knows there are two places.

## Steps

1. Create `src/styles/motion.ts` exactly as in **Target**.
2. Add the cross-reference comment to the `--- motion ---` block in `src/styles/tokens.css` (around `:110`).
3. Replace all 13 literal `[0.16, 1, 0.3, 1]` occurrences with `EASE_OUT`. Verify with `grep -rn "0.16, 1, 0.3, 1" src --include=*.tsx` returning nothing afterward.
4. Replace hand-typed durations with the nearest token constant. Where a value is a near-miss (`0.18`, `0.22`, `0.24`, `0.28`, `0.32`, `0.34`), round to the token — `T_FAST` (0.16) or `T_BASE` (0.26) — rather than adding a new constant. Two exceptions may keep a literal, both deliberate celebration timings: `src/scenes/Menu.tsx:80` (0.8, the title-screen brand) and `src/components/BannerLayer.tsx:106` (0.62, the full-screen announcement). Add a short comment on each saying why.
5. Replace the spring configs per the mapping table. **Do not** touch `Card.tsx:348,:350` or `Board.tsx:121`.
6. Add an explicit transition to every entrance currently missing one. Use `ENTER` for small elements (chat lines, log lines, badges, pips), `ENTER_PANEL` for panels and scrims. For the five delay-only transitions, keep the delay and add the rest: e.g. `src/components/table/Seat.tsx:175` becomes `transition={{ ...ENTER, delay: 0.3 }}`.
7. `src/styles/ui.css:21` — swap `--ease-snap` for `--ease-out` on the button's `transform` leg.
8. Remove `--ease-snap` from these non-celebration sites, replacing with `--ease-out`: `src/styles/ui.css:152` (slider thumb), `src/styles/ui.css:187` (toggle knob), `src/components/chat.css:56` (emote), `src/components/omens.css:40` (omen pill), `src/scenes/table.css:1081`, `:1097` (targeting prompt — plan 010 already narrows these; keep `--ease-snap` on the `transform` leg only if the lift genuinely wants it, otherwise `--ease-out`). **Keep** `--ease-snap` on `src/scenes/lobby.css:34` (lobby code, a rare first-run moment) and on any showdown/celebration animation.
9. `src/components/card/Card.tsx:80` — `const FLIP: Transition = { duration: 0.42, ease: [0.34, 1.56, 0.64, 1] };` becomes `{ duration: T_SLOW, ease: EASE_OUT }`. A 420ms overshoot on the card flip — the single most-repeated motion in a poker game — is the clearest case of bounce applied to a workhorse.
10. `src/styles/tokens.css:117` — delete `--ease-in`. Confirm with `grep -rn "\-\-ease-in\b" src` that nothing references it (it currently does not).
11. `src/scenes/table.css:429` — `transition: color 320ms var(--ease-out);` becomes `transition: color var(--t-base) var(--ease-out);` (320ms is over the 300ms UI ceiling on a live HUD readout; `--t-base` is 260ms).
12. `src/vfx/effects.css:256` — the hardcoded `cubic-bezier(0.4, 0, 0.2, 1)` fallback (Material's curve, matching no house token) becomes `var(--shimmer-ease, var(--ease-out))`. Also unify the two fallback conventions: `effects.css:71`/`:349` spell out `var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1))` while `card.css:80,:199,:717,:834` use `var(--ease-out, ease)`. Pick the spelled-out form everywhere — it degrades to the right curve rather than to a weak one.

## Boundaries

- This plan changes **values and their source**, not structure. No markup changes, no component splitting.
- Do NOT touch `Card.tsx:348`/`:350` (the deal arc's split springs) or `Board.tsx:121` (the RollingNumber spring).
- Do NOT delete `--ease-snap` or `--ease-both` — both have legitimate remaining uses.
- Do NOT add a new duration constant to avoid rounding a near-miss. The point is fewer values.
- Do NOT add a dependency.
- Run this plan **after** 004, 005, 012 and 014, all of which rewrite some of these same lines. See `plans/README.md`.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. Three greps must return nothing: `grep -rn "0.16, 1, 0.3, 1" src --include=*.tsx`, `grep -rn "stiffness:" src --include=*.tsx` (except the two exempt sites), `grep -rn "\-\-ease-in\b" src`.
- **Feel check**: this plan touches most of the app's motion at once, so check breadth rather than depth. Run `npm run dev` and walk the whole product: menu → lobby → table → bet → cast a sigil → showdown → market → game over.
  - Nothing should feel *slower* than before; several things should feel snappier.
  - No entrance should start slowly — that is the framer-default `ease` being gone.
  - Press a button: the press must go in and come back **without overshooting**. Before, it sprang past.
  - Flip a card: it should settle cleanly rather than bouncing.
  - The achievement toast, the showdown panel and the game-over panel should be the **only** places that visibly bounce. If anything else does, it kept `--ease-snap` and should not have.
- **Done when**: every framer transition in `src/` references a constant from `src/styles/motion.ts`, no entrance relies on framer's default easing, and bounce appears only on celebration surfaces.
