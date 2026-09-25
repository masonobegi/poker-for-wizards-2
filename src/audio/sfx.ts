/**
 * HEXHOLD — the sound effect registry.
 *
 * One entry per named sound. Each entry declares roughly how long its tail
 * runs (so the engine knows when it is safe to reclaim the per-play nodes)
 * and a `play` function that schedules the whole thing at an absolute time.
 *
 * `pitch` is a frequency multiplier supplied by the caller. It is what makes
 * `ui_tick` and `heartbeat` grow more urgent as a timer runs down, and it is
 * applied inside each synth rather than by resampling, so nothing gets
 * chipmunked.
 *
 * Volume and stereo position are handled by the engine's per-play gain and
 * panner, so synths here only ever set *relative* pan between their own
 * layers.
 */

import {
  MIDI,
  chance,
  clamp,
  fmBell,
  mtof,
  noiseHit,
  pick,
  pluck,
  rand,
  randInt,
  sweep,
  tone,
  vary,
  type VoiceGraph,
} from './voices';

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

export type SfxName =
  // cards
  | 'card_deal'
  | 'card_flip'
  | 'card_slide'
  | 'card_place'
  | 'card_burn'
  | 'card_shuffle'
  // chips
  | 'chip_single'
  | 'chip_stack'
  | 'chip_slide'
  | 'pot_collect'
  | 'chip_allin'
  // ui
  | 'ui_hover'
  | 'ui_click'
  | 'ui_back'
  | 'ui_error'
  | 'ui_confirm'
  | 'ui_tick'
  | 'ui_warn'
  // magic — schools
  | 'cast_entropy'
  | 'cast_veil'
  | 'cast_chronos'
  | 'cast_bind'
  | 'cast_ruin'
  | 'cast_weave'
  // magic — effects
  | 'spell_counter'
  | 'spell_fizzle'
  | 'collapse'
  | 'superpose'
  | 'diverge'
  | 'entangle'
  | 'inscribe'
  | 'rewind'
  | 'seal'
  // game beats
  | 'deal_start'
  | 'street_flop'
  | 'street_turn'
  | 'street_river'
  | 'showdown'
  | 'win_normal'
  | 'win_big'
  | 'win_impossible'
  | 'lose_hand'
  | 'eliminate'
  | 'victory'
  | 'shop_open'
  | 'shop_buy'
  | 'shop_reroll'
  | 'level_up'
  | 'heartbeat'
  | 'your_turn';

/** A registry entry: its worst-case tail length, and how to build it. */
export interface SfxDef {
  /** Approximate seconds from trigger to silence, used for node reclamation. */
  len: number;
  play(g: VoiceGraph, t: number, pitch: number): void;
}

// ---------------------------------------------------------------------------
// Composite layers reused across the registry
// ---------------------------------------------------------------------------

/** A single paper flick: a band of noise around 2-4 kHz, gone in 40 ms. */
function flick(g: VoiceGraph, t: number, freq: number, gain: number, pan = 0): void {
  noiseHit(g, {
    at: t,
    gain,
    pan,
    filterType: 'bandpass',
    filterFreq: freq,
    filterTo: freq * 0.55,
    q: 1.4,
    attack: 0.001,
    decay: 0.018,
    sustain: 0.1,
    release: 0.022,
  });
  noiseHit(g, {
    at: t + 0.002,
    gain: gain * 0.35,
    pan,
    filterType: 'highpass',
    filterFreq: 6200,
    attack: 0.0005,
    decay: 0.008,
    release: 0.01,
  });
}

/** One chip landing on another: detuned metal partials plus a dry transient. */
function clink(
  g: VoiceGraph,
  t: number,
  freq: number,
  gain: number,
  pan = 0,
  send = 0.12,
): void {
  fmBell(g, {
    at: t,
    carrier: freq,
    ratio: 2.76,
    index: 3.4,
    decay: vary(0.17, 0.2),
    gain: gain * 0.7,
    pan,
    send,
  });
  fmBell(g, {
    at: t + 0.003,
    carrier: freq * 1.49,
    ratio: 1.71,
    index: 2.1,
    decay: vary(0.12, 0.25),
    gain: gain * 0.4,
    pan: pan * 0.7,
    send,
  });
  noiseHit(g, {
    at: t,
    gain: gain * 0.4,
    pan,
    filterType: 'highpass',
    filterFreq: 5200,
    attack: 0.0004,
    decay: 0.012,
    release: 0.012,
  });
}

/** Low body: a pitch-dropping sine, the thump under anything heavy. */
function thump(
  g: VoiceGraph,
  t: number,
  from: number,
  to: number,
  gain: number,
  decay = 0.3,
  send = 0.1,
): void {
  sweep(g, {
    at: t,
    from,
    to,
    ms: decay * 700,
    type: 'sine',
    gain,
    send,
    attack: 0.004,
    decay: decay * 0.6,
    sustain: 0.25,
    hold: 0,
    release: decay * 0.6,
  });
}

/** Stacked detuned saws through one filter — the "orchestra" of this engine. */
function sawStack(
  g: VoiceGraph,
  t: number,
  midis: readonly number[],
  opts: {
    gain: number;
    attack: number;
    hold: number;
    release: number;
    filterFrom: number;
    filterTo: number;
    send?: number;
    pitch?: number;
    detune?: number;
    type?: OscillatorType;
  },
): void {
  const p = opts.pitch ?? 1;
  const det = opts.detune ?? 7;
  midis.forEach((m, i) => {
    const spread = (i % 2 === 0 ? -1 : 1) * det;
    tone(g, {
      at: t,
      freq: mtof(m) * p,
      type: opts.type ?? 'sawtooth',
      detune: spread,
      gain: opts.gain / Math.sqrt(midis.length),
      send: opts.send ?? 0.3,
      pan: (i / Math.max(midis.length - 1, 1)) * 0.7 - 0.35,
      attack: opts.attack,
      decay: 0.12,
      sustain: 0.85,
      hold: opts.hold,
      release: opts.release,
      filter: {
        type: 'lowpass',
        freq: opts.filterFrom,
        to: opts.filterTo,
        q: 1.6,
        ms: (opts.attack + opts.hold) * 1000,
      },
    });
  });
}

/** A run of clinks, used for pot rakes, win cascades and all-in splashes. */
function chipCascade(
  g: VoiceGraph,
  t: number,
  count: number,
  spread: number,
  baseFreq: number,
  rise: number,
  gain: number,
): void {
  for (let i = 0; i < count; i++) {
    const k = i / Math.max(count - 1, 1);
    clink(
      g,
      t + k * spread + rand(0, spread * 0.06),
      vary(baseFreq * (1 + rise * k), 0.05),
      gain * rand(0.6, 1),
      rand(-0.55, 0.55),
      0.18,
    );
  }
}

