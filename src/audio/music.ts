/**
 * HEXHOLD — generative music beds.
 *
 * There is no audio bed to loop; every mood is built live from oscillators
 * and filtered noise and kept running for as long as that mood is active.
 * A mood is a "layer": a handful of long-lived nodes (drones, sub pulses,
 * LFOs) that start when the mood begins and are explicitly `.stop()`-ed and
 * disconnected when it ends, plus a `tick()` function the scheduler calls
 * to sprinkle in one-shot musical events (a bell, a pluck, a tick) using the
 * same self-disposing voice helpers `sfx.ts` is built from.
 *
 * Timing uses a lookahead scheduler: a `setInterval` wakes up every 25ms and
 * schedules anything due in the next 100ms against `ctx.currentTime`, which
 * is the audio clock. Nothing here is ever timed by `setTimeout` alone —
 * `setTimeout` is only used for node cleanup well after the sound involved
 * has already finished.
 *
 * Every mood lives in D minor / F major (the same key voices.ts's `MIDI`
 * table is built around), so a crossfade from any mood to any other always
 * lands on notes that belong together.
 */

import {
  MIDI,
  D_PENT,
  chance,
  fmBell,
  mtof,
  noiseBuffer,
  noiseHit,
  pick,
  pluck,
  rand,
  sweep,
  tone,
  type VoiceGraph,
} from './voices';
import type { Mood } from './engine';

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/** Identical to `VoiceGraph` — named separately because it addresses the
 * whole music subsystem rather than a single one-shot sound. */
export type MusicGraph = VoiceGraph;

export interface MusicController {
  setMood(mood: Mood, crossfadeSec?: number): void;
  /** Fades to silence over `fadeSec` (default: the normal crossfade time). */
  stop(fadeSec?: number): void;
}

// ---------------------------------------------------------------------------
// Scheduler / crossfade constants
// ---------------------------------------------------------------------------

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_SEC = 0.1;
const DEFAULT_CROSSFADE = 2.2;
const MIN_CROSSFADE = 0.05;
const SILENCE = 0.0001;

/** Overall loudness per mood, applied on top of each layer's own balance. */
const MOOD_LEVEL: Record<Mood, number> = {
  none: 0,
  menu: 0.55,
  table: 0.38,
  tension: 0.55,
  shop: 0.5,
  showdown: 0.62,
};

// ---------------------------------------------------------------------------
// Layer — one mood's set of long-lived nodes plus its event scheduler
// ---------------------------------------------------------------------------

interface Layer {
  readonly out: GainNode;
  /** Schedule any one-shot events due before `windowEnd` (an absolute ctx time). */
  tick(windowEnd: number): void;
  /** Begin winding down at time `t`; fully torn down `release` seconds later. */
  stop(t: number, release: number): void;
}

function scheduleDisconnect(nodes: readonly AudioNode[], delaySec: number): void {
  const ms = Math.max(0, delaySec) * 1000;
  setTimeout(() => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }, ms);
}

/** Shared teardown for every drone-style layer: stop held sources at
 * `t + release`, then disconnect everything shortly after. */
function makeStopper(
  sources: readonly AudioScheduledSourceNode[],
  nodes: readonly AudioNode[],
): (t: number, release: number) => void {
  return (t: number, release: number): void => {
    const stopAt = t + release + 0.05;
    for (const s of sources) {
      try {
        s.stop(stopAt);
      } catch {
        /* already stopped, or its stop time already passed */
      }
    }
    scheduleDisconnect([...nodes, ...sources], release + 0.3);
  };
}

// ---------------------------------------------------------------------------
// menu — slow dark ambient
// ---------------------------------------------------------------------------

