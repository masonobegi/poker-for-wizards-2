import { useEffect, useState } from 'react';
import { Button, Range, Toggle } from '@/components/ui/kit';
import { getAudioSettings, playSfx, setAudioSettings, type AudioSettings } from '@/lib/sound';

const REDUCED_KEY = 'hexhold.reducedMotion';

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<AudioSettings>(() => getAudioSettings());
  const [reduced, setReduced] = useState(() => {
    try { return localStorage.getItem(REDUCED_KEY) === '1'; } catch { return false; }
  });

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

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reduced ? '1' : '';
    try { localStorage.setItem(REDUCED_KEY, reduced ? '1' : '0'); } catch { /* ignore */ }
  }, [reduced]);

  return (
    <div style={{ display: 'grid', gap: 'var(--s-5)' }}>
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

      <section style={{ display: 'grid', gap: 'var(--s-4)' }}>
        <div className="eyebrow">Audio</div>

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

        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)', lineHeight: 1.6 }}>
          Every sound in HEXHOLD is generated at runtime — there is not a single
          audio file in the build.
        </p>
      </section>

      <hr className="rule" />

      <section style={{ display: 'grid', gap: 'var(--s-3)' }}>
        <div className="eyebrow">Motion</div>
        <Toggle
          checked={reduced}
          onChange={setReduced}
          label="Reduce motion and particles"
        />
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)', lineHeight: 1.6 }}>
          Cuts screen shake, particle counts and card phasing. Your system
          preference is respected automatically; this forces it on.
        </p>
      </section>
    </div>
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
