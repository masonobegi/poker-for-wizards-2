/**
 * HEXHOLD — synthesis primitives.
 *
 * Every noise this game makes is built here out of oscillators, white noise
 * and filters. There are no audio assets in the project at all, which is the
 * point: the deck breaks physics, so the sound design should too.
 *
 * Each helper builds a short-lived node graph, schedules a complete envelope
 * on it up front, then tears itself down from the source node's `ended` event
 * so a four-hour session does not accumulate a single orphaned node.
 */

// ---------------------------------------------------------------------------
// The bus a voice plugs into
// ---------------------------------------------------------------------------

/**
 * The three connection points a voice needs: the context it lives in, the dry
 * bus it should sum into, and the input of the shared convolution reverb.
 */
export interface VoiceGraph {
  readonly ctx: AudioContext;
  /** Dry destination — an sfx/music bus, or a per-play gain/panner. */
  readonly dest: AudioNode;
  /** Input of the shared reverb. Voices connect through their own send gain. */
  readonly reverb: AudioNode;
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

/** Uniform random float in [min, max). */
export const rand = (min: number, max: number): number => min + Math.random() * (max - min);

/** Uniform random integer in [min, max] inclusive. */
export const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1));

export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/** Nudge a value by up to ±pct (0..1) so repeated sounds never machine-gun. */
export const vary = (value: number, pct: number): number => value * (1 + rand(-pct, pct));

/** Coin flip with the given probability of true. */
export const chance = (p: number): boolean => Math.random() < p;

/** MIDI note number to frequency in Hz. */
export const mtof = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * Every mood and motif in HEXHOLD lives in D minor / F major so that a
 * crossfade between two beds can never land on a clash.
 */
export const MIDI = {
  D1: 26,
  F1: 29,
  A1: 33,
  D2: 38,
  E2: 40,
  F2: 41,
  G2: 43,
  A2: 45,
  Bb2: 46,
  C3: 48,
  D3: 50,
  E3: 52,
  F3: 53,
  G3: 55,
  A3: 57,
  Bb3: 58,
  C4: 60,
  D4: 62,
  E4: 64,
  F4: 65,
  G4: 67,
  A4: 69,
  Bb4: 70,
  C5: 72,
  D5: 74,
  E5: 76,
  F5: 77,
  G5: 79,
  A5: 81,
  C6: 84,
  D6: 86,
  F6: 89,
  A6: 93,
} as const;

/** D natural minor, two octaves from D3 — the melodic vocabulary of the game. */
export const D_MINOR = [
  MIDI.D3,
  MIDI.E3,
  MIDI.F3,
  MIDI.G3,
  MIDI.A3,
  MIDI.Bb3,
  MIDI.C4,
  MIDI.D4,
  MIDI.E4,
  MIDI.F4,
  MIDI.G4,
  MIDI.A4,
  MIDI.Bb4,
  MIDI.C5,
  MIDI.D5,
] as const;

/** The safest notes to sprinkle at random: D minor pentatonic. */
export const D_PENT = [MIDI.D4, MIDI.F4, MIDI.G4, MIDI.A4, MIDI.C5, MIDI.D5] as const;

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

/** A full ADSR plus an explicit hold, in seconds. */
export interface Env {
  attack?: number;
  decay?: number;
  /** Level held after the decay, as a fraction of peak (0..1). */
  sustain?: number;
  /** How long the sustain level is held before the release. */
  hold?: number;
  release?: number;
}

/** Floor for exponential ramps — ramping exponentially to a true 0 is illegal. */
const SILENCE = 0.0001;

/**
 * Schedule a complete ADSR on a gain param and return the time it finishes.
 * Attack is linear (so it can start from silence), everything after it is
 * exponential, which is what makes a decay sound natural rather than digital.
 */