function buildMenuLayer(g: MusicGraph, t0: number): Layer {
  const { ctx } = g;
  const out = ctx.createGain();
  out.gain.setValueAtTime(SILENCE, t0);
  out.connect(g.dest);

  const nodes: AudioNode[] = [out];
  const sources: AudioScheduledSourceNode[] = [];

  // Sustained minor drone: 3-4 detuned saws through one lowpass filter.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.setValueAtTime(0.9, t0);
  filter.frequency.setValueAtTime(650, t0);
  filter.connect(out);
  nodes.push(filter);

  const droneGain = ctx.createGain();
  droneGain.gain.setValueAtTime(0.5, t0);
  droneGain.connect(filter);
  nodes.push(droneGain);

  const chord = [MIDI.D2, MIDI.F2, MIDI.A2, MIDI.D3];
  chord.forEach((m, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(mtof(m), t0);
    osc.detune.setValueAtTime((i % 2 === 0 ? -1 : 1) * (6 + i * 2), t0);
    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0.22, t0);
    osc.connect(voice);
    voice.connect(droneGain);
    osc.start(t0);
    sources.push(osc);
    nodes.push(voice);
  });

  // Slow LFO breathing the filter cutoff.
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.045, t0);
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.setValueAtTime(340, t0);
  lfo.connect(lfoAmt);
  lfoAmt.connect(filter.frequency);
  lfo.start(t0);
  sources.push(lfo);
  nodes.push(lfoAmt);

  // Heavy reverb send on the drone.
  const send = ctx.createGain();
  send.gain.setValueAtTime(0.42, t0);
  droneGain.connect(send);
  send.connect(g.reverb);
  nodes.push(send);

  // Sparse bell motif, every 8-12s, heavily reverberant.
  let nextBell = t0 + rand(2, 5);
  const voiceGraph: VoiceGraph = { ctx, dest: out, reverb: g.reverb };
  function tick(windowEnd: number): void {
    while (nextBell < windowEnd) {
      const note = pick(D_PENT) + (chance(0.3) ? 12 : 0);
      fmBell(voiceGraph, {
        at: nextBell,
        carrier: mtof(note),
        ratio: pick([1.41, 2, 2.76]),
        index: rand(1, 2.4),
        decay: rand(1.6, 2.6),
        gain: rand(0.05, 0.09),
        pan: rand(-0.5, 0.5),
        send: 0.8,
      });
      nextBell += rand(8, 12);
    }
  }

  return { out, tick, stop: makeStopper(sources, nodes) };
}

// ---------------------------------------------------------------------------
// table — understated, tolerable for an hour
// ---------------------------------------------------------------------------

function buildTableLayer(g: MusicGraph, t0: number): Layer {
  const { ctx } = g;
  const out = ctx.createGain();
  out.gain.setValueAtTime(SILENCE, t0);
  out.connect(g.dest);

  const nodes: AudioNode[] = [out];
  const sources: AudioScheduledSourceNode[] = [];

  // Soft pulsing sub at ~72 BPM.
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(mtof(MIDI.D1), t0);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.14, t0);
  sub.connect(subGain);
  subGain.connect(out);
  sub.start(t0);
  sources.push(sub);
  nodes.push(subGain);

  const pulseLfo = ctx.createOscillator();
  pulseLfo.type = 'sine';
  pulseLfo.frequency.setValueAtTime(72 / 60, t0);
  const pulseAmt = ctx.createGain();
  pulseAmt.gain.setValueAtTime(0.09, t0);
  pulseLfo.connect(pulseAmt);
  pulseAmt.connect(subGain.gain);
  pulseLfo.start(t0);
  sources.push(pulseLfo);
  nodes.push(pulseAmt);

  const send = ctx.createGain();
  send.gain.setValueAtTime(0.15, t0);
  subGain.connect(send);
  send.connect(g.reverb);
  nodes.push(send);

  // Occasional muted pluck, sparse and low.
  let nextPluck = t0 + rand(4, 8);
  const voiceGraph: VoiceGraph = { ctx, dest: out, reverb: g.reverb };
  function tick(windowEnd: number): void {
    while (nextPluck < windowEnd) {
      pluck(voiceGraph, {
        at: nextPluck,
        freq: mtof(pick(D_PENT)) / 2,
        gain: rand(0.03, 0.06),
        decay: rand(1.2, 2),
        bright: rand(0.1, 0.25),
        pan: rand(-0.4, 0.4),
        send: 0.5,
      });
      nextPluck += rand(6, 14);
    }
  }

  return { out, tick, stop: makeStopper(sources, nodes) };
}

