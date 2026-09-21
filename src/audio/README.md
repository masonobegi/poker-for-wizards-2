# HEXHOLD audio

Every sound HEXHOLD makes — cards, chips, spells, music, the lot — is synthesized at
runtime with the Web Audio API. There are no audio files anywhere in this project, and
there never should be: the deck in this game breaks the laws of physics, so the sound
design breaks the usual rule that "real" audio has to start from a recording. An
oscillator, a burst of filtered noise, and a procedurally generated reverb tail turn out
to be enough to cover a card flip, a funeral bell for eliminated players, and a jackpot
fanfare, with nothing to load and nothing to ship.

The module is split into four files, each with one job:

- `voices.ts` — the low-level synthesis primitives (`tone`, `noiseHit`, `sweep`,
  `pluck`, `fmBell`), plus the shared envelope, node-lifecycle and music-theory
  helpers everything else is built from.
- `sfx.ts` — the `SfxName` union and the `SFX` registry: one entry per named sound,
  each a short function that schedules a complete, self-disposing node graph.
- `music.ts` — the generative music beds for each `Mood`, built the same way but kept
  running for as long as that mood is active.
- `engine.ts` — the `audio` singleton everything else in the game talks to: the
  `AudioContext`, the bus/compressor/reverb graph, settings persistence, and the public
  `play` / `music` / `duck` API.
- `useAudio.ts` — the React hooks that wire the engine into components.

Nothing in this module ever throws into its caller. If the browser has no
`AudioContext`, if autoplay policy is blocking playback, if a particular synth has a
bug — the game keeps running and simply makes no sound. Audio is a layer on top of the
game, never a dependency it can fail on.

## Signal path

```
                 ┌─ sfxBus ───────────────┐
voices/sfx.ts ──▶│                        ├─▶ masterGain ─▶ compressor ─▶ destination
                 └─ musicBus ─▶ duckGain ──┘
music.ts ───────▶

reverbSend ─▶ convolver (procedural IR) ─▶ reverbReturn ─▶ masterGain
```

- **`sfxBus`** and **`musicBus`** carry the dry signal for sound effects and music,
  each scaled by the matching field of `AudioSettings`.
- **`duckGain`** sits only between `musicBus` and the master, so `audio.duck()` can
  lean on the music bed without touching sfx volume or anything the player chose in
  settings.
- **`reverbSend`** is a single shared bus every voice can tap into (`VoiceGraph.reverb`
  in `voices.ts`). It feeds a `ConvolverNode` whose impulse response is generated once,
  at startup, from exponentially-decaying filtered noise (~2.2 seconds, deliberately a
  little dark rather than bright and hissy) — again, no file involved.
- **`masterGain`** folds in the master volume and the mute switch, and everything
  finally passes through a soft-knee `DynamicsCompressorNode` as a safety net so a big
  win or an all-in cascade can't clip the mix.

## The `audio` singleton (`engine.ts`)

```ts
import { audio } from '@/audio/engine';

await audio.init();               // build the graph once, anywhere, any time
audio.unlock();                   // call from a user gesture to resume a suspended ctx
audio.play('chip_stack');
audio.play('ui_click', { vol: 0.8, pan: -0.3 });
audio.music('table');
audio.duck(0.6, 400);             // duck music to 40% for 400ms, then recover
audio.setSettings({ music: 0.3 });
const s = audio.getSettings();    // { master, sfx, music, muted }
```

- **`init(): Promise<void>`** builds the `AudioContext` and the whole node graph. It is
  idempotent and safe to call more than once or from more than one place — later calls
  resolve immediately if the graph already exists. It never rejects: a construction
  failure is caught internally and the engine simply stays silent (`ready` remains
  `false`). Building the graph does not require a user gesture; only *resuming* a
  suspended context does, which is what `unlock()` is for.
- **`ready: boolean`** is `true` once the context exists and is actually running (not
  `suspended`). Useful for e.g. showing a "click to enable sound" affordance.
- **`play(name, opts?)`** triggers one registered sound from `sfx.ts`.
  `opts.vol` (default `1`), `opts.pan` (`-1..1`, default `0`) and `opts.delay`
  (milliseconds) are handled by a per-play gain/panner pair the engine builds around
  the synth; `opts.pitch` (default `1`) is a frequency multiplier passed straight into
  the synth, which is what lets a caller make `ui_tick` or `heartbeat` sound more
  urgent as a countdown runs down without ever resampling (no chipmunking). Identical
  names are throttled to at most one trigger per ~25ms so a burst of near-simultaneous
  calls (e.g. a UI event firing twice) can't machine-gun the same sound.
- **`music(mood)`** crosses over to a `Mood`'s bed (see below), fading the outgoing bed
  out and the incoming one in over roughly 2 seconds. Calling `music()` with the mood
  that's already playing is a no-op — except `'showdown'`, which always retriggers,
  since it's meant to fire once per hand.
- **`stopMusic(fadeSec?)`** is shorthand for `music('none')` with an optional custom
  fade time in seconds (default ~2.2s).