/** The three-note street motif, one scale step higher on each street. */
function streetMotif(g: VoiceGraph, t: number, pitch: number, notes: readonly number[], level: number): void {
  thump(g, t, 92 * pitch, 52 * pitch, 0.34 + level * 0.05, 0.36, 0.2);
  notes.forEach((m, i) => {
    const at = t + i * 0.105;
    const f = mtof(m) * pitch;
    pluck(g, { at, freq: f, gain: 0.2 + level * 0.03, decay: 0.9, bright: 0.55, send: 0.34 });
    fmBell(g, {
      at,
      carrier: f * 2,
      ratio: 1.41,
      index: 2.2 + level,
      decay: 1.1 + level * 0.3,
      gain: 0.07 + level * 0.015,
      send: 0.55,
      pan: (i - 1) * 0.22,
    });
  });
  // A held low fifth underneath makes each street feel like it landed.
  tone(g, {
    at: t + 0.02,
    freq: mtof(MIDI.D2) * pitch,
    type: 'triangle',
    gain: 0.1,
    send: 0.3,
    attack: 0.03,
    decay: 0.3,
    sustain: 0.5,
    hold: 0.25 + level * 0.1,
    release: 0.5,
    filter: { type: 'lowpass', freq: 600, q: 1 },
  });
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SFX: Record<SfxName, SfxDef> = {
  // -------------------------------------------------------------- cards ----

  /** A card skimming off the deck: one 40 ms flick of 2-4 kHz noise. */
  card_deal: {
    len: 0.3,
    play: (g, t, p) => {
      flick(g, t, vary(3100, 0.22) * p, 0.22, rand(-0.35, 0.35));
      noiseHit(g, {
        at: t + 0.012,
        gain: 0.06,
        filterType: 'lowpass',
        filterFreq: 900 * p,
        attack: 0.002,
        decay: 0.05,
        release: 0.04,
      });
    },
  },

  /** Turning a card: the flick of the edge, then a soft woody thock as it lands. */
  card_flip: {
    len: 0.45,
    play: (g, t, p) => {
      flick(g, t, vary(3400, 0.18) * p, 0.2);
      const at = t + rand(0.03, 0.045);
      tone(g, {
        at,
        freq: vary(228, 0.08) * p,
        type: 'triangle',
        gain: 0.16,
        send: 0.1,
        attack: 0.001,
        decay: 0.06,
        sustain: 0.06,
        release: 0.07,
        filter: { type: 'lowpass', freq: 1400, q: 1.2 },
      });
      noiseHit(g, {
        at,
        gain: 0.1,
        filterType: 'lowpass',
        filterFreq: 700 * p,
        attack: 0.001,
        decay: 0.035,
        release: 0.03,
      });
    },
  },

  /** Card dragged across felt: a short band of noise that opens and closes. */
  card_slide: {
    len: 0.5,
    play: (g, t, p) => {
      noiseHit(g, {
        at: t,
        gain: 0.14,
        pan: rand(-0.3, 0.3),
        filterType: 'bandpass',
        filterFreq: vary(1500, 0.15) * p,
        filterTo: vary(700, 0.15) * p,
        q: 0.9,
        attack: 0.055,
        decay: 0.09,
        sustain: 0.6,
        hold: 0.05,
        release: 0.13,
      });
      noiseHit(g, {
        at: t + 0.02,
        gain: 0.05,
        filterType: 'highpass',
        filterFreq: 4200,
        attack: 0.06,
        decay: 0.12,
        release: 0.1,
      });
    },
  },

  /** A card set down on felt: all body, no sparkle — heavily lowpassed thud. */
  card_place: {
    len: 0.45,
    play: (g, t, p) => {
      thump(g, t, vary(132, 0.08) * p, 74 * p, 0.26, 0.2, 0.08);
      noiseHit(g, {
        at: t,
        gain: 0.13,
        filterType: 'lowpass',
        filterFreq: 420 * p,
        q: 1.1,
        attack: 0.001,
        decay: 0.055,
        release: 0.05,
      });
      noiseHit(g, {
        at: t,
        gain: 0.04,
        filterType: 'bandpass',
        filterFreq: 2600 * p,
        attack: 0.0008,
        decay: 0.012,
        release: 0.015,
      });
    },
  },

  /** A card burned: dry crackle, a filter collapsing downward, then a sizzle tail. */
  card_burn: {
    len: 1.4,
    play: (g, t, p) => {
      const n = randInt(7, 11);
      for (let i = 0; i < n; i++) {
        noiseHit(g, {
          at: t + rand(0, 0.5),
          gain: rand(0.05, 0.14),
          pan: rand(-0.6, 0.6),
          filterType: 'bandpass',
          filterFreq: rand(2600, 6500) * p,
          q: 3.2,
          attack: 0.0006,
          decay: 0.01,
          release: 0.014,
        });
      }
      noiseHit(g, {
        at: t,
        gain: 0.2,
        filterType: 'bandpass',
        filterFreq: 5200 * p,
        filterTo: 280 * p,
        q: 1.3,
        attack: 0.01,
        decay: 0.25,
        sustain: 0.55,
        hold: 0.2,
        release: 0.3,
        send: 0.25,
      });
      noiseHit(g, {
        at: t + 0.1,
        gain: 0.06,
        filterType: 'highpass',
        filterFreq: 6400,
        attack: 0.12,
        decay: 0.3,
        sustain: 0.4,
        hold: 0.15,
        release: 0.5,
        tremolo: { rate: 17, depth: 0.5 },
        send: 0.4,
      });
      thump(g, t + 0.02, 120 * p, 44 * p, 0.14, 0.45, 0.3);
    },
  },

  /** A riffle: sixteen-odd tiny flicks tumbling over 400 ms, ear to ear. */
  card_shuffle: {
    len: 0.8,
    play: (g, t, p) => {
      const n = randInt(14, 20);
      for (let i = 0; i < n; i++) {
        const k = i / n;
        flick(
          g,
          t + k * 0.4 + rand(0, 0.012),
          vary(2900 + k * 900, 0.14) * p,
          rand(0.06, 0.13),
          (i % 2 === 0 ? -1 : 1) * rand(0.15, 0.5),
        );
      }
      noiseHit(g, {
        at: t + 0.4,
        gain: 0.12,
        filterType: 'lowpass',
        filterFreq: 800 * p,
        attack: 0.002,
        decay: 0.09,
        release: 0.08,
      });
    },
  },

  // -------------------------------------------------------------- chips ----

  /** One chip: bright inharmonic metal around 2.4 kHz with a dry click on top. */
  chip_single: {
    len: 0.5,
    play: (g, t, p) => {
      clink(g, t, vary(2400, 0.06) * p, 0.3, rand(-0.2, 0.2));
      fmBell(g, {
        at: t + 0.005,
        carrier: vary(3380, 0.05) * p,
        ratio: 3.5,
        index: 1.6,
        decay: 0.09,
        gain: 0.07,
        send: 0.2,
      });
    },
  },

  /** A short stack dropped: a handful of chips, pitch falling as they settle. */
  chip_stack: {
    len: 0.6,
    play: (g, t, p) => {
      const n = randInt(4, 7);
      for (let i = 0; i < n; i++) {
        const k = i / Math.max(n - 1, 1);
        clink(
          g,
          t + k * 0.18 + rand(0, 0.014),
          vary(2500 * (1 - k * 0.3), 0.07) * p,
          rand(0.16, 0.28),
          rand(-0.4, 0.4),
        );
      }
      thump(g, t + 0.16, 140 * p, 70 * p, 0.12, 0.2, 0.08);
    },
  },

  /** Chips pushed forward: a swell of dry noise with a few clicks buried in it. */
  chip_slide: {
    len: 0.6,
    play: (g, t, p) => {
      noiseHit(g, {
        at: t,
        gain: 0.16,
        filterType: 'bandpass',
        filterFreq: vary(950, 0.12) * p,
        filterTo: 1600 * p,
        q: 0.8,
        attack: 0.09,
        decay: 0.1,
        sustain: 0.7,
        hold: 0.06,
        release: 0.12,
        send: 0.15,
      });
      for (let i = 0; i < 4; i++) {
        clink(g, t + rand(0.05, 0.28), vary(2300, 0.1) * p, rand(0.05, 0.11), rand(-0.5, 0.5));
      }
    },
  },

  /** Raking the pot in: a rising cascade of clinks that lands on a warm thump. */
  pot_collect: {
    len: 1.4,
    play: (g, t, p) => {
      chipCascade(g, t, randInt(11, 15), 0.66, 1900 * p, 0.55, 0.2);
      noiseHit(g, {
        at: t,
        gain: 0.08,
        filterType: 'bandpass',
        filterFreq: 1200 * p,
        filterTo: 3000 * p,
        q: 0.8,
        attack: 0.35,
        decay: 0.2,
        sustain: 0.4,
        release: 0.2,
        send: 0.25,
      });
      thump(g, t + 0.7, 112 * p, 48 * p, 0.42, 0.5, 0.3);
      tone(g, {
        at: t + 0.7,
        freq: mtof(MIDI.D3) * p,
        type: 'triangle',
        gain: 0.1,
        send: 0.45,
        attack: 0.01,
        decay: 0.3,
        sustain: 0.3,
        hold: 0.1,
        release: 0.5,
        filter: { type: 'lowpass', freq: 900, q: 1 },
      });
    },
  },

  /** Everything, forward: a dense cloud of chips over a sub that falls off a cliff. */
  chip_allin: {
    len: 2,
    play: (g, t, p) => {
      // The offline audio harness (test/audio.mjs) measured this stacking
      // above 1.0 (true clipping) on a meaningful fraction of runs, since
      // chipCascade's per-clink `rand()` gain/timing can constructively
      // overlap — every layer below is scaled by ~0.68 from its original
      // level to bring the worst case back under the ~0.8 headroom target.
      chipCascade(g, t, randInt(20, 26), 0.36, 2200 * p, -0.25, 0.15);
      noiseHit(g, {
        at: t,
        gain: 0.19,
        filterType: 'bandpass',
        filterFreq: 3000 * p,
        filterTo: 700 * p,
        q: 0.7,
        attack: 0.004,
        decay: 0.18,
        sustain: 0.35,
        hold: 0.08,
        release: 0.3,
        send: 0.4,
      });
      sweep(g, {
        at: t + 0.02,
        from: 130 * p,
        to: 29 * p,
        ms: 620,
        type: 'sine',
        gain: 0.37,
        attack: 0.006,
        decay: 0.3,
        sustain: 0.45,
        hold: 0.1,
        release: 0.45,
        send: 0.2,
      });
      tone(g, {
        at: t + 0.04,
        freq: mtof(MIDI.D2) * p,
        type: 'sawtooth',
        gain: 0.07,
        send: 0.5,
        attack: 0.02,
        decay: 0.4,
        sustain: 0.3,
        hold: 0.2,
        release: 0.7,
        filter: { type: 'lowpass', freq: 900, to: 260, q: 2 },
      });
    },
  },

  // ----------------------------------------------------------------- ui ----

  /** The smallest possible acknowledgement that the cursor moved onto something. */
  ui_hover: {
    len: 0.15,
    play: (g, t, p) => {
      tone(g, {
        at: t,
        freq: vary(1220, 0.03) * p,
        type: 'sine',
        gain: 0.045,
        attack: 0.002,
        decay: 0.012,
        release: 0.014,
      });
    },
  },

  /** A crisp confirm: two tones a fifth apart, 25 ms apart, with a dry tick. */
  ui_click: {
    len: 0.25,
    play: (g, t, p) => {
      tone(g, {
        at: t,
        freq: 880 * p,
        type: 'triangle',
        gain: 0.14,
        attack: 0.001,
        decay: 0.03,
        release: 0.03,
      });
      tone(g, {
        at: t + 0.026,
        freq: 1320 * p,
        type: 'sine',
        gain: 0.1,
        attack: 0.001,
        decay: 0.045,
        release: 0.05,
        send: 0.12,
      });
      noiseHit(g, {
        at: t,
        gain: 0.07,
        filterType: 'highpass',
        filterFreq: 3800,
        attack: 0.0005,
        decay: 0.008,
        release: 0.01,
      });
    },
  },

  /** The click played backwards in pitch: high to low says "you went back". */
  ui_back: {
    len: 0.25,
    play: (g, t, p) => {
      tone(g, {
        at: t,
        freq: 900 * p,
        type: 'triangle',
        gain: 0.11,
        attack: 0.001,
        decay: 0.03,
        release: 0.03,
      });
      tone(g, {
        at: t + 0.028,
        freq: 600 * p,
        type: 'sine',
        gain: 0.1,
        attack: 0.001,
        decay: 0.05,
        release: 0.06,
        send: 0.12,
      });
    },
  },

  /** Refusal: a minor second ground together, clipped short so it stings. */
  ui_error: {
    len: 0.4,
    play: (g, t, p) => {
      for (const f of [330, 349.2]) {
        tone(g, {
          at: t,
          freq: f * p,
          type: 'sawtooth',
          gain: 0.11,
          attack: 0.002,
          decay: 0.07,
          sustain: 0.5,
          hold: 0.05,
          release: 0.12,
          filter: { type: 'lowpass', freq: 1800, to: 700, q: 1.4 },
        });
      }
      thump(g, t, 140 * p, 80 * p, 0.14, 0.16, 0.05);
    },
  },

  /** Yes: a rising fifth, plucked then belled, warm rather than shrill. */
  ui_confirm: {
    len: 0.7,
    play: (g, t, p) => {
      pluck(g, { at: t, freq: mtof(MIDI.D5) * p, gain: 0.16, decay: 0.45, bright: 0.7, send: 0.25 });
      pluck(g, {
        at: t + 0.07,
        freq: mtof(MIDI.A5) * p,
        gain: 0.14,
        decay: 0.5,
        bright: 0.7,
        send: 0.3,
      });
      fmBell(g, {
        at: t + 0.07,
        carrier: mtof(MIDI.A5) * p,
        ratio: 2,
        index: 1.4,
        decay: 0.5,
        gain: 0.05,
        send: 0.45,
      });
    },
  },

  /** Clock tick. Quiet on its own; `pitch` is what makes it nervous. */
  ui_tick: {
    len: 0.18,
    play: (g, t, p) => {
      tone(g, {
        at: t,
        freq: 1000 * p,
        type: 'sine',
        gain: 0.055,
        attack: 0.0008,
        decay: 0.016,
        release: 0.018,
      });
      noiseHit(g, {
        at: t,
        gain: 0.035,
        filterType: 'bandpass',
        filterFreq: 3200 * p,
        q: 2,
        attack: 0.0005,
        decay: 0.008,
        release: 0.008,
      });
    },
  },

  /** Under five seconds: the tick grows a second pulse and a beating detune. */
  ui_warn: {
    len: 0.45,
    play: (g, t, p) => {
      for (const off of [0, 0.13]) {
        tone(g, {
          at: t + off,
          freq: 660 * p,
          type: 'square',
          detune: off === 0 ? -6 : 8,
          gain: 0.09,
          attack: 0.002,
          decay: 0.04,
          sustain: 0.4,
          hold: 0.03,
          release: 0.06,
          filter: { type: 'lowpass', freq: 2200, q: 1 },
        });
      }
      noiseHit(g, {
        at: t,
        gain: 0.05,
        filterType: 'bandpass',
        filterFreq: 1800 * p,
        q: 1.6,
        attack: 0.001,
        decay: 0.03,
        release: 0.04,
      });
    },
  },

  // --------------------------------------------------------- cast: six ----

  /** Entropy: an unstable detuned cluster that loses cohesion and shatters into grains. */
  cast_entropy: {
    len: 2.2,
    play: (g, t, p) => {
      for (let i = 0; i < 4; i++) {
        tone(g, {
          at: t,
          freq: mtof(MIDI.D4) * p,
          type: 'sawtooth',
          detune: -34 + i * 23,
          gain: 0.09,
          send: 0.3,
          pan: i * 0.4 - 0.6,
          attack: 0.012,
          decay: 0.1,
          sustain: 0.8,
          hold: 0.24,
          release: 0.12,
          vibrato: { rate: 6.5 + i * 1.7, depth: 28 + i * 9 },
          filter: { type: 'bandpass', freq: 1400, to: 3200, q: 2.2, ms: 420 },
        });
      }
      // The shatter: a burst of noise, then granular shimmer scattering outward.
      noiseHit(g, {
        at: t + 0.42,
        gain: 0.2,
        filterType: 'highpass',
        filterFreq: 2600,
        attack: 0.002,
        decay: 0.1,
        release: 0.16,
        send: 0.5,
      });
      const grains = 16;
      for (let i = 0; i < grains; i++) {
        const k = i / grains;
        fmBell(g, {
          at: t + 0.44 + k * 0.85 + rand(0, 0.04),
          carrier: mtof(pick([MIDI.D5, MIDI.F5, MIDI.A5, MIDI.C6, MIDI.D6])) * p * rand(0.98, 1.02),
          ratio: rand(1.3, 3.7),
          index: rand(1.5, 5),
          decay: rand(0.12, 0.4),
          gain: 0.05 * (1 - k * 0.6),
          pan: rand(-0.9, 0.9),
          send: 0.7,
        });
      }
      thump(g, t + 0.42, 90 * p, 40 * p, 0.2, 0.4, 0.3);
    },
  },

  /** Veil: a swell running backwards into a breathy, formant-filtered whisper. */
  cast_veil: {
    len: 2.8,
    play: (g, t, p) => {
      noiseHit(g, {
        at: t,
        gain: 0.2,
        filterType: 'bandpass',
        filterFreq: 300,
        filterTo: 2400,
        q: 1.1,
        attack: 0.62,
        decay: 0.06,
        sustain: 0.9,
        hold: 0.02,
        release: 0.1,
        send: 0.85,
      });
      // Two formants over a slow tremolo read as breath rather than hiss.
      for (const [f, q, gain] of [
        [620, 6, 0.09],
        [1850, 8, 0.06],
        [3100, 9, 0.035],
      ] as const) {
        noiseHit(g, {
          at: t + 0.6,
          gain,
          filterType: 'bandpass',
          filterFreq: f * p,
          q,
          attack: 0.14,
          decay: 0.3,
          sustain: 0.6,
          hold: 0.35,
          release: 0.7,
          tremolo: { rate: rand(3.4, 5.2), depth: 0.45 },
          pan: rand(-0.5, 0.5),
          send: 0.9,
        });
      }
      tone(g, {
        at: t + 0.55,
        freq: mtof(MIDI.A3) * p,
        type: 'triangle',
        gain: 0.08,
        send: 1,
        attack: 0.3,
        decay: 0.3,
        sustain: 0.6,
        hold: 0.4,
        release: 0.9,
        filter: { type: 'lowpass', freq: 900, to: 420, q: 1.2 },
      });
      tone(g, {
        at: t + 0.55,
        freq: mtof(MIDI.D3) * p,
        type: 'sine',
        gain: 0.09,
        send: 0.6,
        attack: 0.25,
        decay: 0.3,
        sustain: 0.5,
        hold: 0.5,
        release: 0.8,
      });
    },
  },

  /** Chronos: tape dragged to a halt, then a clock restarting faster and faster. */
  cast_chronos: {
    len: 2.6,
    play: (g, t, p) => {
      sweep(g, {
        at: t,
        from: 520 * p,
        to: 58 * p,
        ms: 620,
        type: 'sawtooth',
        gain: 0.2,
        send: 0.35,
        attack: 0.01,
        decay: 0.2,
        sustain: 0.7,
        hold: 0.25,
        release: 0.25,
        vibrato: { rate: 5.5, depth: 25 },
        filter: { type: 'lowpass', freq: 2600, to: 380, q: 2, ms: 620 },
      });
      sweep(g, {
        at: t + 0.05,
        from: 80 * p,
        to: 900 * p,
        ms: 520,
        type: 'triangle',
        gain: 0.1,
        send: 0.5,
        attack: 0.35,
        decay: 0.05,
        sustain: 0.9,
        hold: 0.02,
        release: 0.12,
      });
      // Ticks accelerating: each gap is 0.78 of the last.
      let at = t + 0.72;
      let gap = 0.3;
      for (let i = 0; i < 9; i++) {
        noiseHit(g, {
          at,
          gain: 0.09 + i * 0.006,
          filterType: 'bandpass',
          filterFreq: 2800 * p,
          q: 3,
          attack: 0.0005,
          decay: 0.012,
          release: 0.012,
          send: 0.3,
          pan: i % 2 === 0 ? -0.25 : 0.25,
        });
        tone(g, {
          at,
          freq: (i % 2 === 0 ? 1600 : 1900) * p,
          type: 'sine',
          gain: 0.05,
          attack: 0.0006,
          decay: 0.02,
          release: 0.02,
          send: 0.35,
        });
        at += gap;
        gap *= 0.78;
      }
    },
  },

  /** Bind: two voices sliding from a whole tone apart into one, then ringing as one. */
  cast_bind: {
    len: 2.2,
    play: (g, t, p) => {
      const target = mtof(MIDI.A4) * p;
      const pair: ReadonlyArray<[number, number, number]> = [
        [target * 0.891, -0.45, -3],
        [target * 1.122, 0.45, 3],
      ];
      for (const [from, pan, det] of pair) {
        tone(g, {
          at: t,
          freq: from,
          to: target,
          glide: 1.05,
          glideType: 'exp',
          type: 'triangle',
          detune: det,
          pan,
          gain: 0.14,
          send: 0.45,
          attack: 0.05,
          decay: 0.2,
          sustain: 0.85,
          hold: 0.95,
          release: 0.5,
          filter: { type: 'lowpass', freq: 1600, to: 3200, q: 1.2, ms: 1100 },
        });
      }
      fmBell(g, {
        at: t + 1.05,
        carrier: target,
        ratio: 2,
        index: 1.2,
        decay: 1,
        gain: 0.09,
        send: 0.7,
      });
      tone(g, {
        at: t + 1.05,
        freq: target / 2,
        type: 'sine',
        gain: 0.1,
        send: 0.4,
        attack: 0.02,
        decay: 0.3,
        sustain: 0.5,
        hold: 0.25,
        release: 0.6,
      });
    },
  },

  /** Ruin: a distorted impact, a broadband crack, and a growl walking downward. */
  cast_ruin: {
    len: 2.4,
    play: (g, t, p) => {
      // The offline audio harness (test/audio.mjs) measured this landing
      // consistently above the 0.8 headroom guideline (and close to
      // clipping on the loudest runs) — every layer below is scaled by
      // ~0.78 from its original level.
      sweep(g, {
        at: t,
        from: 86 * p,
        to: 34 * p,
        ms: 420,
        type: 'sine',
        gain: 0.43,
        shape: 0.85,
        send: 0.2,
        attack: 0.003,
        decay: 0.22,
        sustain: 0.4,
        hold: 0.05,
        release: 0.3,
      });
      noiseHit(g, {
        at: t,
        gain: 0.25,
        filterType: 'highpass',
        filterFreq: 1500,
        attack: 0.001,
        decay: 0.09,
        release: 0.14,
        send: 0.45,
      });
      noiseHit(g, {
        at: t + 0.01,
        gain: 0.14,
        filterType: 'bandpass',
        filterFreq: 700,
        filterTo: 180,
        q: 0.9,
        attack: 0.004,
        decay: 0.3,
        sustain: 0.3,
        release: 0.4,
        send: 0.3,
      });
      sweep(g, {
        at: t + 0.06,
        from: 170 * p,
        to: 46 * p,
        ms: 1300,
        type: 'sawtooth',
        gain: 0.12,
        shape: 0.6,
        send: 0.35,
        attack: 0.03,
        decay: 0.4,
        sustain: 0.6,
        hold: 0.5,
        release: 0.6,
        vibrato: { rate: 17, depth: 45 },
        filter: { type: 'lowpass', freq: 900, to: 320, q: 3, ms: 1300 },
      });
    },
  },

  /** Weave: a warm harp figure climbing the D minor triad, strings not metal. */
  cast_weave: {
    len: 2,
    play: (g, t, p) => {
      const line = [MIDI.D4, MIDI.F4, MIDI.A4, MIDI.C5, MIDI.D5, MIDI.F5, MIDI.A5];
      line.forEach((m, i) => {
        pluck(g, {
          at: t + i * vary(0.072, 0.08),
          freq: mtof(m) * p,
          gain: 0.19 - i * 0.008,
          decay: 1.1,
          bright: 0.62,
          send: 0.45,
          pan: (i / (line.length - 1)) * 0.6 - 0.3,
        });
      });
      tone(g, {
        at: t,
        freq: mtof(MIDI.D3) * p,
        type: 'triangle',
        gain: 0.1,
        send: 0.5,
        attack: 0.18,
        decay: 0.3,
        sustain: 0.6,
        hold: 0.3,
        release: 0.6,
        filter: { type: 'lowpass', freq: 1100, q: 1 },
      });
      fmBell(g, {
        at: t + line.length * 0.072,
        carrier: mtof(MIDI.D6) * p,
        ratio: 2,
        index: 1.1,
        decay: 1.2,
        gain: 0.05,
        send: 0.8,
      });
    },
  },

  // ------------------------------------------------------ magic effects ----

  /** Counter: a reversed suck-in cut dead by a slam — a vault door closing on a spell. */
  spell_counter: {
    len: 1.5,
    play: (g, t, p) => {
      noiseHit(g, {
        at: t,
        gain: 0.24,
        filterType: 'bandpass',
        filterFreq: 400,
        filterTo: 4200,
        q: 1.1,
        attack: 0.33,
        decay: 0.02,
        sustain: 0.9,
        hold: 0,
        release: 0.015,
        send: 0.3,
      });
      const hit = t + 0.35;
      thump(g, hit, 104 * p, 40 * p, 0.6, 0.35, 0.25);
      noiseHit(g, {
        at: hit,
        gain: 0.26,
        filterType: 'lowpass',
        filterFreq: 1100,
        filterTo: 260,
        q: 1.4,
        attack: 0.001,
        decay: 0.14,
        sustain: 0.2,
        release: 0.2,
        send: 0.4,
      });
      tone(g, {
        at: hit,
        freq: 186 * p,
        type: 'square',
        gain: 0.1,
        send: 0.5,
        attack: 0.001,
        decay: 0.12,
        sustain: 0.12,
        release: 0.35,
        filter: { type: 'bandpass', freq: 900, q: 4 },
      });
    },
  },

  /** Fizzle: the spell deflating — pitch sagging, wobbling, quietly embarrassed. */
  spell_fizzle: {
    len: 1.1,
    play: (g, t, p) => {
      sweep(g, {
        at: t,
        from: 540 * p,
        to: 115 * p,
        ms: 600,
        type: 'triangle',
        gain: 0.17,
        send: 0.3,
        attack: 0.01,
        decay: 0.2,
        sustain: 0.6,
        hold: 0.15,
        release: 0.3,
        vibrato: { rate: 9.5, depth: 65 },
        filter: { type: 'lowpass', freq: 2000, to: 420, q: 1.6, ms: 620 },
      });
      noiseHit(g, {
        at: t + 0.05,
        gain: 0.08,
        filterType: 'bandpass',
        filterFreq: 1800,
        filterTo: 500,
        q: 1.2,
        attack: 0.02,
        decay: 0.3,
        sustain: 0.3,
        release: 0.35,
        tremolo: { rate: 11, depth: 0.6 },
        send: 0.35,
      });
    },
  },

  /** Collapse: a cloud of crystal partials converging and resolving into one pure tone. */
  collapse: {
    len: 2.8,
    play: (g, t, p) => {
      const shards = [MIDI.D5, MIDI.F5, MIDI.A5, MIDI.C6, MIDI.E5, MIDI.D6, MIDI.G5, MIDI.A6];
      shards.forEach((m, i) => {
        const k = i / shards.length;
        fmBell(g, {
          at: t + k * 0.42 + rand(0, 0.03),
          carrier: mtof(m) * p * rand(0.995, 1.005),
          ratio: rand(1.38, 2.05),
          index: rand(1.4, 3.2),
          decay: 1.4 - k * 0.6,
          gain: 0.075 * (1 - k * 0.35),
          pan: rand(-0.85, 0.85),
          send: 0.85,
        });
      });
      noiseHit(g, {
        at: t,
        gain: 0.09,
        filterType: 'highpass',
        filterFreq: 5200,
        attack: 0.18,
        decay: 0.25,
        sustain: 0.3,
        release: 0.4,
        send: 0.9,
      });
      // Everything narrows to a single sine, breathing gently as it fades.
      const pure = mtof(MIDI.D5) * p;
      tone(g, {
        at: t + 0.5,
        freq: pure,
        type: 'sine',
        gain: 0.17,
        send: 0.8,
        attack: 0.22,
        decay: 0.35,
        sustain: 0.75,
        hold: 0.7,
        release: 1,
        tremolo: { rate: 4.2, depth: 0.16 },
      });
      tone(g, {
        at: t + 0.55,
        freq: pure * 2,
        type: 'sine',
        gain: 0.04,
        send: 0.95,
        attack: 0.3,
        decay: 0.4,
        sustain: 0.5,
        hold: 0.5,
        release: 0.9,
      });
      tone(g, {
        at: t + 0.5,
        freq: pure / 4,
        type: 'sine',
        gain: 0.13,
        send: 0.3,
        attack: 0.15,
        decay: 0.5,
        sustain: 0.5,
        hold: 0.4,
        release: 0.9,
      });
    },
  },

  /** Superpose: one certainty becoming two, drifting apart until they audibly beat. */
  superpose: {
    len: 1.8,
    play: (g, t, p) => {
      // The offline audio harness (test/audio.mjs) measured this ranging
      // from ~0.17 up to ~0.98 across runs that otherwise share this synth's
      // fully deterministic dry signal — the two near-unison tones are
      // *designed* to beat, and how far that beat's peaks reach depends on
      // exactly where the (session-random) shared reverb IR happens to
      // reinforce or cancel it. A first, smaller trim still let an unlucky
      // IR land within a couple percent of clipping over ~100 sampled runs,
      // so gain and reverb send are both cut hard here rather than
      // fine-tuned — this is a small "wrongness" sting, not a moment that
      // needs headroom of its own.
      const f = mtof(MIDI.A4) * p;
      tone(g, {
        at: t,
        freq: f,
        type: 'triangle',
        gain: 0.085,
        send: 0.15,
        attack: 0.03,
        decay: 0.1,
        sustain: 0.85,
        hold: 0.2,
        release: 0.08,
      });
      const split = t + 0.34;
      tone(g, {
        at: split,
        freq: f,
        to: f * 0.997,
        glide: 0.5,
        glideType: 'lin',
        type: 'triangle',
        pan: -0.4,
        gain: 0.075,
        send: 0.16,
        attack: 0.02,
        decay: 0.15,
        sustain: 0.85,
        hold: 0.7,
        release: 0.4,
      });
      tone(g, {
        at: split,
        freq: f,
        to: f * 1.012,
        glide: 0.5,
        glideType: 'lin',
        type: 'triangle',
        pan: 0.4,
        gain: 0.075,
        send: 0.16,
        attack: 0.02,
        decay: 0.15,
        sustain: 0.85,
        hold: 0.7,
        release: 0.4,
      });
      noiseHit(g, {
        at: split,
        gain: 0.035,
        filterType: 'highpass',
        filterFreq: 4000,
        attack: 0.004,
        decay: 0.06,
        release: 0.1,
        send: 0.35,
      });
    },
  },

  /** Diverge: the same note in both ears at once, detuned just enough to feel wrong. */
  diverge: {
    len: 1.4,
    play: (g, t, p) => {
      const f = mtof(MIDI.E4) * p;
      noiseHit(g, {
        at: t,
        gain: 0.1,
        filterType: 'bandpass',
        filterFreq: 2600,
        q: 1.2,
        attack: 0.002,
        decay: 0.05,
        release: 0.07,
        send: 0.3,
      });
      for (const [pan, det] of [
        [-1, -14],
        [1, 14],
      ] as const) {
        tone(g, {
          at: t + 0.02,
          freq: f,
          type: 'triangle',
          detune: det,
          pan,
          gain: 0.15,
          send: 0.4,
          attack: 0.015,
          decay: 0.18,
          sustain: 0.7,
          hold: 0.45,
          release: 0.45,
          filter: { type: 'lowpass', freq: 2400, q: 1 },
        });
      }
      tone(g, {
        at: t + 0.02,
        freq: f / 2,
        type: 'sine',
        gain: 0.08,
        send: 0.25,
        attack: 0.02,
        decay: 0.25,
        sustain: 0.4,
        hold: 0.3,
        release: 0.4,
      });
    },
  },

  /** Entangle: two pitches pulled into a fifth and then breathing on one shared LFO. */
  entangle: {
    len: 2,
    play: (g, t, p) => {
      const root = mtof(MIDI.D5) * p;
      const { ctx } = g;
      // One tremolo oscillator drives both voices, so they pulse as a single object.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(5.4, t);
      const lfoAmt = ctx.createGain();
      lfoAmt.gain.setValueAtTime(0.32, t);
      lfo.connect(lfoAmt);

      const shared = ctx.createGain();
      shared.gain.setValueAtTime(0.68, t);
      lfoAmt.connect(shared.gain);
      shared.connect(g.dest);
      const wet = ctx.createGain();
      wet.gain.setValueAtTime(0.55, t);
      shared.connect(wet);
      wet.connect(g.reverb);

      const sub: VoiceGraph = { ctx, dest: shared, reverb: g.reverb };
      tone(sub, {
        at: t,
        freq: root * 0.944,
        to: root,
        glide: 0.6,
        type: 'triangle',
        pan: -0.35,
        gain: 0.14,
        attack: 0.03,
        decay: 0.2,
        sustain: 0.85,
        hold: 0.75,
        release: 0.45,
      });
      tone(sub, {
        at: t,
        freq: root * 1.587,
        to: root * 1.5,
        glide: 0.6,
        type: 'triangle',
        pan: 0.35,
        gain: 0.12,
        attack: 0.03,
        decay: 0.2,
        sustain: 0.85,
        hold: 0.75,
        release: 0.45,
      });
      fmBell(g, {
        at: t + 0.6,
        carrier: root * 1.5,
        ratio: 2,
        index: 1,
        decay: 1,
        gain: 0.05,
        send: 0.75,
      });

      lfo.start(t);
      lfo.stop(t + 1.9);
      lfo.onended = () => {
        lfo.disconnect();
        lfoAmt.disconnect();
        shared.disconnect();
        wet.disconnect();
      };
    },
  },

  /** Inscribe: a quill on parchment — narrow noise chopped by fast amplitude modulation. */
  inscribe: {
    len: 1,
    play: (g, t, p) => {
      noiseHit(g, {
        at: t,
        gain: 0.14,
        filterType: 'bandpass',
        filterFreq: 2200 * p,
        filterTo: 3000 * p,
        q: 3.5,
        attack: 0.02,
        decay: 0.18,
        sustain: 0.65,
        hold: 0.2,
        release: 0.16,
        tremolo: { rate: vary(29, 0.12), depth: 0.85 },
        send: 0.2,
      });
      for (let i = 0; i < 5; i++) {
        noiseHit(g, {
          at: t + rand(0.02, 0.5),
          gain: rand(0.03, 0.07),
          filterType: 'highpass',
          filterFreq: 5200,
          attack: 0.0005,
          decay: 0.01,
          release: 0.012,
          pan: rand(-0.3, 0.3),
        });
      }
      tone(g, {
        at: t + 0.52,
        freq: 1480 * p,
        type: 'sine',
        gain: 0.05,
        send: 0.5,
        attack: 0.004,
        decay: 0.12,
        release: 0.18,
      });
    },
  },

  /** Rewind: tape running the wrong way — pitch falling with a flutter on the capstan. */
  rewind: {
    len: 1.8,
    play: (g, t, p) => {
      sweep(g, {
        at: t,
        from: 920 * p,
        to: 118 * p,
        ms: 1050,
        type: 'sawtooth',
        gain: 0.18,
        send: 0.4,
        attack: 0.02,
        decay: 0.3,
        sustain: 0.7,
        hold: 0.4,
        release: 0.35,
        vibrato: { rate: 6.8, depth: 40 },
        filter: { type: 'lowpass', freq: 3200, to: 600, q: 1.8, ms: 1050 },
      });
      noiseHit(g, {
        at: t,
        gain: 0.12,
        filterType: 'bandpass',
        filterFreq: 3600,
        filterTo: 900,
        q: 1,
        attack: 0.03,
        decay: 0.4,
        sustain: 0.45,
        hold: 0.3,
        release: 0.4,
        tremolo: { rate: 13, depth: 0.35 },
        send: 0.45,
      });
      // A reversed swell underneath sells the direction change.
      noiseHit(g, {
        at: t + 0.9,
        gain: 0.13,
        filterType: 'bandpass',
        filterFreq: 500,
        filterTo: 2600,
        q: 1.2,
        attack: 0.42,
        decay: 0.03,
        sustain: 0.9,
        release: 0.05,
        send: 0.5,
      });
      thump(g, t + 1.32, 130 * p, 52 * p, 0.28, 0.3, 0.3);
    },
  },

  /** Seal: something heavy dropped into stone, with a long low ring behind it. */
  seal: {
    len: 2.6,
    play: (g, t, p) => {
      thump(g, t, 74 * p, 31 * p, 0.6, 0.45, 0.25);
      noiseHit(g, {
        at: t,
        gain: 0.24,
        filterType: 'lowpass',
        filterFreq: 520,
        filterTo: 170,
        q: 1.3,
        attack: 0.002,
        decay: 0.16,
        sustain: 0.2,
        release: 0.3,
        send: 0.5,
      });
      fmBell(g, {
        at: t + 0.012,
        carrier: 418 * p,
        ratio: 2.74,
        index: 4.5,
        decay: 0.5,
        gain: 0.1,
        send: 0.6,
      });
      tone(g, {
        at: t + 0.03,
        freq: mtof(MIDI.D2) * p,
        type: 'triangle',
        gain: 0.16,
        send: 0.8,
        attack: 0.02,
        decay: 0.6,
        sustain: 0.4,
        hold: 0.5,
        release: 1.1,
        filter: { type: 'lowpass', freq: 500, q: 1.4 },
      });
    },
  },

  // -------------------------------------------------------- game beats ----

  /** Deal start: the deck riffled hard while a low swell rises underneath it. */
  deal_start: {
    len: 2,
    play: (g, t, p) => {
      const n = 28;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        // Accelerating: the gaps shrink as the riffle closes.
        flick(
          g,
          t + Math.pow(k, 0.72) * 0.55,
          vary(2800 + k * 1200, 0.12) * p,
          0.07 + k * 0.05,
          (i % 2 === 0 ? -1 : 1) * rand(0.2, 0.55),
        );
      }
      sawStack(g, t, [MIDI.D2, MIDI.A2, MIDI.D3, MIDI.F3], {
        gain: 0.22,
        attack: 0.7,
        hold: 0.15,
        release: 0.55,
        filterFrom: 220,
        filterTo: 1400,
        send: 0.4,
        pitch: p,
      });
      thump(g, t + 0.6, 120 * p, 46 * p, 0.34, 0.45, 0.3);
    },
  },

  /** Flop: the first rung of the street motif — D F A over a low hit. */
  street_flop: {
    len: 1.6,
    play: (g, t, p) => streetMotif(g, t, p, [MIDI.D4, MIDI.F4, MIDI.A4], 0),
  },

  /** Turn: the same shape a third higher, one notch brighter and louder. */
  street_turn: {
    len: 1.8,
    play: (g, t, p) => streetMotif(g, t, p, [MIDI.F4, MIDI.A4, MIDI.C5], 1),
  },

  /** River: the top rung — highest, longest, most reverb. The last card is in. */
  street_river: {
    len: 2,
    play: (g, t, p) => streetMotif(g, t, p, [MIDI.A4, MIDI.C5, MIDI.E5], 2),
  },

  /** Showdown: a noise riser and a chord swelling open, then releasing. */
  showdown: {
    len: 2.4,
    play: (g, t, p) => {
      noiseHit(g, {
        at: t,
        gain: 0.16,
        filterType: 'bandpass',
        filterFreq: 400,
        filterTo: 6000,
        q: 1.4,
        attack: 0.85,
        decay: 0.06,
        sustain: 0.85,
        hold: 0.02,
        release: 0.35,
        send: 0.6,
      });
      sawStack(g, t, [MIDI.D3, MIDI.F3, MIDI.A3, MIDI.D4], {
        gain: 0.26,
        attack: 0.88,
        hold: 0.12,
        release: 0.6,
        filterFrom: 300,
        filterTo: 2600,
        send: 0.45,
        pitch: p,
      });
      thump(g, t + 0.88, 96 * p, 40 * p, 0.42, 0.5, 0.35);
      fmBell(g, {
        at: t + 0.9,
        carrier: mtof(MIDI.D5) * p,
        ratio: 1.41,
        index: 2.6,
        decay: 1.4,
        gain: 0.08,
        send: 0.8,
      });
    },
  },

  /** Win: a warm F major arpeggio with chips raking in behind it. */
  win_normal: {
    len: 2,
    play: (g, t, p) => {
      [MIDI.F3, MIDI.A3, MIDI.C4, MIDI.F4].forEach((m, i) => {
        pluck(g, {
          at: t + i * 0.085,
          freq: mtof(m) * p,
          gain: 0.22,
          decay: 1.1,
          bright: 0.62,
          send: 0.4,
          pan: i * 0.2 - 0.3,
        });
      });
      chipCascade(g, t + 0.18, 9, 0.5, 2100 * p, 0.35, 0.16);
      thump(g, t, 110 * p, 55 * p, 0.28, 0.35, 0.25);
      fmBell(g, {
        at: t + 0.34,
        carrier: mtof(MIDI.F5) * p,
        ratio: 2,
        index: 1.4,
        decay: 1.3,
        gain: 0.07,
        send: 0.75,
      });
    },
  },

  /** Big win: the same idea two octaves wide, with a brass-ish chord behind it. */
  win_big: {
    len: 2.6,
    play: (g, t, p) => {
      [MIDI.F2, MIDI.C3, MIDI.F3, MIDI.A3, MIDI.C4, MIDI.F4, MIDI.A4].forEach((m, i) => {
        pluck(g, {
          at: t + i * 0.068,
          freq: mtof(m) * p,
          gain: 0.22 - i * 0.008,
          decay: 1.3,
          bright: 0.68,
          send: 0.45,
          pan: (i / 6) * 0.7 - 0.35,
        });
      });
      sawStack(g, t + 0.42, [MIDI.F2, MIDI.C3, MIDI.F3, MIDI.A3, MIDI.C4], {
        gain: 0.26,
        attack: 0.09,
        hold: 0.5,
        release: 0.9,
        filterFrom: 700,
        filterTo: 4400,
        send: 0.5,
        pitch: p,
      });
      chipCascade(g, t + 0.3, 16, 0.7, 4400 * p, 0.6, 0.18);
      // The sub used to sit at 0.45 and it dragged the whole sound down to a
      // measured 258Hz — eight percent brighter than `eliminate`, which is to
      // say the best thing that happens to you sounded like the worst. Less
      // floor, more ceiling. See the brightness checks in test/audio.mjs.
      thump(g, t + 0.42, 120 * p, 44 * p, 0.17, 0.5, 0.3);
      fmBell(g, {
        at: t + 0.5,
        carrier: mtof(MIDI.F6) * p,
        ratio: 2,
        index: 1.6,
        decay: 1.8,
        gain: 0.16,
        send: 0.85,
      });
      fmBell(g, {
        at: t + 0.62,
        carrier: mtof(MIDI.A6) * p,
        ratio: 3,
        index: 1.2,
        decay: 1.4,
        gain: 0.1,
        send: 0.9,
      });
    },
  },

  /** The impossible hand: a jackpot chord stack, shimmer falling through it, sub underneath. */
  win_impossible: {
    len: 3.4,
    play: (g, t, p) => {
      // Three octaves of F major add9 — the widest chord in the game.
      // F1 was dropped: the lowest octave contributed almost nothing anybody
      // could hear as pitch and pulled the measured centroid to 169Hz, which
      // made the game's biggest moment darker than its elimination sting.
      const chord = [
        MIDI.F2,
        MIDI.C3,
        MIDI.F3,
        MIDI.A3,
        MIDI.C4,
        MIDI.E4,
        MIDI.G4,
        MIDI.A4,
        MIDI.C5,
        MIDI.F5,
        MIDI.A5,
      ];
      // The offline audio harness (test/audio.mjs) measured this clipping
      // (peak > 1.0) on a meaningful share of runs — the 20-voice shimmer's
      // randomized timing occasionally stacks constructively on top of the
      // full chord. Every layer below is scaled by ~0.72 from its original
      // level; it's still meant to be the single loudest sound in the game,
      // just with headroom instead of clipping.
      // Raised from 0.3 with the sub removed: taking the bottom octave out
      // fixed the brightness and cost this its title as the biggest sound in
      // the set, so the weight comes back as chord rather than as floor.
      sawStack(g, t, chord, {
        gain: 0.32,
        attack: 0.12,
        hold: 1.1,
        release: 1.2,
        filterFrom: 900,
        filterTo: 6200,
        send: 0.6,
        pitch: p,
        detune: 9,
      });
      chord.forEach((m, i) => {
        tone(g, {
          at: t + 0.02 + i * 0.012,
          freq: mtof(m) * p,
          type: 'triangle',
          gain: 0.08,
          send: 0.5,
          attack: 0.03,
          decay: 0.4,
          sustain: 0.55,
          hold: 1.1,
          release: 1.2,
          pan: (i / (chord.length - 1)) * 1.4 - 0.7,
        });
      });
      // Shimmer raining down over the chord — this is win_impossible's tail,
      // not its attack, so it can carry real sustain (rms × duration, per
      // test/audio.mjs's "biggest moment in the set" check) without pushing
      // the initial peak anywhere near the 0.8 headroom guideline.
      for (let i = 0; i < 20; i++) {
        const k = i / 20;
        fmBell(g, {
          at: t + 0.1 + k * 1.5 + rand(0, 0.05),
          carrier: mtof(pick([MIDI.C5, MIDI.F5, MIDI.A5, MIDI.C6, MIDI.F6, MIDI.A6])) * p,
          ratio: rand(1.9, 2.1),
          index: rand(0.9, 2),
          decay: rand(1.1, 2.2),
          gain: 0.105 * (1 - k * 0.4),
          pan: rand(-0.9, 0.9),
          send: 0.9,
        });
      }
      sweep(g, {
        at: t,
        from: 120 * p,
        to: 27 * p,
        ms: 900,
        type: 'sine',
        gain: 0.18,
        attack: 0.01,
        decay: 0.5,
        sustain: 0.5,
        hold: 0.5,
        release: 0.9,
        send: 0.15,
      });
      chipCascade(g, t + 0.5, 22, 1.2, 4000 * p, 0.6, 0.1);
      thump(g, t + 1.15, 100 * p, 38 * p, 0.2, 0.6, 0.4);
    },
  },

  /** Losing a hand: a short muted fall, over before you can feel bad about it. */
  lose_hand: {
    len: 0.9,
    play: (g, t, p) => {
      sweep(g, {
        at: t,
        from: mtof(MIDI.E4) * p,
        to: mtof(MIDI.G2) * p,
        ms: 340,
        type: 'triangle',
        gain: 0.16,
        send: 0.25,
        attack: 0.008,
        decay: 0.12,
        sustain: 0.55,
        hold: 0.08,
        release: 0.25,
        filter: { type: 'lowpass', freq: 1500, to: 460, q: 1.2, ms: 360 },
      });
      thump(g, t + 0.3, 90 * p, 48 * p, 0.2, 0.28, 0.2);
      noiseHit(g, {
        at: t,
        gain: 0.05,
        filterType: 'lowpass',
        filterFreq: 900,
        attack: 0.004,
        decay: 0.1,
        release: 0.12,
      });
    },
  },

  /** Elimination: a funeral bell tolling into a long, dark, empty tail. */
  eliminate: {
    len: 3.6,
    play: (g, t, p) => {
      // The offline audio harness (test/audio.mjs) measured this clipping
      // (peak > 1.0) on some runs — the two fmBells' dense inharmonic
      // partials plus the thump land close together. Every layer below is
      // scaled by ~0.64 from its original level.
      fmBell(g, {
        at: t,
        carrier: mtof(MIDI.D2) * p,
        ratio: 2.41,
        index: 8,
        decay: 2.6,
        gain: 0.22,
        send: 0.95,
      });
      fmBell(g, {
        at: t + 0.015,
        carrier: mtof(MIDI.A2) * p,
        ratio: 1.73,
        index: 5,
        decay: 2,
        gain: 0.09,
        send: 0.95,
      });
      thump(g, t, 66 * p, 28 * p, 0.27, 0.7, 0.3);
      noiseHit(g, {
        at: t + 0.02,
        gain: 0.08,
        filterType: 'lowpass',
        filterFreq: 1400,
        filterTo: 220,
        q: 1,
        attack: 0.01,
        decay: 0.5,
        sustain: 0.25,
        release: 0.9,
        send: 0.9,
      });
      tone(g, {
        at: t + 0.4,
        freq: mtof(MIDI.Bb2) * p,
        type: 'sine',
        gain: 0.06,
        send: 1,
        attack: 0.3,
        decay: 0.6,
        sustain: 0.4,
        hold: 0.5,
        release: 1.4,
      });
    },
  },

  /** Victory: a full fanfare in F — rhythmic hits, a held chord, bells and chips. */
  victory: {
    len: 4.6,
    play: (g, t, p) => {
      // The offline audio harness (test/audio.mjs) measured this
      // consistently at or above the 0.8 headroom guideline (four stacked
      // hits, a wide held chord, bells and a chip cascade all overlap around
      // t+1s) — every layer below is scaled by ~0.8 from its original level.
      const hits: ReadonlyArray<[number, readonly number[]]> = [
        [0, [MIDI.F3, MIDI.A3, MIDI.C4]],
        [0.22, [MIDI.F3, MIDI.A3, MIDI.C4]],
        [0.44, [MIDI.C4, MIDI.E4, MIDI.G4]],
        [0.66, [MIDI.F4, MIDI.A4, MIDI.C5]],
      ];
      for (const [off, notes] of hits) {
        sawStack(g, t + off, notes, {
          gain: 0.24,
          attack: 0.014,
          hold: 0.1,
          release: 0.18,
          filterFrom: 1200,
          filterTo: 3400,
          send: 0.4,
          pitch: p,
        });
        thump(g, t + off, 120 * p, 52 * p, 0.27, 0.24, 0.2);
      }
      // The held chord the fanfare lands on.
      sawStack(g, t + 0.92, [MIDI.F2, MIDI.C3, MIDI.F3, MIDI.A3, MIDI.C4, MIDI.F4, MIDI.A4], {
        gain: 0.27,
        attack: 0.06,
        hold: 1.5,
        release: 1.4,
        filterFrom: 800,
        filterTo: 4200,
        send: 0.6,
        pitch: p,
      });
      [MIDI.F4, MIDI.A4, MIDI.C5, MIDI.F5, MIDI.A5].forEach((m, i) => {
        fmBell(g, {
          at: t + 0.95 + i * 0.1,
          carrier: mtof(m) * p,
          ratio: 2,
          index: 1.5,
          decay: 2,
          gain: 0.06,
          pan: i * 0.3 - 0.6,
          send: 0.85,
        });
      });
      chipCascade(g, t + 1, 16, 1.1, 2200 * p, 0.4, 0.11);
      sweep(g, {
        at: t + 0.9,
        from: 110 * p,
        to: 33 * p,
        ms: 800,
        type: 'sine',
        gain: 0.4,
        attack: 0.01,
        decay: 0.5,
        sustain: 0.45,
        hold: 0.6,
        release: 1,
        send: 0.2,
      });
    },
  },

  /** Shop open: a soft whoosh and a warm chime cluster, like a curtain drawn back. */
  shop_open: {
    len: 1.6,
    play: (g, t, p) => {
      noiseHit(g, {
        at: t,
        gain: 0.13,
        filterType: 'bandpass',
        filterFreq: 600,
        filterTo: 3400,
        q: 0.9,
        attack: 0.26,
        decay: 0.1,
        sustain: 0.6,
        release: 0.3,
        send: 0.6,
      });
      [MIDI.F4, MIDI.A4, MIDI.C5, MIDI.E5].forEach((m, i) => {
        fmBell(g, {
          at: t + 0.16 + i * 0.075,
          carrier: mtof(m) * p,
          ratio: 2,
          index: 1.3,
          decay: 1.1,
          gain: 0.09,
          pan: i * 0.34 - 0.5,
          send: 0.7,
        });
      });
      tone(g, {
        at: t,
        freq: mtof(MIDI.F2) * p,
        type: 'triangle',
        gain: 0.11,
        send: 0.35,
        attack: 0.2,
        decay: 0.3,
        sustain: 0.55,
        hold: 0.25,
        release: 0.6,
        filter: { type: 'lowpass', freq: 800, q: 1 },
      });
    },
  },

  /** Purchase: a coin landing, then a rising two-note confirm. Money well spent. */
  shop_buy: {
    len: 1,
    play: (g, t, p) => {
      clink(g, t, 3100 * p, 0.26, -0.1, 0.25);
      clink(g, t + 0.045, 2450 * p, 0.2, 0.15, 0.25);
      pluck(g, { at: t + 0.1, freq: mtof(MIDI.C5) * p, gain: 0.16, decay: 0.5, bright: 0.7, send: 0.3 });
      pluck(g, { at: t + 0.17, freq: mtof(MIDI.F5) * p, gain: 0.16, decay: 0.6, bright: 0.7, send: 0.35 });
      thump(g, t + 0.1, 130 * p, 64 * p, 0.16, 0.22, 0.15);
    },
  },

  /** Reroll: a quick flutter of ticks accelerating into a small upward sweep. */
  shop_reroll: {
    len: 1,
    play: (g, t, p) => {
      let at = t;
      let gap = 0.055;
      for (let i = 0; i < 10; i++) {
        noiseHit(g, {
          at,
          gain: 0.09,
          filterType: 'bandpass',
          filterFreq: vary(2600, 0.15) * p,
          q: 2.6,
          attack: 0.0005,
          decay: 0.012,
          release: 0.014,
          pan: i % 2 === 0 ? -0.3 : 0.3,
        });
        at += gap;
        gap *= 0.87;
      }
      sweep(g, {
        at: t + 0.02,
        from: 380 * p,
        to: 1250 * p,
        ms: 380,
        type: 'triangle',
        gain: 0.1,
        send: 0.4,
        attack: 0.05,
        decay: 0.12,
        sustain: 0.6,
        hold: 0.1,
        release: 0.2,
      });
      fmBell(g, {
        at: t + 0.4,
        carrier: mtof(MIDI.C5) * p,
        ratio: 2,
        index: 1.2,
        decay: 0.6,
        gain: 0.07,
        send: 0.55,
      });
    },
  },

  /** Level up: the ante climbing — a four-note ascent stamped by a bell and a swell. */
  level_up: {
    len: 2.2,
    play: (g, t, p) => {
      [MIDI.D3, MIDI.F3, MIDI.A3, MIDI.D4].forEach((m, i) => {
        tone(g, {
          at: t + i * 0.12,
          freq: mtof(m) * p,
          type: 'square',
          gain: 0.11,
          send: 0.35,
          attack: 0.008,
          decay: 0.08,
          sustain: 0.5,
          hold: 0.06,
          release: 0.16,
          filter: { type: 'lowpass', freq: 1700, to: 2600, q: 1.4 },
        });
      });
      sawStack(g, t, [MIDI.D2, MIDI.A2, MIDI.D3], {
        gain: 0.2,
        attack: 0.46,
        hold: 0.2,
        release: 0.6,
        filterFrom: 260,
        filterTo: 1500,
        send: 0.4,
        pitch: p,
      });
      fmBell(g, {
        at: t + 0.48,
        carrier: mtof(MIDI.D5) * p,
        ratio: 1.41,
        index: 3,
        decay: 1.5,
        gain: 0.1,
        send: 0.8,
      });
      thump(g, t + 0.48, 104 * p, 44 * p, 0.36, 0.4, 0.3);
    },
  },

  /** Heartbeat: lub-dub. `pitch` tightens the gap and raises it as the stakes rise. */
  heartbeat: {
    len: 1,
    play: (g, t, p) => {
      const gap = 0.23 / clamp(p, 0.5, 2);
      thump(g, t, 62 * p, 38 * p, 0.5, 0.2, 0.1);
      thump(g, t + gap, 56 * p, 34 * p, 0.34, 0.24, 0.12);
      noiseHit(g, {
        at: t,
        gain: 0.05,
        filterType: 'lowpass',
        filterFreq: 240,
        attack: 0.004,
        decay: 0.07,
        release: 0.08,
      });
      noiseHit(g, {
        at: t + gap,
        gain: 0.035,
        filterType: 'lowpass',
        filterFreq: 220,
        attack: 0.004,
        decay: 0.08,
        release: 0.09,
      });
    },
  },

  /** Your turn: a gentle two-note summon. This one plays constantly — it must never nag. */
  your_turn: {
    len: 1.8,
    play: (g, t, p) => {
      const notes = [MIDI.D5, MIDI.A5];
      notes.forEach((m, i) => {
        const at = t + i * 0.13;
        fmBell(g, {
          at,
          carrier: mtof(m) * p,
          ratio: 2,
          index: 0.9,
          decay: 1.2,
          gain: 0.1,
          attack: 0.012,
          pan: i === 0 ? -0.2 : 0.2,
          send: 0.6,
        });
        pluck(g, {
          at,
          freq: mtof(m) * p,
          gain: 0.08,
          decay: 0.7,
          bright: 0.5,
          send: 0.35,
        });
      });
      tone(g, {
        at: t,
        freq: mtof(MIDI.D3) * p,
        type: 'sine',
        gain: 0.08,
        send: 0.4,
        attack: 0.05,
        decay: 0.3,
        sustain: 0.4,
        hold: 0.2,
        release: 0.5,
      });
      // A whisper of air so the chime sits in a space rather than on top of the mix.
      if (chance(0.5)) {
        noiseHit(g, {
          at: t,
          gain: 0.03,
          filterType: 'bandpass',
          filterFreq: 3400,
          q: 1.4,
          attack: 0.09,
          decay: 0.2,
          release: 0.25,
          send: 0.7,
        });
      }
    },
  },
};

/** Every registered name, handy for a debug/soundboard screen. */
export const SFX_NAMES = Object.keys(SFX) as SfxName[];