// ---------------------------------------------------------------------------
// tension — table's pulse plus a riser, a fast tick and a dissonant interval
// ---------------------------------------------------------------------------

function buildTensionLayer(g: MusicGraph, t0: number): Layer {
  const { ctx } = g;
  const out = ctx.createGain();
  out.gain.setValueAtTime(SILENCE, t0);
  out.connect(g.dest);

  const nodes: AudioNode[] = [out];
  const sources: AudioScheduledSourceNode[] = [];

  // Base sub pulse, same idea as `table`, a touch more present.
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(mtof(MIDI.D1), t0);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.16, t0);
  sub.connect(subGain);
  subGain.connect(out);
  sub.start(t0);
  sources.push(sub);
  nodes.push(subGain);

  const pulseLfo = ctx.createOscillator();
  pulseLfo.type = 'sine';
  pulseLfo.frequency.setValueAtTime(72 / 60, t0);
  const pulseAmt = ctx.createGain();
  pulseAmt.gain.setValueAtTime(0.1, t0);
  pulseLfo.connect(pulseAmt);
  pulseAmt.connect(subGain.gain);
  pulseLfo.start(t0);
  sources.push(pulseLfo);
  nodes.push(pulseAmt);

  // Dissonant held interval: D against the tritone above it, close-detuned
  // so the pair beats against itself.
  const root = ctx.createOscillator();
  root.type = 'triangle';
  root.frequency.setValueAtTime(mtof(MIDI.D3), t0);
  const rootGain = ctx.createGain();
  rootGain.gain.setValueAtTime(0.05, t0);
  root.connect(rootGain);
  rootGain.connect(out);
  root.start(t0);
  sources.push(root);
  nodes.push(rootGain);

  const tritone = ctx.createOscillator();
  tritone.type = 'triangle';
  tritone.frequency.setValueAtTime(mtof(MIDI.D3) * Math.SQRT2, t0);
  tritone.detune.setValueAtTime(-9, t0);
  const tritoneGain = ctx.createGain();
  tritoneGain.gain.setValueAtTime(0.045, t0);
  tritone.connect(tritoneGain);
  tritoneGain.connect(out);
  tritone.start(t0);
  sources.push(tritone);
  nodes.push(tritoneGain);

  const dissonanceSend = ctx.createGain();
  dissonanceSend.gain.setValueAtTime(0.35, t0);
  rootGain.connect(dissonanceSend);
  tritoneGain.connect(dissonanceSend);
  dissonanceSend.connect(g.reverb);
  nodes.push(dissonanceSend);

  // Rising filtered-noise riser: a looped noise bed whose bandpass cutoff
  // slowly climbs and falls (~7s per cycle) rather than a discrete one-shot.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 2);
  noise.loop = true;
  const riserFilter = ctx.createBiquadFilter();
  riserFilter.type = 'bandpass';
  riserFilter.Q.setValueAtTime(1.1, t0);
  riserFilter.frequency.setValueAtTime(900, t0);
  const riserGain = ctx.createGain();
  riserGain.gain.setValueAtTime(0.06, t0);
  noise.connect(riserFilter);
  riserFilter.connect(riserGain);
  riserGain.connect(out);
  const riserLfo = ctx.createOscillator();
  riserLfo.type = 'sine';
  riserLfo.frequency.setValueAtTime(1 / 7, t0);
  const riserLfoAmt = ctx.createGain();
  riserLfoAmt.gain.setValueAtTime(700, t0);
  riserLfo.connect(riserLfoAmt);
  riserLfoAmt.connect(riserFilter.frequency);
  noise.start(t0);
  riserLfo.start(t0);
  sources.push(noise, riserLfo);
  nodes.push(riserFilter, riserGain, riserLfoAmt);

  const riserSend = ctx.createGain();
  riserSend.gain.setValueAtTime(0.3, t0);
  riserGain.connect(riserSend);
  riserSend.connect(g.reverb);
  nodes.push(riserSend);

  // Ticking pulse at double time (144 BPM eighth notes).
  let nextTick = t0;
  const tickPeriod = 60 / (72 * 2);
  const voiceGraph: VoiceGraph = { ctx, dest: out, reverb: g.reverb };
  function tick(windowEnd: number): void {
    while (nextTick < windowEnd) {
      noiseHit(voiceGraph, {
        at: nextTick,
        gain: 0.05,
        filterType: 'bandpass',
        filterFreq: 2400,
        q: 3,
        attack: 0.0005,
        decay: 0.01,
        release: 0.012,
        pan: chance(0.5) ? -0.2 : 0.2,
        send: 0.2,
      });
      nextTick += tickPeriod;
    }
  }

  return { out, tick, stop: makeStopper(sources, nodes) };
}