export function adsr(param: AudioParam, t0: number, peak: number, e: Env = {}): number {
  const a = Math.max(e.attack ?? 0.004, 0.0004);
  const d = Math.max(e.decay ?? 0.1, 0.001);
  const s = clamp(e.sustain ?? 0, 0, 1);
  const h = Math.max(e.hold ?? 0, 0);
  const r = Math.max(e.release ?? 0.06, 0.001);
  const pk = Math.max(peak, SILENCE * 2);
  const sustainLevel = Math.max(pk * s, SILENCE);

  param.cancelScheduledValues(t0);
  param.setValueAtTime(SILENCE, t0);
  param.linearRampToValueAtTime(pk, t0 + a);
  param.exponentialRampToValueAtTime(sustainLevel, t0 + a + d);
  if (h > 0) param.setValueAtTime(sustainLevel, t0 + a + d + h);
  param.exponentialRampToValueAtTime(SILENCE, t0 + a + d + h + r);
  return t0 + a + d + h + r;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Stop every source at `stopAt` and disconnect the whole graph once the last
 * one reports `ended`. This is the only teardown path in the engine.
 */
export function finish(
  srcs: readonly AudioScheduledSourceNode[],
  nodes: readonly AudioNode[],
  stopAt: number,
): void {
  if (srcs.length === 0) {
    for (const n of nodes) n.disconnect();
    return;
  }
  let pending = srcs.length;
  for (const s of srcs) {
    try {
      s.stop(stopAt);
    } catch {
      /* already stopped — nothing to do */
    }
    s.onended = () => {
      s.disconnect();
      pending -= 1;
      if (pending === 0) for (const n of nodes) n.disconnect();
    };
  }
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

const noiseCache = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

/** Cached mono white noise. One buffer per (context, rounded length). */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const key = Math.round(clamp(seconds, 0.05, 6) * 10) / 10;
  let perCtx = noiseCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    noiseCache.set(ctx, perCtx);
  }
  const hit = perCtx.get(key);
  if (hit) return hit;

  const len = Math.max(1, Math.floor(key * ctx.sampleRate));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  perCtx.set(key, buf);
  return buf;
}

/** A noise source ready to start, seeded at a random offset for variety. */
export function noiseSource(ctx: AudioContext, seconds = 2): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds);
  return src;
}

/** Filter options shared by most voices, including an optional cutoff sweep. */
export interface FilterOpts {
  type?: BiquadFilterType;
  freq: number;
  q?: number;
  /** Sweep the cutoff to this frequency... */
  to?: number;
  /** ...over this many milliseconds (defaults to the envelope length). */
  ms?: number;
}

function makeFilter(
  ctx: AudioContext,
  o: FilterOpts,
  t0: number,
  end: number,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'lowpass';
  f.frequency.setValueAtTime(clamp(o.freq, 20, 20000), t0);
  f.Q.setValueAtTime(o.q ?? 1, t0);
  if (o.to !== undefined) {
    const span = o.ms !== undefined ? o.ms / 1000 : Math.max(end - t0, 0.02);
    f.frequency.exponentialRampToValueAtTime(clamp(o.to, 20, 20000), t0 + span);
  }
  return f;
}

