# Handoff

Everything that could not be done from the cloud session this branch was
written in, and that you can do on a desktop.

It falls into four buckets: **things needing ears**, **things needing a
desktop OS**, **things needing other people**, and **things needing a Steam
partner account**. The last of those already lives in
[SHIPPING.md](SHIPPING.md) and is not repeated here.

Nothing below is blocked on code. Every item is a check, and several of them
check work that no automated harness in this repo can reach.

---

## 0. Setup, and the two gotchas

```bash
git checkout claude/admiring-ptolemy-xrhalm
npm install
npm run dev          # server on :3001, client on :5173
```

Two things bite on a fresh clone:

**Playwright browsers.** Every harness in `test/` drives a real Chromium.
`npm install` does not fetch it.

```bash
npx playwright install chromium
```

If you are on a machine that already has a Chromium you would rather use,
`test/browser.mjs` honours `HEXHOLD_CHROMIUM` (or `PLAYWRIGHT_CHROMIUM_PATH`)
pointing at the binary, and every harness goes through it.

**Two of the harnesses default to `:3001`**, which serves the *built* client,
so they fail confusingly against a dev server that has never been built:

```bash
HEXHOLD_URL=http://localhost:5173/ node test/audio.mjs
HEXHOLD_URL=http://localhost:5173/ node test/gamepad.mjs
HEXHOLD_URL=http://localhost:5173/ node test/responsive.mjs
```

Or run `npm run build && npm start` once and use the default.

### What should already be green

Run these first. If any of them is red on your machine and was green here,
that is a finding in itself — say so rather than working around it.

```bash
npm test             # 128 pass
npm run play         # "nothing a player would notice went wrong"
npm run play:pad     # 9 passed, 0 failed — but see below
npm run responsive   # 7 resolutions, 0 failures
npm run audio        # 55 pass, 0 warn, 0 fail, 8/8 sanity
npm run sim -- 200 6 # a full six-handed run to completion, all invariants held
npm run build        # clean
```

**`play:pad` is timing-sensitive and will occasionally report a false
failure.** It drives a synthetic pad against fixed waits, so on a loaded
machine a press can land before the app is listening and a check fails for
reasons that have nothing to do with controller support. This session made it
wait on the app actually being mounted, poll its assertions instead of
checking once, and clear any overlay before testing Start — which took it from
a routine 6-of-9 in the cloud container to 9-of-9 most runs. It still is not
100% there. On a quiet desktop it should be clean; if you see one check fail,
re-run before believing it, and look at `playthrough-pad/` for what the screen
actually looked like.

---

## 1. The listening pass

**This is the most important thing on the list, and the one no amount of
further work in this repo can substitute for.**

The mix is now deliberate rather than accidental — `src/audio/mix.ts` holds a
hand-authored loudness ladder and `npm run audio` fails if the shipped sounds
drift off it. But *deliberate* is not the same as *good*. Measurement can tell
you two sounds are 12 dB apart. It cannot tell you that the counterspell sting
is grating by the fortieth time, that the table bed wears out after an hour, or
that the win fanfare is corny.

### How to actually hear them

There is a sound-test panel wired into the game, **dev builds only**:

> `npm run dev` → **Settings** → **Sounds** tab

It lists every one of the 50 sounds and all 5 music beds as a button. The tab
is gated behind `import.meta.env.DEV` (`src/components/SettingsPanel.tsx:20`),
so it does not appear in a packaged build.

Do this **twice**: once on headphones, once on laptop speakers. They will
disagree, and the laptop pass is the one that matters — that is what most of
Steam is listening on, and it is where the worst sound bug in the project was
hiding.

### What to listen for specifically

These are the judgement calls I made blind. Each one is a place where I set a
number by reasoning rather than by ear:

- **`card_deal`** was trimmed **up 7.7 dB** (trim 2.43×) — it is the most-played
  sound in the game and was inaudible. Is it now *too* present after 200 deals?
- **`card_shuffle`** and **`inscribe`** were also raised hard (+8.4 dB and +8.8 dB).
  Check they have not become hissy or brittle at the new level.
- **`cast_ruin`** and **`seal`** came *down* about 15 dB (−14.9 and −14.8). They were
  the loudest things in the game for no reason anyone chose. Are they now too
  meek for what they do?