// ---------------------------------------------------------------------------
// shop — warm, light, gentle shuffle
// ---------------------------------------------------------------------------

function buildShopLayer(g: MusicGraph, t0: number): Layer {
  const { ctx } = g;
  const out = ctx.createGain();
  out.gain.setValueAtTime(SILENCE, t0);
  out.connect(g.dest);

  const nodes: AudioNode[] = [out];
  const sources: AudioScheduledSourceNode[] = [];

  // Warm sustained pad in F major.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, t0);
  filter.Q.setValueAtTime(0.7, t0);
  filter.connect(out);
  nodes.push(filter);

  const padGain = ctx.createGain();
  padGain.gain.setValueAtTime(0.3, t0);
  padGain.connect(filter);
  nodes.push(padGain);

  [MIDI.F2, MIDI.C3, MIDI.A3].forEach((m, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(mtof(m), t0);
    osc.detune.setValueAtTime((i - 1) * 5, t0);
    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0.18, t0);
    osc.connect(voice);
    voice.connect(padGain);
    osc.start(t0);
    sources.push(osc);
    nodes.push(voice);
  });

  const send = ctx.createGain();
  send.gain.setValueAtTime(0.3, t0);
  padGain.connect(send);
  send.connect(g.reverb);
  nodes.push(send);

  // Gentle major-ish arpeggio with a slow shuffle (long-short) feel.
  const arp = [MIDI.F4, MIDI.A4, MIDI.C5, MIDI.A4, MIDI.F4, MIDI.C5];
  let idx = 0;
  let nextNote = t0 + 1;
  const swing = 0.62;
  const stepSec = 0.42;
  const voiceGraph: VoiceGraph = { ctx, dest: out, reverb: g.reverb };
  function tick(windowEnd: number): void {
    while (nextNote < windowEnd) {
      const note = arp[idx % arp.length];
      pluck(voiceGraph, {
        at: nextNote,
        freq: mtof(note),
        gain: 0.1,
        decay: 0.8,
        bright: 0.55,
        pan: (idx % arp.length) / arp.length - 0.4,
        send: 0.35,
      });
      const isLong = idx % 2 === 0;
      nextNote += stepSec * (isLong ? swing * 2 : (1 - swing) * 2);
      idx += 1;
    }
  }

  return { out, tick, stop: makeStopper(sources, nodes) };
}

// ---------------------------------------------------------------------------
// showdown — brief, held, cinematic; self-terminating
// ---------------------------------------------------------------------------