/** Soft-clipping curve for anything that needs to sound damaged. */
function shaperNode(ctx: AudioContext, amount: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  const k = clamp(amount, 0, 1) * 80;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

/**
 * Terminate a voice chain: optional panning, the dry connection, and an
 * optional reverb send tapped off the same point.
 */
function route(
  g: VoiceGraph,
  tail: AudioNode,
  pan: number | undefined,
  send: number | undefined,
  nodes: AudioNode[],
): void {
  let last = tail;
  if (pan !== undefined && pan !== 0) {
    const p = g.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    last.connect(p);
    nodes.push(p);
    last = p;
  }
  last.connect(g.dest);
  if (send !== undefined && send > 0) {
    const s = g.ctx.createGain();
    s.gain.value = send;
    last.connect(s);
    s.connect(g.reverb);
    nodes.push(s);
  }
}

/** Attach a modulation oscillator to a param. Returns the oscillator. */
function modulate(
  ctx: AudioContext,
  target: AudioParam,
  rate: number,
  depth: number,
  type: OscillatorType,
  t0: number,
  srcs: AudioScheduledSourceNode[],
  nodes: AudioNode[],
): void {
  const lfo = ctx.createOscillator();
  lfo.type = type;
  lfo.frequency.setValueAtTime(rate, t0);
  const amt = ctx.createGain();
  amt.gain.setValueAtTime(depth, t0);
  lfo.connect(amt);
  amt.connect(target);
  lfo.start(t0);
  srcs.push(lfo);
  nodes.push(amt);
}

// ---------------------------------------------------------------------------
// tone — the workhorse oscillator voice
// ---------------------------------------------------------------------------

export interface ToneOpts extends Env {
  freq: number;
  type?: OscillatorType;
  gain?: number;
  /** Detune in cents. */
  detune?: number;
  pan?: number;
  /** Reverb send, 0..1. */
  send?: number;
  /** Absolute start time; defaults to now. */
  at?: number;
  /** Glide the pitch to this frequency. */
  to?: number;
  /** Glide duration in seconds; defaults to the whole envelope. */
  glide?: number;
  glideType?: 'exp' | 'lin';
  filter?: FilterOpts;
  vibrato?: { rate: number; depth: number };
  tremolo?: { rate: number; depth: number };
  /** Soft-clip drive, 0..1. */
  shape?: number;
}

/** A single oscillator with a full envelope, optional glide, filter and LFOs. */
export function tone(g: VoiceGraph, o: ToneOpts): number {
  const { ctx } = g;
  const t0 = o.at ?? ctx.currentTime;
  const nodes: AudioNode[] = [];
  const srcs: AudioScheduledSourceNode[] = [];

  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(Math.max(o.freq, 0.01), t0);
  if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
  srcs.push(osc);

  const amp = ctx.createGain();
  const end = adsr(amp.gain, t0, o.gain ?? 0.2, o);

  if (o.to !== undefined) {
    const at = t0 + (o.glide ?? Math.max(end - t0, 0.02));
    if ((o.glideType ?? 'exp') === 'lin') {
      osc.frequency.linearRampToValueAtTime(Math.max(o.to, 0.01), at);
    } else {
      osc.frequency.exponentialRampToValueAtTime(Math.max(o.to, 0.01), at);
    }
  }

  let head: AudioNode = osc;
  if (o.shape !== undefined && o.shape > 0) {
    const ws = shaperNode(ctx, o.shape);
    head.connect(ws);
    nodes.push(ws);
    head = ws;
  }
  if (o.filter) {
    const f = makeFilter(ctx, o.filter, t0, end);
    head.connect(f);
    nodes.push(f);
    head = f;
  }
  head.connect(amp);
  nodes.push(amp);
  let tail: AudioNode = amp;

  if (o.vibrato) {
    modulate(ctx, osc.detune, o.vibrato.rate, o.vibrato.depth, 'sine', t0, srcs, nodes);
  }
  if (o.tremolo) {
    const depth = clamp(o.tremolo.depth, 0, 1);
    const trem = ctx.createGain();
    trem.gain.setValueAtTime(1 - depth, t0);
    modulate(ctx, trem.gain, o.tremolo.rate, depth, 'sine', t0, srcs, nodes);
    amp.connect(trem);
    nodes.push(trem);
    tail = trem;
  }

  route(g, tail, o.pan, o.send, nodes);
  osc.start(t0);
  finish(srcs, nodes, end + 0.03);
  return end;
}

// ---------------------------------------------------------------------------
// noiseHit — transients, air, scratches, splashes
// ---------------------------------------------------------------------------

export interface NoiseOpts extends Env {
  gain?: number;
  pan?: number;
  send?: number;
  at?: number;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  /** Sweep the cutoff here over the envelope. */
  filterTo?: number;
  q?: number;
  /** Second-stage highpass, useful for keeping rumble out of a bright hit. */
  hp?: number;
  /** Amplitude modulation, for scratches and flutter. */
  tremolo?: { rate: number; depth: number };
  playbackRate?: number;
}

/** A burst of filtered white noise — the basis of every percussive layer. */
export function noiseHit(g: VoiceGraph, o: NoiseOpts): number {
  const { ctx } = g;
  const t0 = o.at ?? ctx.currentTime;
  const nodes: AudioNode[] = [];
  const srcs: AudioScheduledSourceNode[] = [];

  const amp = ctx.createGain();
  const end = adsr(amp.gain, t0, o.gain ?? 0.2, o);
  const need = Math.max(end - t0 + 0.1, 0.4);

  const src = noiseSource(ctx, Math.min(need * 1.5, 3));
  if (o.playbackRate !== undefined) src.playbackRate.setValueAtTime(o.playbackRate, t0);
  srcs.push(src);

  const filt = makeFilter(
    ctx,
    {
      type: o.filterType ?? 'bandpass',
      freq: o.filterFreq ?? 2000,
      q: o.q ?? 1,
      to: o.filterTo,
    },
    t0,
    end,
  );
  src.connect(filt);
  nodes.push(filt);
  let head: AudioNode = filt;

  if (o.hp !== undefined) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(clamp(o.hp, 20, 20000), t0);
    head.connect(hp);
    nodes.push(hp);
    head = hp;
  }

  head.connect(amp);
  nodes.push(amp);
  let tail: AudioNode = amp;

  if (o.tremolo) {
    const depth = clamp(o.tremolo.depth, 0, 1);
    const trem = ctx.createGain();
    trem.gain.setValueAtTime(1 - depth, t0);
    modulate(ctx, trem.gain, o.tremolo.rate, depth, 'sine', t0, srcs, nodes);
    amp.connect(trem);
    nodes.push(trem);
    tail = trem;
  }

  route(g, tail, o.pan, o.send, nodes);
  const buffered = src.buffer ? src.buffer.duration : 1;
  src.start(t0, Math.random() * Math.max(buffered - need, 0.001));
  finish(srcs, nodes, end + 0.03);
  return end;
}

