# HEXHOLD animation plans

Written against commit `55ca0f0`. Every plan is self-contained: exact file paths, current code verbatim, exact target values, and a feel check. An executor needs no context beyond the plan file.

Source: an audit of `src/` against eight motion categories — purpose & frequency, easing & duration, physicality & origin, interruptibility, performance, accessibility, cohesion & tokens, and missed opportunities. Every finding was re-read at its `file:line` before it became a plan.

## Plans

| # | Title | Severity | Category | Status |
| --- | --- | --- | --- | --- |
| [001](001-fix-inline-transform-clobber.md) | Stop framer's inline transform clobbering CSS centring | HIGH | 3 / correctness | DONE |
| [002](002-one-reduced-motion-trigger.md) | Make reduced motion one trigger, and gentle rather than zero | HIGH | 6 | DONE |
| [003](003-wire-particle-density.md) | Wire the particle-density setting to the VFX layer | HIGH | 6 | DONE |
| [004](004-unblock-keyboard-and-pad-navigation.md) | Stop animations gating keyboard and gamepad navigation | HIGH | 1 | DONE |
| [005](005-stop-animating-height-in-the-action-bar.md) | Stop animating height in the action bar | HIGH | 5 / 1 | DONE |
| [006](006-delete-the-button-sheen-sweep.md) | Delete the 420ms sheen sweep from every button | HIGH | 1 / 2 | DONE |
| [007](007-add-press-feedback.md) | Give every pressable element a press state | HIGH | 3 | DONE |
| [008](008-replace-raf-timers-with-css.md) | Replace the two rAF timer loops with CSS | HIGH | 5 | DONE |
| [009](009-cut-the-steady-state-animation-load.md) | Cut the steady-state animation load | HIGH | 5 | DONE |
| [010](010-replace-transition-all.md) | Replace every `transition: all` with an explicit list | MED-HI | 5 | DONE |
| [011](011-gate-hover-motion.md) | Gate hover motion behind a fine pointer | MED-HI | 6 | DONE |
| [012](012-make-retriggered-cues-retarget.md) | Make rapidly-retriggered cues retarget instead of restart | MEDIUM | 4 | DONE |
| [013](013-stop-per-frame-root-custom-properties.md) | Stop writing custom properties to the app root every frame | MEDIUM | 5 | DONE |
| [014](014-raise-entrance-scales.md) | Raise entrance scales into the physical band | MEDIUM | 3 | DONE |
| [015](015-tokenize-the-js-motion-layer.md) | Tokenize the JS motion layer | MEDIUM | 7 / 2 | DONE |
| [016](016-stop-animating-letterspacing.md) | Stop animating letter-spacing in the phase banner | MEDIUM | 5 / 2 | DONE |
| [017](017-fix-the-staggers.md) | Fix the staggers | LOW | 7 | DONE |
| [018](018-give-the-end-of-a-run-its-delight-budget.md) | Give the end of a run its delight budget | MEDIUM | 8 | DONE |
| [019](019-let-the-winning-plaque-exit.md) | Let the winning-hand plaque exit | LOW | 8 | DONE |
| [020](020-grow-the-target-prompt-from-its-sigil.md) | Grow the target prompt from the sigil that opened it | MEDIUM | 8 / 3 | DONE |
| [021](021-animate-the-boards-empty-sockets.md) | Animate the board's empty sockets | LOW | 8 | DONE |
| [022](022-port-the-webgl-demos-to-the-table.md) | Port the web demos' techniques to the table | MEDIUM | 8 | DONE |
| [023](023-draw-the-mark-set.md) | Draw the mark set — 102 sigils, relics, omens and card marks | HIGH | 8 / correctness | DONE |
| [024](024-make-the-layout-harnesses-able-to-fail.md) | Make the layout harnesses able to fail | HIGH | tooling | DONE |
| [025](025-teach-the-bots-to-bet.md) | Teach the bots to bet | HIGH | gameplay | DONE |
| [026](026-the-second-printing.md) | The second printing — 11 sigils, 8 relics, 8 omens | MEDIUM | content | DONE |
| [027](027-make-winning-sound-different-from-losing.md) | Make winning sound different from losing | MEDIUM | audio | DONE |
| [028](028-covens.md) | Covens — seven starting loadouts | HIGH | gameplay | DONE |
| [029](029-the-plate.md) | The plate — replace the default panel with an engraved one | MEDIUM | visual design | DONE |

## Recommended execution order

