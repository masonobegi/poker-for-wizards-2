/**
 * HEXHOLD — the audio engine singleton.
 *
 * One `AudioContext`, one signal path:
 *
 *   sfxBus   ─┐
 *             ├─▶ masterGain ─▶ compressor ─▶ destination
 *   musicBus ─▶ duckGain ─┘
 *
 *   reverbSend ─▶ convolver ─▶ reverbReturn ─▶ masterGain
 *
 * `sfxBus` and `musicBus` carry the dry signal for sound effects and music
 * respectively; both are scaled by the matching `AudioSettings` field.
 * `duckGain` sits between `musicBus` and the master so `duck()` can lean on
 * the music alone without touching sfx volume or the settings the player
 * chose. `reverbSend` is the single shared input every voice in
 * `src/audio/voices.ts` can tap via `VoiceGraph.reverb` — it feeds a
 * procedurally generated convolution impulse response so nothing in this
 * project ever loads an audio file. `masterGain` folds in the master volume
 * and mute switch, and a soft-knee compressor sits at the very end purely as
 * a safety net against the mix piling up during a big win or an all-in.
 *
 * Every public method on `audio` is wrapped so a missing, broken or
 * autoplay-blocked `AudioContext` degrades to silence instead of throwing —
 * this module must never be the thing that crashes the game.
 */

import { SFX, type SfxName } from './sfx';
import { clamp, type VoiceGraph } from './voices';
import { createMusicController, type MusicController } from './music';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

export type Mood = 'menu' | 'table' | 'tension' | 'showdown' | 'shop' | 'none';

/** Not exported — the public shape lives inline on `audio.play` below, per spec. */
interface PlayOptions {
  vol?: number;
  pitch?: number;
  pan?: number;
  /** Milliseconds to delay the start of this sound. */
  delay?: number;
}

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'hexhold.audio';

const DEFAULT_SETTINGS: AudioSettings = {
  master: 0.85,
  sfx: 0.9,
  music: 0.6,
  muted: false,
};

function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function loadSettings(): AudioSettings {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULT_SETTINGS };
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      master: clamp(numberOr(parsed.master, DEFAULT_SETTINGS.master), 0, 1),
      sfx: clamp(numberOr(parsed.sfx, DEFAULT_SETTINGS.sfx), 0, 1),
      music: clamp(numberOr(parsed.music, DEFAULT_SETTINGS.music), 0, 1),
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_SETTINGS.muted,
    };
  } catch {
    // Corrupt JSON, blocked storage, private-mode quota — fall back quietly.
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: AudioSettings): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota exceeded / private mode — the session still works, just unsaved */
  }
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

interface EngineGraph {
  readonly ctx: AudioContext;
  readonly masterGain: GainNode;
  readonly compressor: DynamicsCompressorNode;
  readonly sfxBus: GainNode;
  readonly musicBus: GainNode;
  readonly duckGain: GainNode;
  readonly reverbSend: GainNode;
  readonly convolver: ConvolverNode;
  readonly reverbReturn: GainNode;
}

/**
 * `AudioContext` is declared as a global (not as a member of `Window`), so
 * `typeof AudioContext` is the safe way to feature-detect it — this also
 * degrades cleanly to `undefined` outside a browser (e.g. during SSR/build)
 * without throwing a `ReferenceError`.
 */
function resolveAudioContextCtor(): (new () => AudioContext) | undefined {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  const legacy = globalThis as { webkitAudioContext?: typeof AudioContext };
  return legacy.webkitAudioContext;
}

/**
 * Render a ~2.2s stereo impulse response for the shared reverb: white noise
 * pushed through a one-pole lowpass (to keep the tail dark rather than
 * hissy) under an exponential-feeling amplitude envelope down to silence.
 */
function makeImpulseResponse(ctx: AudioContext): AudioBuffer {
  const duration = 2.2;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      lp += (white - lp) * 0.22;
      const env = Math.pow(1 - i / length, 2.4);
      data[i] = lp * env;
    }
  }
  return buffer;
}

function buildGraph(): EngineGraph {
  const Ctor = resolveAudioContextCtor();
  if (!Ctor) throw new Error('Web Audio API is not available in this environment.');
  const ctx = new Ctor();
  const t0 = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, t0);
  compressor.knee.setValueAtTime(26, t0);
  compressor.ratio.setValueAtTime(3, t0);
  compressor.attack.setValueAtTime(0.006, t0);
  compressor.release.setValueAtTime(0.25, t0);
  masterGain.connect(compressor);
  compressor.connect(ctx.destination);

  const sfxBus = ctx.createGain();
  const musicBus = ctx.createGain();
  const duckGain = ctx.createGain();
  duckGain.gain.value = 1;
  sfxBus.connect(masterGain);
  musicBus.connect(duckGain);
  duckGain.connect(masterGain);

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 1;
  const convolver = ctx.createConvolver();
  convolver.normalize = true;
  convolver.buffer = makeImpulseResponse(ctx);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.9;
  reverbSend.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(masterGain);

  return { ctx, masterGain, compressor, sfxBus, musicBus, duckGain, reverbSend, convolver, reverbReturn };
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let graph: EngineGraph | null = null;
let musicController: MusicController | null = null;
let initPromise: Promise<void> | null = null;
let settings: AudioSettings = loadSettings();
const lastPlayed = new Map<SfxName, number>();

const THROTTLE_SEC = 0.025;

