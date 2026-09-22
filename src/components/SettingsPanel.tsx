import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button, Range, Toggle } from '@/components/ui/kit';
import { getAudioSettings, playSfx, setAudioSettings, type AudioSettings } from '@/lib/sound';
import { usePrefs } from '@/components/shell/prefs';
import {
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  useParticleDensity,
  useReducedMotionSetting,
  useSystemReducedMotion,
  useUiScale,
  type ParticleDensity,
} from '@/components/shell/videoPrefs';
import { getHexholdApi } from '@/components/shell/desktop';
import { SoundTest } from '@/audio/SoundTest';
import './shell/shell.css';

type TabId = 'audio' | 'video' | 'gameplay' | 'controls' | 'about' | 'sounds';

const DEV = !!import.meta.env?.DEV;

const TABS: { id: TabId; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'controls', label: 'Controls' },
  { id: 'about', label: 'About' },
  // The synth bench. Every sound in the game is generated at runtime, so being
  // able to audition them one at a time is how the audio gets tuned at all.
  ...(DEV ? [{ id: 'sounds' as TabId, label: 'Sounds' }] : []),
];

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('audio');
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());

  const focusTab = (id: TabId) => tabRefs.current.get(id)?.focus();

  const onTabsKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const idx = TABS.findIndex((t) => t.id === tab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = TABS[(idx + dir + TABS.length) % TABS.length];
      setTab(next.id);
      focusTab(next.id);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setTab(TABS[0].id);
      focusTab(TABS[0].id);
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = TABS[TABS.length - 1];
      setTab(last.id);
      focusTab(last.id);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <header className="row spread">
        <h2 style={{
          fontSize: 'var(--fs-xl)',
          letterSpacing: '.24em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
        }}>
          Settings
        </h2>
        <Button tone="ghost" size="sm" onClick={onClose}>Close</Button>
      </header>

      <nav className="hh-tabs" role="tablist" aria-label="Settings sections" onKeyDown={onTabsKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              if (el) tabRefs.current.set(t.id, el);
              else tabRefs.current.delete(t.id);
            }}
            role="tab"
            type="button"
            id={`hh-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`hh-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`hh-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel" id={`hh-panel-${tab}`} aria-labelledby={`hh-tab-${tab}`} className="hh-tabpanel">
        {tab === 'audio' ? <AudioTab /> : null}
        {tab === 'video' ? <VideoTab /> : null}
        {tab === 'gameplay' ? <GameplayTab /> : null}
        {tab === 'controls' ? <ControlsTab /> : null}
        {tab === 'about' ? <AboutTab /> : null}
        {tab === 'sounds' ? <SoundTest /> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

function AudioTab() {
  const [s, setS] = useState<AudioSettings>(() => getAudioSettings());

  // The engine may finish loading after this panel opens.
  useEffect(() => {
    const id = window.setTimeout(() => setS(getAudioSettings()), 400);
    return () => window.clearTimeout(id);
  }, []);

  const patch = (p: Partial<AudioSettings>) => {
    const next = { ...s, ...p };
    setS(next);
    setAudioSettings(p);
  };

  return (
    <section style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <Toggle
        checked={!s.muted}
        onChange={(v) => patch({ muted: !v })}
        label={s.muted ? 'Sound off' : 'Sound on'}
      />

      <Slider label="Master" value={s.master} disabled={s.muted}
        onChange={(v) => patch({ master: v })} onRelease={() => playSfx('ui_confirm')} />
      <Slider label="Effects" value={s.sfx} disabled={s.muted}
        onChange={(v) => patch({ sfx: v })} onRelease={() => playSfx('chip_stack')} />
      <Slider label="Music" value={s.music} disabled={s.muted}
        onChange={(v) => patch({ music: v })} />

      <p className="hh-field-hint">
        Every sound in HEXHOLD is generated at runtime — there is not a single
        audio file in the build.
      </p>
    </section>
  );
}

function Slider({ label, value, disabled, onChange, onRelease }: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
  onRelease?: () => void;
}) {
  return (
    <label style={{ display: 'grid', gap: 4, opacity: disabled ? 0.45 : 1 }}>
      <span className="row spread" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
        <span style={{ letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600 }}>
          {label}
        </span>
        <span className="mono">{Math.round(value * 100)}</span>
      </span>
      <Range
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={onChange}
        onPointerUp={onRelease}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

const PARTICLE_OPTIONS: ParticleDensity[] = ['off', 'low', 'full'];

function VideoTab() {
  const [reduced, setReduced] = useReducedMotionSetting();
  // The attribute the app actually keys off is `manual || OS`, so the checkbox
  // has to show the effective state or it lies on a machine where the OS
  // preference is on — it would read unchecked while everything was reduced,
  // and toggling it would appear to do nothing.
  const systemReduced = useSystemReducedMotion();
  const [density, setDensity] = useParticleDensity();
  const [uiScale, setUiScale] = useUiScale();
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = async () => {
    const api = getHexholdApi();
    if (api?.toggleFullscreen) {
      const on = await api.toggleFullscreen();
      setFullscreen(on);
      return;
    }
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else await document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <section style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <div className="row spread">
        <span className="field-label">Fullscreen</span>
        <Button size="sm" tone="ghost" onClick={() => { void toggleFullscreen(); }}>
          {fullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        </Button>
      </div>

      <div>
        <Toggle
          checked={reduced || systemReduced}
          disabled={systemReduced}
          onChange={setReduced}
          label="Reduce motion and particles"
        />
        <p className="hh-field-hint" style={{ marginTop: 6 }}>
          Cuts screen shake, particle counts and card phasing.
          {systemReduced
            ? ' Your system already asks for reduced motion, so this is on and cannot be turned off here.'
            : ' Your system preference is respected automatically; this forces it on.'}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <span className="field-label">Particle density</span>
        <fieldset className="hh-segmented" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="sr-only">Particle density</legend>
          {PARTICLE_OPTIONS.map((opt) => (
            <label key={opt} className="hh-segmented-option">
              <input
                type="radio"
                name="particle-density"
                className="hh-segmented-input"
                checked={density === opt}
                onChange={() => setDensity(opt)}
              />
              <span className="hh-segmented-label">{opt}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <label style={{ display: 'grid', gap: 4 }}>
        <span className="row spread" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
          <span style={{ letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600 }}>
            UI Scale
          </span>
          <span className="mono">{Math.round(uiScale * 100)}%</span>
        </span>
        <Range min={UI_SCALE_MIN} max={UI_SCALE_MAX} step={0.05} value={uiScale} onChange={setUiScale} />
      </label>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Gameplay
// ---------------------------------------------------------------------------

function GameplayTab() {
  const [prefs, setPrefs] = usePrefs();

  return (
    <section style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <Toggle
        checked={prefs.confirmFold}
        onChange={(v) => setPrefs({ confirmFold: v })}
        label="Confirm before folding"
      />
      <Toggle
        checked={prefs.showPotOdds}
        onChange={(v) => setPrefs({ showPotOdds: v })}
        label="Always show pot odds"
      />
      <Toggle
        checked={prefs.autoMuck}
        onChange={(v) => setPrefs({ autoMuck: v })}
        label="Auto-muck losing hands"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const SHORTCUTS: { key: string; action: string }[] = [
  { key: 'F', action: 'Fold' },
  { key: 'C', action: 'Check / Call' },
  { key: 'R', action: 'Raise' },
  { key: 'A', action: 'All-in' },
  { key: 'Enter', action: 'Confirm' },
  { key: 'Esc', action: 'Menu' },
  { key: 'F11', action: 'Fullscreen' },
];

function ControlsTab() {
  return (
    <section style={{ display: 'grid', gap: 'var(--s-3)' }}>
      <p className="hh-field-hint">Keyboard shortcuts, at the table.</p>
      <dl className="hh-shortcuts">
        {SHORTCUTS.map((row) => (
          <div className="hh-shortcut-row" key={row.key}>
            <dt><kbd className="hh-kbd">{row.key}</kbd></dt>
            <dd style={{ margin: 0, color: 'var(--text-2)', fontSize: 'var(--fs-sm)' }}>{row.action}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

function AboutTab() {
  const [version, setVersion] = useState<string | null>(null);
  const desktop = !!getHexholdApi();

  useEffect(() => {
    let alive = true;
    const api = getHexholdApi();
    if (!api) return undefined;
    api.version()
      .then((v) => { if (alive) setVersion(v); })
      .catch(() => { if (alive) setVersion(null); });
    return () => { alive = false; };
  }, []);

  const versionLabel = desktop ? `v${version ?? '…'}` : 'Web build';

  return (
    <section className="hh-about">
      <h3 className="hh-about-name display">HEXHOLD</h3>
      <span className="hh-about-version mono">{versionLabel}</span>
      <p className="hh-about-credit">
        Impossible poker — a deck that does not obey physics. Built by Mason Obegi.
      </p>
    </section>
  );
}