- **The whole ladder.** Play `ui_hover` → `card_deal` → `chip_stack` →
  `street_river` → `win_big` → `win_impossible` in order. It should read as a
  staircase. If any step is flat or backwards, the target in `mix.ts` is wrong,
  not the synth.
- **The `table` music bed**, which I rewrote from scratch. It was a 36 Hz sine
  and a pluck every ten seconds — silence on anything without a subwoofer. It
  is now a sub pulse, a filtered triangle pad around 420 Hz, and a breathing
  band of air at 3.4 kHz. Leave it running for **twenty minutes**. It is the
  sound of most of a session and the failure mode is not "wrong", it is
  "unbearable by minute fifteen".
- **`heartbeat`**, which loops under a running clock. Mixed to be felt rather
  than heard. Confirm that is what it does.

### If something is wrong

Change the **target**, not the trim:

```bash
# edit TARGET_LOUDNESS in src/audio/mix.ts, then:
npm run audio:calibrate    # recomputes every trim to hit the new targets
npm run audio              # confirms nothing drifted
```

The `TRIM` block is generated. Editing it by hand will be silently overwritten
the next time anyone calibrates.

---

## 2. The desktop build

**Electron was never launched in this session at all.** `npm install` in the
cloud sandbox did not fetch the Electron binary, so the shell has only ever
been syntax-checked, never executed. Everything in this section is unrun.

```bash
npm run electron:dev     # the shell against the Vite dev server
npm run package:win      # installer + zip into release/
npm run package:linux    # AppImage + tarball
```

### The one piece of new code in here

I added a **Quit** button to the main menu, because a packaged build runs
frameless and often fullscreen with no window chrome to close. It is a new IPC
channel and **has never been executed**:

- `electron/main.cjs` — `ipcMain.handle('hexhold:quit', …)`
- `electron/preload.cjs` — `quit: () => ipcRenderer.invoke('hexhold:quit')`
- `src/components/shell/desktop.ts` — the typed bridge
- `src/scenes/Menu.tsx` — the button, gated on `isDesktop()`

Check that:
- [ ] The Quit button **appears** in the desktop shell (it must not appear in a browser — `isDesktop()` is false there, and you can confirm that at `localhost:5173`, where it is correctly absent).
- [ ] Clicking it actually closes the app, and does not leave the child game-server process orphaned. Check Task Manager / `ps` after quitting.
- [ ] F11 fullscreen still works, and Quit still works *while* fullscreen.

### Also worth confirming in a packaged build

- [ ] The **Sounds** tab is *absent* (it is dev-gated; if it ships, that is a bug).
- [ ] The version string on the menu footer reads the real version. It is substituted at build time by Vite from `package.json` (`vite.config.ts` → `define`), and falls back to the literal `dev` outside a Vite build. If the packaged menu says `dev`, the define is not reaching the build.

---

## 3. Launch it with the network unplugged

This verifies the fix I am most confident about and least able to prove.

The game used to fetch Cinzel, Inter and JetBrains Mono from
`fonts.googleapis.com` at runtime. A desktop build launched on a plane fell
back to Times — and the display face is what the title, the hand names and the
Market headings are made of. The fonts are now vendored into `public/fonts/`
(SIL OFL, ~400 KB, regenerable with `node scripts/vendor-fonts.mjs`).

What I *can* prove: `dist/index.html` and the built CSS contain no reference to
`fonts.googleapis.com` or `fonts.gstatic.com`, and `dist/fonts/` contains all
11 faces. What I cannot: that a real machine with no route to the internet
renders correctly.

- [ ] Turn off wifi / pull the cable.
- [ ] Launch the packaged build.
- [ ] The title should read in **Cinzel** — a high-contrast engraved serif. If it
      looks like Times New Roman, something is still reaching for the network.
- [ ] Check the Market headings and a showdown hand name too; those are the
      other two places the display face carries real weight.

---

## 4. Docker

Still unbuilt, for the same reason as before: there is no Docker in the
environment this was developed in. Every step it performs is verified
individually — the lockfile installs clean, `npm run build:server` produces a
standalone 1.7 MB `.mjs` with no `node_modules`, and that bundle boots and
serves the built client with working `/health` and `/ready`.