function applySettingsToGraph(): void {
  if (!graph) return;
  const t = graph.ctx.currentTime;
  const ramp = 0.015;
  graph.masterGain.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, ramp);
  graph.sfxBus.gain.setTargetAtTime(settings.sfx, t, ramp);
  graph.musicBus.gain.setTargetAtTime(settings.music, t, ramp);
}

// ---------------------------------------------------------------------------
// init / unlock
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  if (graph) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const g = buildGraph();
      graph = g;
      applySettingsToGraph();
      musicController = createMusicController({ ctx: g.ctx, dest: g.musicBus, reverb: g.reverbSend });
      if (g.ctx.state === 'suspended') {
        // Some browsers permit an initial resume outside a gesture if the
        // page already has interaction elsewhere; if not, unlock() finishes
        // the job on the next pointerdown/keydown.
        await g.ctx.resume().catch(() => undefined);
      }
    } catch {
      // Missing/broken AudioContext, blocked by policy, whatever — the game
      // keeps running silently rather than crashing.
      graph = null;
      musicController = null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

function resumeCtx(): void {
  try {
    if (!graph) return;
    if (graph.ctx.state === 'suspended') {
      void graph.ctx.resume().catch(() => undefined);
    }
  } catch {
    /* never throw out of a gesture handler */
  }
}

function unlock(): void {
  try {
    if (!graph) {
      void init().then(resumeCtx);
      return;
    }
    resumeCtx();
  } catch {
    /* swallow — see module doc comment */
  }
}

// ---------------------------------------------------------------------------
// play
// ---------------------------------------------------------------------------

function play(name: SfxName, opts?: PlayOptions): void {
  try {
    if (!graph) return;
    const def = SFX[name];
    if (!def) return;

    const nowSec = graph.ctx.currentTime;
    const last = lastPlayed.get(name);
    if (last !== undefined && nowSec - last < THROTTLE_SEC) return;
    lastPlayed.set(name, nowSec);

    const delaySec = Math.max(0, (opts?.delay ?? 0) / 1000);
    const t0 = nowSec + delaySec;
    const vol = clamp(opts?.vol ?? 1, 0, 4);
    const pan = clamp(opts?.pan ?? 0, -1, 1);
    const pitch = clamp(opts?.pitch ?? 1, 0.1, 8);

    // The synths in sfx.ts only ever set *relative* pan/gain between their
    // own layers; overall per-play volume and stereo position live here.
    const voiceGain = graph.ctx.createGain();
    voiceGain.gain.setValueAtTime(vol, t0);
    const voicePan = graph.ctx.createStereoPanner();
    voicePan.pan.setValueAtTime(pan, t0);
    voiceGain.connect(voicePan);
    voicePan.connect(graph.sfxBus);

    const voiceGraph: VoiceGraph = { ctx: graph.ctx, dest: voiceGain, reverb: graph.reverbSend };
    def.play(voiceGraph, t0, pitch);

    const cleanupMs = Math.max(50, (delaySec + def.len + 0.25) * 1000);
    setTimeout(() => {
      try {
        voiceGain.disconnect();
        voicePan.disconnect();
      } catch {
        /* already disconnected */
      }
    }, cleanupMs);
  } catch {
    /* a broken synth must never propagate into game logic */
  }
}

// ---------------------------------------------------------------------------
// music / duck
// ---------------------------------------------------------------------------

function music(mood: Mood): void {
  try {
    musicController?.setMood(mood);
  } catch {
    /* ignore */
  }
}

function stopMusic(fade?: number): void {
  try {
    musicController?.stop(fade);
  } catch {
    /* ignore */
  }
}

function duck(amount: number, ms: number): void {
  try {
    if (!graph) return;
    const amt = clamp(amount, 0, 1);
    const dur = Math.max(0, ms) / 1000;
    const t0 = graph.ctx.currentTime;
    const attack = 0.04;
    const release = 0.3;
    const duckTo = clamp(1 - amt, 0, 1);
    const param = graph.duckGain.gain;
    param.cancelScheduledValues(t0);
    param.setValueAtTime(Math.max(param.value, 0.0001), t0);
    param.linearRampToValueAtTime(Math.max(duckTo, 0.0001), t0 + attack);
    param.setValueAtTime(Math.max(duckTo, 0.0001), t0 + attack + dur);
    param.linearRampToValueAtTime(1, t0 + attack + dur + release);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

function setSettings(p: Partial<AudioSettings>): void {
  try {
    settings = {
      master: p.master !== undefined ? clamp(p.master, 0, 1) : settings.master,
      sfx: p.sfx !== undefined ? clamp(p.sfx, 0, 1) : settings.sfx,
      music: p.music !== undefined ? clamp(p.music, 0, 1) : settings.music,
      muted: p.muted !== undefined ? p.muted : settings.muted,
    };
    saveSettings(settings);
    applySettingsToGraph();
  } catch {
    /* ignore */
  }
}

function getSettings(): AudioSettings {
  return { ...settings };
}

// ---------------------------------------------------------------------------
// Public singleton
// ---------------------------------------------------------------------------

export const audio: {
  init(): Promise<void>;
  ready: boolean;
  play(name: SfxName, opts?: PlayOptions): void;
  music(mood: Mood): void;
  stopMusic(fade?: number): void;
  duck(amount: number, ms: number): void;
  setSettings(p: Partial<AudioSettings>): void;
  getSettings(): AudioSettings;
  unlock(): void;
} = {
  init,
  get ready(): boolean {
    return graph !== null && graph.ctx.state === 'running';
  },
  play,
  music,
  stopMusic,
  duck,
  setSettings,
  getSettings,
  unlock,
};