- **`duck(amount, ms)`** temporarily attenuates the music bus — `amount` is how much to
  cut (`0` = no change, `1` = silence) and `ms` is how long to hold the cut before
  recovering. Use it under a big sting or a moment of dialogue-like emphasis.
- **`setSettings(partial)` / `getSettings()`** read and write `AudioSettings`
  (`{ master, sfx, music, muted }`, each volume `0..1`). Every change is persisted to
  `localStorage` under the key `hexhold.audio` and applied to the live graph
  immediately (smoothed with a short `setTargetAtTime` ramp so there's no zipper
  noise). Settings load with sane defaults the first time the game runs, and survive
  a call to `setSettings` even before `init()` has ever run.
- **`unlock()`** resumes a suspended context. Call it from a genuine user gesture
  (pointerdown/keydown) — `useAudioUnlock()` below already does this for you. If
  `init()` hasn't been called yet, `unlock()` triggers it and resumes once it's ready,
  so a component only has to use the hook and never has to sequence the two calls
  itself.

## Moods (`music.ts`)

Every mood is written in D minor / F major — the same key `voices.ts`'s `MIDI` table
and scales (`D_MINOR`, `D_PENT`) are built around — so a crossfade from any mood to any
other always lands on notes that belong together. A mood is a "layer": a small set of
long-lived oscillator/filter/gain nodes that start when the mood begins and are
properly `.stop()`-ed and disconnected when it ends (never just abandoned), plus a
lookahead-scheduled stream of one-shot musical events built from the same synth
primitives `sfx.ts` uses.

Scheduling for those one-shot events (bell motifs, plucks, ticks, arpeggio notes) is a
classic lookahead scheduler: a `setInterval` wakes every 25ms and schedules anything
due in the next 100ms against `ctx.currentTime`, the actual audio clock — never against
`setTimeout` alone, which drifts under any main-thread jank.

- **`menu`** — slow, dark ambient. Three to four detuned sawtooths through one lowpass
  filter with a slow LFO breathing the cutoff, a sparse bell motif every 8-12 seconds
  drawn from the D minor pentatonic scale, and a heavy reverb send throughout.
- **`table`** — understated on purpose: a soft sub pulse at ~72 BPM and an occasional
  muted pluck every 6-14 seconds, both kept quiet enough to be genuinely
  near-subliminal. This is the bed a player hears for the majority of a session, so it
  is deliberately the least event-dense mood in the file.
- **`tension`** — builds on the same 72 BPM sub pulse, then layers on a slowly
  rising-and-falling filtered-noise riser (a ~7 second cycle rather than a one-shot
  sweep), a ticking pulse at double time, and a sustained dissonant interval (the root
  against the tritone above it, closely detuned so the pair audibly beats).
- **`shop`** — warmer and lighter: a soft triangle pad on an F major triad, plus a
  gentle arpeggio with a slow shuffle (long-short) feel instead of straight time.
- **`showdown`** — brief and cinematic rather than a looping bed: a swelling saw-stack
  chord (the crossfade-in itself supplies the "swell") and a few low, timpani-like
  pitch-drop thumps. It self-terminates a few seconds after it starts even if nothing
  ever calls `music()` again, so it can never be left hanging as an accidental drone.
- **`none`** — fades whatever is currently playing out to silence.

## React hooks (`useAudio.ts`)

```tsx
import { useAudioUnlock, useSfx, useHoverSound } from '@/audio/useAudio';

function App() {
  useAudioUnlock(); // mount once near the root
  // ...
}

function ChipButton() {
  const play = useSfx();
  const hoverProps = useHoverSound(); // ui_hover on enter, ui_click on press
  return (
    <button {...hoverProps} onClick={() => play('chip_single')}>
      Bet
    </button>
  );
}
```

- **`useAudioUnlock()`** attaches one-time `pointerdown`/`keydown` listeners on
  `window` that call `audio.unlock()`, satisfying browser autoplay policy on first
  interaction. Mount it once near the root of the app.
- **`useSfx()`** returns a stable `play(name, opts?)` function, so it's safe to drop
  straight into a `useCallback`/`useEffect` dependency array or an event handler
  without re-subscribing anything.
- **`useHoverSound(opts?)`** returns `{ onPointerEnter, onPointerDown }` to spread onto
  a button or any interactive element, playing `ui_hover` on enter and `ui_click` on
  press by default. Pass `{ hover: 'other_sound' }` / `{ press: null }` to override or
  silence either side, and `{ pitch }` to shift both.

## Every `SfxName`

### Cards

| Name | Design intent |
| --- | --- |
| `card_deal` | A card skimming off the deck: one 40ms flick of 2-4kHz noise. |
| `card_flip` | Turning a card: the flick of the edge, then a soft woody thock as it lands. |
| `card_slide` | A card dragged across felt: a short band of noise that opens and closes. |
| `card_place` | A card set down on felt: all body, no sparkle — a heavily lowpassed thud. |
| `card_burn` | A card burned: dry crackle, a filter collapsing downward, then a sizzle tail. |
| `card_shuffle` | A riffle: sixteen-odd tiny flicks tumbling over 400ms, ear to ear. |

### Chips

