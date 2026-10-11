# 030 — Port the basketball roguelike's cut-ins

- **Status**: DONE (2026-10-11, branch `anim-2026-10-11`)
- **Asked for**: "look at the animations that are now in basketball roguelike GitHub and add a bunch of those kinds of animations into HEXHOLD"
- **Reference**: github.com/masonobegi/basketball-rogueliek, `main` at `b96ed94` (shallow clone, read only, nothing run). The recent animation work is `0305524`..`b96ed94` (2026-10-10/11): cut-ins, "BODIED!!", road-event payoff scenes, court animation.
- **Scope**: client only. No server, shared or pacing file changed.

## What the basketball game does, and why it feels good

Godot 4. Almost all of it lives in `scripts/ui/fx/` (`cutin_player.gd`, `cutin_stage.gd`, `cutin_band.gd(shader)`, `arcade_label.gd`, `arcade_text.gdshader`, `cutin_bolts.gd`, `coin_flip.gd`) and a handful of tweens in `main_controller.gd` / `court_view.gd`. Every cut-in is a pure function of elapsed time, so it can be scrubbed, replayed or skipped.

| Animation | Trigger | Motion | Why it works |
| --- | --- | --- | --- |
| Score cut-in band | A made basket (yours or theirs) | A band tilted -12° slides in along its own axis, back-out overshoot (k 1.2) over 0.19s; exits ease-in the other way in 0.24s. Their scores run 1.55x faster. | Arrives with weight, leaves fast; the tilt alone says "arcade" |
| Speed lines | While any band holds | Streaks scroll along the band, 900 px/s before contact, 520 after | Motion without moving anything you read |
| Callout slam | ~0.02s after contact | Text 3x→1x, back-out (1.3) in 0.15s; white "flash" on the text fading 0.05→0.2s; stepped gold-to-red gradient, ink outline, italic skew | The word LANDS: overshoot plus a white contact frame reads as an impact |
| Callout exit | End of hold | Squash and stretch: scaleX 1+1.4s, scaleY 1-s, slides 260px, 0.18s | Leaves as a smear, not a fade |
| Points pop "+3" | 0.1s after the callout | 0→1 with back-out (3.0), a 0.6 rad tilt unwinding, white flash, then a gentle bob | The number arrives as a second, smaller hit |
| Portrait / name strip | 0.12s / callout+0.08s | Slide in from the side, back-out 1.4 / ease-out | Says who did it, framed like a fighting game |
| Impact frames | Contact beats | `_hit_flash`: 2-3 frames held at 0.9, then 0.08s fade. Reduce flashing turns it into an 18% pale tint | Reads as a hit, never as a light |
| Camera shake | Contact and callout | Decaying, value-noise, stepped at 30fps and snapped to art pixels; 10-18px | Small, short, and off when the setting says so |
| Announcement | Quarter, clutch time, banners | Band opens from a line (scaleY back-out 1.6, 0.14s), text slams 3.2x→1 (back-out 2.0), shake 14px, subtitle typewriter, exit by a left-to-right wipe | Same slam vocabulary, different entrance |
| VS screen | Before a game | Halves slam in from both sides, slash drops, lightning crackles at 30fps, names stagger 0.08s, VS slams 3.4x→1, waits for a button | The big pre-game beat |
| Charm trigger | A charm pays out | Slot scales 1.25→1 (back-out, 0.25s), modulate 2.0→1 (0.35s), sound, feed line | The build visibly does something |
| Count-up + pop | Reward breakdown | $ tweens up over 0.9s ease-out after 0.35s, then pops 1.6→1 (0.18s) with a click | The total arriving is the beat |
| Float-up | HYPE gain | "+0.25" rises 18px over 0.7s, fades after 0.25s | Feedback where the number lives |
| Key punch / error shake | Minigame input | Right key: 1.2→1 in 0.12s. Wrong: row shakes ±8px four times, 30ms each | Instant yes / no |
| Coin flip, money rain, drills | Road events | Toss arc, spin via width = cos(22t), shadow shrinks with height, glint, ticks rising in pitch; $ falling with ease-in | Small cut-scenes for a payoff |
| Rules about all of it | — | Animate props "on twos" (30fps); any input skips after a 0.12s guard; big plays break the news before the court replays them; points land when the ball does; toasts wait out a cut-in and their clock does not run while hidden | Never dead time, never a cue you missed |