```bash
docker compose up -d --build
curl localhost:3001/health
```

- [ ] Image builds.
- [ ] Two machines join the same table through it and play a hand out.

---

## 5. Steam Deck hardware

`npm run play:pad` drives a **synthetic** gamepad at 1280×800 and passes 9/9,
and `npm run responsive` lays the game out at Deck resolution with no
failures. Neither has touched real hardware.

- [ ] Sideload the Linux build and play a full run on the Deck itself.
- [ ] **Readability at arm's length** is the thing a synthetic pad cannot
      check. The sigil card body text and the ledger are the smallest type in
      the game; confirm they are legible on a 7" panel.
- [ ] Check the frame rate on the **menu**, which now has six live `Card`
      components drifting behind the panel. They are blurred and slow, but they
      are real DOM with real animations, and the Deck is the weakest hardware
      this ships to. If it costs frames, the fix is in `.menu-bgcard`
      (`src/scenes/menu.css`) — drop to three cards, or swap the blur for a
      pre-blurred opacity.
- [ ] Confirm the reduced-motion setting still behaves: it stops the drift and
      leaves the cards in place. Verified in a browser, not on a Deck.

---

## 6. Play it against a human

Still the number-one gap, and now with specific things to watch, because
several balance and feel numbers moved this session on bot evidence alone.

**Pacing.** Bot think time now shortens as the table fills, so a betting round
costs roughly the same heads-up as six-handed rather than growing with the seat
count. Measured: **24.0s → 20.0s** per hand at a full six-handed table, and
**16.7s → 15.6s** at the default practice table. The six-handed table is still
the slow configuration and `npm run metrics` still flags it. A real player will
tell you within one session whether it drags — bots never get bored.

**The showdown hold.** The payout phase used to be a flat 3.2s, which was
shorter than the client's own reveal, so the biggest moment in the game was
routinely cut off part-way through by the next deal. It is now computed from
the reveal it is holding for, plus reading time, plus extra ceremony for an
impossible hand (`Engine.payoutHold` in `server/game/engine.ts`). That makes
payout about 22-25% of table time. **This is the number most likely to be
wrong.** Too short and the payoff is lost; too long and every hand has a pause
in it. Only a human who has seen it thirty times can say.

**Mana.** Bots now spend down on the river, because mana held past it either
spills over the cap or is never used. Unspent mana at hand end went 4.1 → ~3.5
and sigils cast per hand went up. Whether that makes the *spell economy* feel
right against someone who is bluffing with it is exactly the thing bots cannot
tell you.

**Everything the original SHIPPING.md said** still stands: bots do not tilt, do
not slow-roll, and do not think about what you think they are holding.

---

## 7. Things I changed that nothing automated covers

A precise list, so you know where to look if something feels off. Everything
here passed every harness in the repo; none of it has been judged by a person.