function buildShowdownLayer(g: MusicGraph, t0: number): Layer {
  const { ctx } = g;
  const out = ctx.createGain();
  out.gain.setValueAtTime(SILENCE, t0);
  out.connect(g.dest);
  const voiceGraph: VoiceGraph = { ctx, dest: out, reverb: g.reverb };

  // Swelling saw stack.
  const chordNotes = [MIDI.D3, MIDI.F3, MIDI.A3, MIDI.D4, MIDI.F4];
  chordNotes.forEach((m, i) => {
    tone(voiceGraph, {
      at: t0,
      freq: mtof(m),
      type: 'sawtooth',
      detune: (i % 2 === 0 ? -1 : 1) * (5 + i),
      gain: 0.16,
      send: 0.55,
      pan: (i / (chordNotes.length - 1)) * 1.2 - 0.6,
      attack: 1.1,
      decay: 0.4,
      sustain: 0.85,
      hold: 1.6,
      release: 1.3,
      filter: { type: 'lowpass', freq: 500, to: 3200, q: 1.4, ms: 1400 },
    });
  });

  // Low timpani-ish thumps.
  [0, 0.55, 1.1].forEach((offset, i) => {
    sweep(voiceGraph, {
      at: t0 + offset,
      from: 110,
      to: 42,
      ms: 500,
      type: 'sine',
      gain: 0.32 - i * 0.05,
      send: 0.25,
      attack: 0.006,
      decay: 0.3,
      sustain: 0.3,
      hold: 0.05,
      release: 0.35,
    });
  });

  const TOTAL_LEN = 4.4;
  // Self-terminate even if nobody calls setMood()/stop() again afterward —
  // this mood is a stinger, not an ambient bed left to run forever.
  scheduleDisconnect([out], TOTAL_LEN + 1);

  return {
    out,
    tick: () => {
      /* one-shot — nothing to schedule */
    },
    stop: (_t, release) => scheduleDisconnect([out], release + 0.3),
  };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

type Builder = (g: MusicGraph, t0: number) => Layer | null;

const BUILDERS: Record<Mood, Builder> = {
  none: () => null,
  menu: buildMenuLayer,
  table: buildTableLayer,
  tension: buildTensionLayer,
  shop: buildShopLayer,
  showdown: buildShowdownLayer,
};

export function createMusicController(g: MusicGraph): MusicController {
  const { ctx } = g;
  let currentMood: Mood = 'none';
  let currentLayer: Layer | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  function pump(): void {
    try {
      if (!currentLayer) return;
      currentLayer.tick(ctx.currentTime + LOOKAHEAD_SEC);
    } catch {
      /* a bad scheduling call must never kill the interval */
    }
  }

  function ensureScheduler(): void {
    if (timer !== null) return;
    timer = setInterval(pump, SCHEDULER_INTERVAL_MS);
  }

  function stopSchedulerIfIdle(): void {
    if (timer !== null && currentLayer === null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function setMood(mood: Mood, crossfadeSec = DEFAULT_CROSSFADE): void {
    try {
      if (mood === currentMood && mood !== 'showdown') return;
      const cf = Math.max(MIN_CROSSFADE, crossfadeSec);
      const t0 = ctx.currentTime;
      const outgoing = currentLayer;

      if (outgoing) {
        const gp = outgoing.out.gain;
        gp.cancelScheduledValues(t0);
        gp.setValueAtTime(Math.max(gp.value, SILENCE), t0);
        gp.exponentialRampToValueAtTime(SILENCE, t0 + cf);
        outgoing.stop(t0, cf);
      }

      const layer = BUILDERS[mood](g, t0);
      if (layer) {
        const gp = layer.out.gain;
        gp.cancelScheduledValues(t0);
        gp.setValueAtTime(SILENCE, t0);
        gp.linearRampToValueAtTime(Math.max(MOOD_LEVEL[mood], SILENCE), t0 + cf);
        ensureScheduler();
      }

      currentMood = mood;
      currentLayer = layer;

      if (!layer) {
        setTimeout(stopSchedulerIfIdle, (cf + 0.3) * 1000);
      }
    } catch {
      /* a broken graph must never propagate into game logic */
    }
  }

  function stop(fadeSec?: number): void {
    setMood('none', fadeSec ?? DEFAULT_CROSSFADE);
  }

  return { setMood, stop };
}