## What HEXHOLD got

| Basketball moment | HEXHOLD moment | Where |
| --- | --- | --- |
| Score cut-in band (tilted, slides in with overshoot), speed lines, callout slam + white contact frame, squash-out exit, name strip | **Impossible hand** banner: tilted band slides in, speed lines, title slams 3x→1, two frames of white, out stretched flat; a strip names who made it and what it took | `BannerLayer.tsx`, `fx/arcade.css` |
| Announcement (band opens from a line, slam, shake, typewriter sub, wipe exit) | **Ante, phylactery, run end, omen** banners: band opens from a sliver, slam (2.2-3x by tone), a small hit timed to the landing, subtitle decodes in, wipe out | `BannerLayer.tsx` |
| Any input skips, after a 0.12s guard | **Every banner is skippable** by any click or key (the click still lands); a skip frees the Market and game-over panel at once | `BannerLayer.tsx` |
| Charm trigger punch | **A relic's rule fires**: its mark on the seat or rail punches 1.25→1 and overbrights. The ledger has tagged these lines (`LogEntry.rule`) since round 4; nothing read it | `lib/relicTriggers.ts`, `store/net.ts`, `lib/fxbridge.ts` |
| Impact frames + squash | **Spell hits a card** (burn, collapse, diverge, inscribe, entangle): squash flat, rebound, two frames of white. Divergence's split is the contact | `fxbridge.ts` `strike()` |
| BODIED!! / REJECTED!! callouts | **BUSTED** on an eliminated seat; **COUNTERED** on a countered spell; **BOUGHT** on a Market card | `fx/Stamp.tsx`, `Seat.tsx`, `StackOverlay.tsx`, `Shop.tsx` |
| "+3" pop / HYPE float, "points land with the ball" | **Pot win**: "+N" pops off the winner's seat as the coins arrive (0.38s), overshoot + unwinding tilt, then floats away. Your rail is now an fx target too | `fx/PopLayer.tsx`, `lib/visuals.ts` |
| Reward count-up + pop, props on twos | **Showdown winnings** and the **end-of-run stats** count up (eased out, digits on twos, in turn) and land with a pop | `fx/CountUp.tsx`, `ShowdownPanel.tsx`, `GameOver.tsx` |
| Break the news first, then replay it | A **new omen** chip slams into the bar after its banner leaves, not under it | `OmenBar.tsx` |
| Toasts wait out a cut-in | **Achievement toasts** hold while a banner plays; their clock starts when they show | `AchievementToast.tsx` |
| Money changing hands visibly | The **Market purse** rolls down as you spend; BOUGHT lands on the card at full brightness before it greys | `Shop.tsx` |

Shared vocabulary in `src/components/fx/arcade.ts`: `EASE_SNAP` (easeOutBack, the existing `--ease-snap`), `punchPlan` / `punch` (WAAPI, `composite: 'add'`), `slamMotion` (framer props), `countUpValue`.

## Not ported, and why

- **VS screen** — HEXHOLD has no pre-match beat to hang it on, and a screen that waits for a button is dead time.
- **Coin flip / money rain / drills scenes** — no equivalent payoff event; the Market buy got a stamp instead of a scene.
- **Everything on twos** — the arcade pixel look needs it; HEXHOLD's painted cards do not. Kept only for count-up digits, where it is also cheaper.
- **Hold-until-clicked announcements** — HEXHOLD's banners already time out; making them skippable gives the same control without a gate.
- **New sounds for relic triggers** — the mix is calibrated (`npm run audio`); a relic can fire 20 times a run. Animation only.