// ---------------------------------------------------------------------------
// sweep — anything that moves in pitch
// ---------------------------------------------------------------------------

export interface SweepOpts extends Env {
  from: number;
  to: number;
  /** Sweep duration in milliseconds. */
  ms: number;
  type?: OscillatorType;
  gain?: number;
  pan?: number;
  send?: number;
  at?: number;
  curve?: 'exp' | 'lin';
  filter?: FilterOpts;
  vibrato?: { rate: number; depth: number };
  shape?: number;
}

/** A pitch glide — risers, tape stops, sub drops, deflating fizzles. */
export function sweep(g: VoiceGraph, o: SweepOpts): number {
  const secs = o.ms / 1000;
  return tone(g, {
    freq: o.from,
    to: o.to,
    glide: secs,
    glideType: o.curve ?? 'exp',
    type: o.type ?? 'sine',
    gain: o.gain,
    pan: o.pan,
    send: o.send,
    at: o.at,
    filter: o.filter,
    vibrato: o.vibrato,
    shape: o.shape,
    attack: o.attack ?? 0.008,
    decay: o.decay ?? secs * 0.5,
    sustain: o.sustain ?? 0.7,
    hold: o.hold ?? secs * 0.35,
    release: o.release ?? secs * 0.35,
  });
}

// ---------------------------------------------------------------------------
// pluck — Karplus-Strong
// ---------------------------------------------------------------------------

export interface PluckOpts {
  freq: number;
  /** Seconds of ring. */
  decay?: number;
  gain?: number;
  pan?: number;
  send?: number;
  at?: number;
  /** 0 = dark and felt-muted, 1 = bright nylon string. */
  bright?: number;
}

const ksCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
const KS_BASE_SECONDS = 1.4;
const KS_CACHE_MAX = 28;

/**
 * Classic Karplus-Strong rendered straight into a buffer: a noise burst fed
 * through a one-period delay line with a lowpass in the feedback path. Doing
 * it in the buffer domain sidesteps the 128-sample floor a DelayNode feedback
 * loop imposes, which would otherwise cap plucks at about 375 Hz.
 */