| Change | Where | What could be wrong |
| --- | --- | --- |
| The whole sound mix | `src/audio/mix.ts` | The ladder is my judgement. See §1. |
| The `table` music bed, rewritten | `src/audio/music.ts` | Tolerable for an hour? See §1. |
| Showdown hold timing | `server/game/engine.ts` | Too long or too short. See §6. |
| Showdown panel layout | `src/components/table/ShowdownPanel.tsx` | Losing players get one line, not cards — is that too little at a 5-way showdown? |
| Non-winning board cards dim at showdown | `src/components/table/Board.tsx` | Could read as a bug rather than emphasis. |
| Response window no longer a full modal | `src/scenes/table.css` `.stackview` | The scrim is lighter so the board stays readable. Check it still reads as *urgent*. |
| Board cards now render at `lg` | `src/components/table/Board.tsx` | Same size as your hole cards now. Correct, or crowded? |
| Menu card backdrop | `src/scenes/Menu.tsx`, `src/scenes/menuCards.ts` | Perf on weak hardware; whether it reads as depth or as clutter. |
| End-of-run recap | `src/components/table/GameOver.tsx` | Only ever seen at ante 2 with one omen. At ante 6 there will be five or six omen pills plus relics — confirm it does not overflow the panel. |
| Banner now precedes the game-over panel | `src/components/BannerLayer.tsx` | The wait is capped at 4.5s. If a banner never fires the panel should still appear promptly. |
| Quit on desktop | `electron/*` | Never executed. See §2. |
| The hand readout under your cards | `server/game/table.ts` | It must always agree with the pot. It shares `evaluate` with the showdown so it cannot drift, but on a board too expensive to read it shows nothing — check it does not vanish in normal late-run play. |
| Redrawn court cards | `src/components/card/CardArt.tsx` | Judged on a monitor at three sizes. The size that matters is a hole card on a Deck at arm's length. |
| The chip pile | `src/components/table/PotChips.tsx` | Whether it reads as money or as clutter, and whether the colour shift at 5 and 25 blinds lands. |
| The shader backdrop | `src/vfx/Backdrop.tsx` | Frame cost on a Steam Deck, and whether the cast ripple reads or is lost. It renders at half resolution, caps at 30fps and degrades to the old CSS gradient — but the only GPU it has ever run on is SwiftShader on a CPU. |
| Card foil | `src/components/card/card.css` | Whether a marked card reads as precious at arm's length without making its pips harder to count. |
| 15 new sigils | `server/game/magic.ts` | Each resolves and leaves the table coherent under test, and a run sees about 27 of the 60. Whether any of them is *broken as a play* — degenerate, dead, or a must-buy — needs a human. Watch Salt the Earth and Erase in particular: they are the first things in the game that can undo a Rite. |

| The felt as a material | `src/scenes/table.css`, `src/styles/tokens.css` | Two fractal-noise plates at soft-light, an off-centre lamp, wear and a leather rail. Cheap on paper; the only GPU it has run on is SwiftShader. Check the nap does not shimmer or moiré on a real panel, and does not band on an OLED. |
| Dust in the lamplight | `src/components/table/FeltDust.tsx` | 46 motes, 24fps, half-resolution canvas. Meant to be subliminal. If you *notice* it, it is too bright — drop the `0.34` in the alpha term. |
| The lamp flicker | `src/scenes/table.css` `felt-lamp-flicker` | Under 5% brightness over 8.4s. Check it does not read as a failing monitor, and does not induce anything unpleasant over an hour. |
| The twelve avatars | `src/components/Avatar.tsx` | Redrawn from scratch as woodcut plates. Judged at 40px and 120px on a monitor; the size that matters is a seat pod on a Deck at arm's length. Specifically: can you still tell the horned helm from the antlers, and the mask from the skull? |
| Cards deal from the deck | `src/lib/dealOrigin.ts`, `src/components/card/CardRow.tsx`, `src/components/table/Board.tsx`, `src/components/table/Deck.tsx` | The origin is measured from each row's *container* while it is still empty. If a layout ever mounts a row with cards already in it and never resizes, that row falls back to the old fixed arc — visible as one row of cards that flies in from the wrong place. Worth watching on reconnect. |
| The deck's position | `src/scenes/table.css` `.deck` | Fixed at 13%/64% of the felt and hidden under 1000px wide. Check it does not collide with the outermost seat at a six-handed table, or with the showdown panel. |
| Sigils printed on paper | `src/scenes/table.css` `.sigil-frame` | They were dark tiles; they are now bone stock in the school's ink, to match the playing cards beside them. Check the unaffordable state (greyscale 0.85 / brightness 0.52) still reads as *unaffordable* rather than as *disabled forever*, and that the description is still comfortably legible on a Deck. |
| The palette turned warm | `src/styles/tokens.css` | Every neutral surface was blue-leaning despite the file saying otherwise. Same luminance, warmer hue. Check nothing lost contrast — the greys under `--text-3`/`--text-4` on `--surface` are the ones to measure. |
| A dealt card kicks dust, not sparks | `src/vfx/particles.ts` `cardLand` | Replaces `sparkleTrail` on every deal and flip. Check it is visible at all on a bright panel, and still invisible on a dark one. |
| The held hand breathes | `src/scenes/table.css` `hand-breathe` | 2.5px over 7.5s on your own two cards. If you can consciously see it moving, it is too much. |
| Scene transitions move through depth | `src/App.tsx` `sceneMotion` | Replaces a crossfade. Check it does not read as a zoom-bounce on a 60Hz panel. |