## The invariants, kept

- Reduced motion keeps every cue and drops the movement: a slam becomes a fade, a punch a brief glow at 1.3 brightness, a count-up shows its total. Never louder (`test/arcade.test.ts`).
- Reduce flashing caps every white contact frame at 1.3 brightness and keeps the movement (`test/arcade.test.ts`).
- Everything framer animates is placed with the `translate` / `rotate` longhands; `test/motion.test.ts` covers the new classes (checked by planting a `transform` on `.hx-stamp`, `.hx-banner__band`, `.hx-pop` and `.hx-banner__title` and watching it fail).
- No `transition: all`, no new `whileHover`.
- Nothing blocks input or holds a turn. Banners never took clicks and now also skip on one.

## Evidence

- `npm test`: 340 → 353 tests, all passing (10 new in `test/arcade.test.ts`, 3 in `test/render.test.tsx`: banner skip and guard, count-up, stamp).
- `test/anim-frames.mjs` films every frame of each moment (CDP screencast) at 1280x800 and times frames, headless or through the desktop shell off-screen with the GPU (`ELECTRON=1`, the shell's own `HEXHOLD_TEST_OFFSCREEN` mode with throwaway user data). It plays a real hand for the payout and stages the rest through the store (`?harness`).
- What the frames caught, and was fixed: the impossible-hand slam was invisible (the fx batch's own frame ran 200-600ms on main too, and the slam finished inside it; banners now mount two frames late); the subtitle hung in mid-air after the wipe; the showdown "+" sat a flex gap from its number; three overlapping count-ups cost ~300ms of layout on the game-over panel under a 4x CPU throttle (now contained, on twos, in turn).
- Frame pacing, off-screen Electron, GPU, 1280x800 (median / p95 ms; the machine was shared with a packaging job, so worst frames vary run to run on both builds):

  | Moment | main | branch |
  | --- | --- | --- |
  | idle table | 16.7 / 16.9 | 16.7 / 16.8 |
  | impossible hand | 16.7 / 17.6 | 16.7 / 16.8 |
  | ante banner | 16.7 / 17.7 | 16.7 / 16.9 |
  | omen | 16.7 / 17.6 | 16.7 / 18.7 |
  | relic trigger | 16.7 / 17.4 | 16.7 / 17.7 |
  | spell impact | 16.7 / 16.9 | 16.7 / 17.7 |
  | counter | 16.7 / 17.5 | 16.7 / 19.8 |
  | Market buy | 16.7 / 17.5 | 16.7 / 18.0 |
  | payout (real hand) | 16.7 / 17.7 | 16.7 / 16.8 |
  | game over, 4x CPU throttle | 16.7 / 16.8-33.3 | 16.7 / 33.4-66.7 |

- `npm run fun:batch -- 70 0` (same seeds) on main `5840d41` and on this branch: the whole report from the run arc through "where the player's time goes" is byte-identical — your turn 159s, Market 101s, showdown and payout 80s, deal/streets/banners 29s, 8.0 min a run, 16.9 hands, final ante 6.0. Only the wall-clock "server stalls" line moved (0.91% → 1.20% of ticks over 100ms): that is how long this machine took to run unchanged server code while the frame captures ran beside it (`git diff main -- server shared` is empty). Banners never held a turn and the client cannot slow the server; skipping a banner now hands Market time back.
- A browser playthrough (`node test/playthrough.mjs 120`) on the branch build: betting, stack, showdown, Market and omens all reached, no errors, heap flat at 16MB.

## Feel-check left for a human

On a Deck: the slam scale per tone (`SLAM_FROM`), the hit per tone (`SLAM_SHAKE`), the impossible band's tilt (`TILT_DEG`), and whether the relic punch is noticed without being noisy at 20 fires a run.