| Name | Design intent |
| --- | --- |
| `chip_single` | One chip: bright inharmonic metal around 2.4kHz with a dry click on top. |
| `chip_stack` | A short stack dropped: a handful of chips, pitch falling as they settle. |
| `chip_slide` | Chips pushed forward: a swell of dry noise with a few clicks buried in it. |
| `pot_collect` | Raking the pot in: a rising cascade of clinks that lands on a warm thump. |
| `chip_allin` | Everything, forward: a dense cloud of chips over a sub that falls off a cliff. |

### UI

| Name | Design intent |
| --- | --- |
| `ui_hover` | The smallest possible acknowledgement that the cursor moved onto something. |
| `ui_click` | A crisp confirm: two tones a fifth apart, 25ms apart, with a dry tick. |
| `ui_back` | The click played backwards in pitch: high to low says "you went back". |
| `ui_error` | Refusal: a minor second ground together, clipped short so it stings. |
| `ui_confirm` | Yes: a rising fifth, plucked then belled, warm rather than shrill. |
| `ui_tick` | A clock tick, quiet on its own — `pitch` is what makes it feel nervous. |
| `ui_warn` | Under five seconds: the tick grows a second pulse and a beating detune. |

### Magic — schools

| Name | Design intent |
| --- | --- |
| `cast_entropy` | An unstable detuned cluster that loses cohesion and shatters into grains. |
| `cast_veil` | A swell running backwards into a breathy, formant-filtered whisper. |
| `cast_chronos` | Tape dragged to a halt, then a clock restarting faster and faster. |
| `cast_bind` | Two voices sliding from a whole tone apart into one, then ringing as one. |
| `cast_ruin` | A distorted impact, a broadband crack, and a growl walking downward. |
| `cast_weave` | A warm harp figure climbing the D minor triad — strings, not metal. |

### Magic — effects

| Name | Design intent |
| --- | --- |
| `spell_counter` | A reversed suck-in cut dead by a slam — a vault door closing on a spell. |
| `spell_fizzle` | The spell deflating: pitch sagging, wobbling, quietly embarrassed. |
| `collapse` | A cloud of crystal partials converging and resolving into one pure tone. |
| `superpose` | One certainty becoming two, drifting apart until they audibly beat. |
| `diverge` | The same note in both ears at once, detuned just enough to feel wrong. |
| `entangle` | Two pitches pulled into a fifth and then breathing on one shared LFO. |
| `inscribe` | A quill on parchment: narrow noise chopped by fast amplitude modulation. |
| `rewind` | Tape running the wrong way: pitch falling with a flutter on the capstan. |
| `seal` | Something heavy dropped into stone, with a long low ring behind it. |

### Game beats

| Name | Design intent |
| --- | --- |
| `deal_start` | The deck riffled hard while a low swell rises underneath it. |
| `street_flop` | The first rung of the street motif — D F A over a low hit. |
| `street_turn` | The same shape a third higher, one notch brighter and louder. |
| `street_river` | The top rung: highest, longest, most reverb. The last card is in. |
| `showdown` | A noise riser and a chord swelling open, then releasing. |
| `win_normal` | A warm F major arpeggio with chips raking in behind it. |
| `win_big` | The same idea two octaves wide, with a brass-ish chord behind it. |
| `win_impossible` | The impossible hand: a jackpot chord stack, shimmer falling through it, sub underneath. |
| `lose_hand` | A short muted fall, over before you can feel bad about it. |
| `eliminate` | A funeral bell tolling into a long, dark, empty tail. |
| `victory` | A full fanfare in F: rhythmic hits, a held chord, bells and chips. |
| `shop_open` | A soft whoosh and a warm chime cluster, like a curtain drawn back. |
| `shop_buy` | A coin landing, then a rising two-note confirm. Money well spent. |
| `shop_reroll` | A quick flutter of ticks accelerating into a small upward sweep. |
| `level_up` | The ante climbing: a four-note ascent stamped by a bell and a swell. |
| `heartbeat` | Lub-dub. `pitch` tightens the gap and raises it as the stakes rise. |
| `your_turn` | A gentle two-note summon. This one plays constantly — it must never nag. |

## Quality notes

- Every envelope uses `setValueAtTime` for its starting point, `linearRampToValueAtTime`
  for attacks (so they can rise cleanly from true silence), and
  `exponentialRampToValueAtTime` for decay/release (which reads as natural rather than
  digital). Nothing ever ramps exponentially to a literal `0` — every such ramp targets
  `0.0001`, the smallest value `exponentialRampToValueAtTime` accepts.
- Every source node — oscillators, buffer sources, LFOs — is either a short-lived voice
  that stops and disconnects itself once its own envelope finishes (`finish()` in
  `voices.ts`), or, for the long-running drones in `music.ts`, explicitly `.stop()`-ed
  and disconnected when its mood ends. Nothing is left running silently in the
  background; a multi-hour table session should not accumulate a single orphaned node.
- No third-party dependency, no bundled or fetched audio asset, no `<audio>` element —
  everything audible in this game is generated by JavaScript talking to the Web Audio
  API at the moment it's needed.