**Phase 1 — things that are broken.** These are defects, not polish. Each is small and independently verifiable.

`001` → `003` → `002` → `012`

- `001` fixes tooltips and the phase banner rendering in the wrong place. Smallest diff, most visible result.
- `003` before `002`: both touch `videoPrefs.ts`, and `003` is the simpler of the two.
- `012` fixes a pot-jump cue that silently never fires twice in a street.

**Phase 2 — feel.** The changes a player will describe as "it got better".

`004` → `006` → `010` → `007` → `005`

- `004` first: it removes the gamepad opacity gate that makes every other entrance animation an input block. Nothing else in this phase reads correctly until that is gone.
- `010` **before** `007`: `010` converts `transition: all` into explicit property lists that name `transform`, which is what the new `:active` states need in order to animate at all.
- `005` last in this phase — it is the largest single-component change.

**Phase 3 — performance.** Everything that matters before the Steam Deck hardware pass listed in `SHIPPING.md`.

`008` → `013` → `016` → `009`

- `009` last: it is the widest (5 files, ~30 declarations) and benefits from the others having settled first.

**Phase 4 — cohesion.** Mechanical, wide, and much easier once the values above have stopped moving.

`011` → `014` → `017` → `015`

- `015` is **last of all the corrective work**. It rewrites transitions across ~25 files, and plans `004`, `005`, `012`, `014`, `016`, `017` and `019` all edit some of those same lines. Running it earlier means doing it twice.

**Phase 5 — additive.** Nothing here fixes a defect; each adds motion where a seam currently shows.

`019` → `021` → `020` → `018`

- Ordered cheapest first. `018` last because it is the one most worth iterating on by feel.

## Dependencies

| Plan | Depends on | Why |
| --- | --- | --- |
| `007` | `010` | Press states need `transform` named in the element's transition list, which `010` adds. |
| `015` | `004`, `005`, `012`, `014`, `016`, `017`, `019` | All of them rewrite framer transitions that `015` then tokenizes. Running `015` first means editing those lines twice. |
| `016` | `001` | Both edit the `style` prop of `BannerLayer.tsx`'s glow bar. `001` changes `transform` → `translate`; `016` changes the headline. Compatible, but `001` first avoids a conflict. |
| `002` | `003` | Both add an `applyX` function to `videoPrefs.ts` in the same region. |
| `012` | `002` | `012` deletes three `:root[data-reduced-motion='1']` overrides and replaces them with component-level branches; `002` establishes that attribute as the single trigger. |
| `008` | `002` | `008` rewrites `.fx-turntimer-fill`, whose reduced-motion override at `table.css:235` `002` re-keys. |
| `018` | `013` | `013` may make `vfx.slowmo` inert; `018`'s sequence uses it and should know. |
| `021` | — | Independent. |
| `020` | — | Independent, but read `src/components/fx/useCardAnchors.ts` first — it may already solve half of it. |

## Status

All 29 plans are applied. `001`-`021` were the original audit, on top of
commit `55ca0f0`; `022` is later work, porting techniques out of the
`masonobegi_webpage` demos. Every one
was verified with `npm run typecheck`, `npm test`, and — where it touches the
table, the controller path or layout — `npm run play`, `npm run play:pad` and
`npm run responsive`.

Six defects were found during execution that no plan predicted, and are
recorded in `FINDINGS.md` alongside the audit trail.

## Notes

- **No plan modifies game logic, markup semantics, wire format or dependencies.** Two call this out explicitly: `018` must not change the wire format without asking, and `011` must not remove touch access to the sigil discard button.
- **Every plan's mechanical check includes `npm run typecheck` and `npm test`.** Several add the harnesses that actually exercise the path: `npm run play` (browser playthrough), `npm run play:pad` (synthetic gamepad — the direct regression test for `004`), and `npm run responsive` (seven resolutions — required for `016` and `021`, which are viewport-sensitive).
- **Three findings were verified as dead code** and are removed by their plans: `--ease-in` (defined, referenced zero times — `015`), `--vfx-time-scale` (written every frame, read nowhere — `013`), and `setReducedMotion()` in `particles.ts` (exported, called nowhere — `002`).
- **One finding is adjacent but out of scope for every plan here**: `confirmFold` in `src/components/shell/prefs.ts:11` is defined, defaulted to `true`, persisted and toggled in the settings UI — and never read anywhere in the codebase. It is the only deliberate-phase mechanism the game ships, and it does nothing. That is a gameplay defect rather than a motion one, so it is recorded here and not planned.