function ksBuffer(ctx: BaseAudioContext, freq: number, bright: number): AudioBuffer {
  const semitone = Math.round(12 * Math.log2(freq / 440) + 69);
  const key = `${semitone}:${Math.round(bright * 10)}`;
  let perCtx = ksCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    ksCache.set(ctx, perCtx);
  }
  const hit = perCtx.get(key);
  if (hit) return hit;
  if (perCtx.size >= KS_CACHE_MAX) {
    const oldest = perCtx.keys().next();
    if (!oldest.done) perCtx.delete(oldest.value);
  }

  const sr = ctx.sampleRate;
  const base = mtof(semitone);
  const period = Math.max(2, Math.round(sr / base));
  const len = Math.floor(KS_BASE_SECONDS * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);

  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;

  // Lower damping for high notes so short strings still ring audibly.
  const damp = 0.9965 - (1 - clamp(bright, 0, 1)) * 0.012;
  const tilt = 0.35 + clamp(bright, 0, 1) * 0.5;
  let lp = 0;
  let idx = 0;
  const fadeFrom = len - Math.floor(sr * 0.05);
  for (let i = 0; i < len; i++) {
    const cur = ring[idx];
    const next = ring[(idx + 1) % period];
    const avg = 0.5 * (cur + next) * damp;
    lp += tilt * (avg - lp);
    ring[idx] = lp;
    idx = (idx + 1) % period;
    const fade = i > fadeFrom ? (len - i) / (len - fadeFrom) : 1;
    out[i] = cur * fade;
  }

  perCtx.set(key, buf);
  return buf;
}

/** A struck string: harps, muted table plucks, arpeggios. */
export function pluck(g: VoiceGraph, o: PluckOpts): number {
  const { ctx } = g;
  const t0 = o.at ?? ctx.currentTime;
  const bright = o.bright ?? 0.6;
  const buf = ksBuffer(ctx, o.freq, bright);
  const nodes: AudioNode[] = [];

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const semitone = Math.round(12 * Math.log2(o.freq / 440) + 69);
  src.playbackRate.setValueAtTime(o.freq / mtof(semitone), t0);

  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.setValueAtTime(clamp(o.freq * (4 + bright * 12), 300, 15000), t0);
  body.Q.setValueAtTime(0.7, t0);

  const amp = ctx.createGain();
  const decay = o.decay ?? 0.9;
  const end = adsr(amp.gain, t0, o.gain ?? 0.25, {
    attack: 0.002,
    decay: decay * 0.55,
    sustain: 0.22,
    hold: 0,
    release: decay * 0.45,
  });

  src.connect(body);
  body.connect(amp);
  nodes.push(body, amp);
  route(g, amp, o.pan, o.send, nodes);
  src.start(t0);
  finish([src], nodes, end + 0.03);
  return end;
}

// ---------------------------------------------------------------------------
// fmBell — chimes, clinks, tolls
// ---------------------------------------------------------------------------

export interface BellOpts {
  carrier: number;
  /** Inharmonic ratios (1.41, 2.76, 3.5) read as metal; integers read as tonal. */
  ratio?: number;
  /** Modulation index — how clangorous the strike is. */
  index?: number;
  decay?: number;
  gain?: number;
  pan?: number;
  send?: number;
  at?: number;
  attack?: number;
}

/** Two-operator FM bell: the modulator dies fast, leaving a pure ringing tail. */
export function fmBell(g: VoiceGraph, o: BellOpts): number {
  const { ctx } = g;
  const t0 = o.at ?? ctx.currentTime;
  const ratio = o.ratio ?? 1.41;
  const index = o.index ?? 5;
  const decay = o.decay ?? 1;
  const nodes: AudioNode[] = [];
  const srcs: AudioScheduledSourceNode[] = [];

  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.setValueAtTime(Math.max(o.carrier, 1), t0);

  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(Math.max(o.carrier * ratio, 1), t0);

  const modAmt = ctx.createGain();
  const peakDev = o.carrier * ratio * index;
  modAmt.gain.setValueAtTime(Math.max(peakDev, 1), t0);
  modAmt.gain.exponentialRampToValueAtTime(Math.max(peakDev * 0.01, 1), t0 + decay * 0.35);
  mod.connect(modAmt);
  modAmt.connect(carrier.frequency);

  const amp = ctx.createGain();
  const end = adsr(amp.gain, t0, o.gain ?? 0.18, {
    attack: o.attack ?? 0.002,
    decay: decay * 0.5,
    sustain: 0.28,
    hold: 0,
    release: decay * 0.5,
  });

  carrier.connect(amp);
  nodes.push(modAmt, amp);
  srcs.push(carrier, mod);
  route(g, amp, o.pan, o.send, nodes);
  carrier.start(t0);
  mod.start(t0);
  finish(srcs, nodes, end + 0.03);
  return end;
}
