/**
 * A thin shim in front of the audio engine.
 *
 * The UI never imports the synth directly. Sound is a nice-to-have: if the
 * engine fails to load, or the browser refuses an AudioContext, every call here
 * quietly becomes a no-op rather than taking a scene down with it.
 */
type PlayOpts = { vol?: number; pitch?: number; pan?: number; delay?: number };
type Mood = 'menu' | 'table' | 'tension' | 'showdown' | 'shop' | 'none';

interface AudioApi {
  init(): Promise<void>;
  play(name: string, opts?: PlayOpts): void;
  music(mood: Mood): void;
  stopMusic(fade?: number): void;
  duck(amount: number, ms: number): void;
  setSettings(p: Partial<AudioSettings>): void;
  getSettings(): AudioSettings;
  unlock(): void;
}

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

const FALLBACK: AudioSettings = { master: 0.8, sfx: 0.9, music: 0.5, muted: false };

let api: AudioApi | null = null;
let loading: Promise<void> | null = null;
/** Calls made before the engine finished loading, replayed once it lands. */
let pendingMood: Mood | null = null;

async function load(): Promise<void> {
  if (api || loading) return loading ?? undefined;
  loading = (async () => {
    try {
      const mod = (await import('@/audio/engine')) as { audio?: AudioApi };
      if (mod.audio) {
        api = mod.audio;
        await api.init();
        if (pendingMood) { api.music(pendingMood); pendingMood = null; }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[sound] engine unavailable', err);
    }
  })();
  return loading;
}

/** Call from the first user gesture. Safe to call repeatedly. */
export function unlockAudio(): void {
  void load().then(() => api?.unlock());
}

export function playSfx(name: string, opts?: PlayOpts): void {
  if (!api) { void load(); return; }
  try { api.play(name, opts); } catch { /* silence beats a crash */ }
}

export function setMusic(mood: Mood): void {
  if (!api) { pendingMood = mood; void load(); return; }
  try { api.music(mood); } catch { /* ignore */ }
}

export function duckMusic(amount: number, ms: number): void {
  try { api?.duck(amount, ms); } catch { /* ignore */ }
}

export function getAudioSettings(): AudioSettings {
  try { return api?.getSettings() ?? FALLBACK; } catch { return FALLBACK; }
}

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  void load().then(() => {
    try { api?.setSettings(patch); } catch { /* ignore */ }
  });
}

/** Spreadable props that give a control its hover and press sounds. */
export const soundProps = (click = 'ui_click', hover = 'ui_hover') => ({
  onPointerEnter: () => playSfx(hover, { vol: 0.35 }),
  onPointerDown: () => playSfx(click),
});