| The market, reprinted | `src/scenes/shop.css`, `src/scenes/Shop.tsx` | It was still in the pre-redesign language — glowing icons on `#101427` blue-black — while the table it interrupts is printed stock under a brass lamp. Now the same bone stock, one ink per item, a keyed rule and a device. Verified in a live game at five resolutions, but check the **sold** and **owned** states, which the harness never reaches. |
| Nine engraved devices | `src/components/table/SchoolDevice.tsx` | Six schools plus relic, rite and attunement. Judged at 110px and 46px on a monitor. The sizes that matter are a sigil in the rail and a market card on a Deck. Specifically: does the rite still read as a press over wax rather than as a tower? |
| Bot difficulty | `server/game/bots.ts` (`BANDS`) | Novice/adept/master, where skill is a blurred equity read rather than random play. `adept` is asserted identical to what shipped. What needs a person: whether **novice** is beatable-but-not-boring, and whether **master** is hard-without-being-unfair. The numbers say the bands differ; only play says they are *fun*. |
| Table speed | `server/game/bots.ts` (`TEMPO`) | Relaxed/standard/blitz. `standard` is asserted identical to what shipped. Blitz has a floor so it can never cut the showdown reveal short — confirm that holds at a five-way all-in showdown, which is the longest reveal in the game. |
| The settings persist | `src/scenes/Menu.tsx` | `localStorage` under `hexhold.botSkill` / `hexhold.speed`. Wrapped in try/catch for private windows. |

### The end-of-run recap, specifically

This is the one I would check first. I could only reach the game-over screen by
temporarily shrinking the starting stack, so I have **only ever seen it with a
single omen**. A real run ends at ante 5-6 with five or six omens in force plus
several relics, and `.gameover-omens` is a wrapping flex row inside a panel with
a `max-height`. Play one run to the end and confirm it neither overflows nor
clips.

---

## 7b. Screens I have not re-checked since the redesign

Worth naming, because one of these was already wrong and I only found it by
opening a screenshot on a hunch. The market was still rendering in the
pre-redesign language — glowing icons on blue-black panels — long after
everything else had moved off it, and no test caught that, because nothing
automated can see that two screens belong to different games.

Audited and current: the table, the rail, the action bar, the spell hand, the
market, the menu, the showdown, the seat portraits, the playing cards.

**Not re-checked**: the codex, the end-of-run recap, the lobby, the intro
flow, and every *state* the harness never reaches — a sold-out market card, an
owned relic, a disconnected seat, a side-pot showdown. If any of them still
has a violet gradient or a glowing border on it, that is where it will be.

## 8. Steam partner account

Unchanged and already written up — see **"What you have to do — Steam account
work"** in [SHIPPING.md](SHIPPING.md). App ID, `npm i steamworks.js`,
achievement upload via `npm run steam:manifest`, Steam Cloud for
`hexhold-save.json`, store assets, age rating, depot upload.

One addition: the `playthrough/` folder now has clean 1440×900 captures taken
after this session's changes, including the rebuilt showdown and the new menu.
They are a better starting point for store screenshots than the old ones.

---

## Quick checklist

- [ ] `npx playwright install chromium`, then all seven harnesses green on your machine
- [ ] Every sound listened to, on headphones **and** on laptop speakers
- [ ] The `table` music bed left running for twenty minutes
- [ ] `npm run electron:dev` — the shell launches at all
- [ ] Quit button appears, works, and orphans no server process
- [ ] `npm run package:win` / `:linux` produce installers
- [ ] A packaged build launched with **no network** still renders in Cinzel
- [ ] Packaged build does **not** show the dev-only Sounds tab
- [ ] Menu footer shows the real version, not `dev`
- [ ] Docker image built once, and a real remote game played over it
- [ ] A full run on actual Steam Deck hardware
- [ ] Menu frame rate acceptable on the Deck with the card backdrop
- [ ] One run played to the end, to see the recap with a full set of omens
- [ ] A late run reached with wilds in the deck, to confirm the hand readout
      under your cards keeps answering (see gap 6 in SHIPPING.md)
- [ ] At least one full session against real humans
- [ ] Steam partner work, per SHIPPING.md
