/**
 * HEXHOLD — dev-only sound test panel.
 *
 * Every `SfxName` and music `Mood`, as a button that plays it, grouped the
 * same way `src/audio/README.md`'s "Every SfxName" table is grouped. This
 * exists because every sound in the game is synthesized at runtime with no
 * audio files — until `test/audio.mjs` and this panel, nothing in the
 * project had ever actually been *listened to* by anyone.
 *
 * This component is intentionally not wired into the shipped game UI: it
 * exports `SoundTest` and leaves mounting it (behind a dev-only gate, a
 * keyboard shortcut, a settings tab — whatever fits) to whoever owns that
 * part of the app. It has no dependency on `src/components/` or the game's
 * stylesheet — every style below is inline, so it renders correctly no
 * matter where it ends up mounted.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { audio, type Mood } from './engine';
import { SFX_NAMES, type SfxName } from './sfx';

// ---------------------------------------------------------------------------
// Grouping — mirrors the section headings in src/audio/README.md
// ---------------------------------------------------------------------------

const CATEGORIES: ReadonlyArray<{ label: string; names: readonly SfxName[] }> = [
  {
    label: 'Cards',
    names: ['card_deal', 'card_flip', 'card_slide', 'card_place', 'card_burn', 'card_shuffle'],
  },
  {
    label: 'Chips',
    names: ['chip_single', 'chip_stack', 'chip_slide', 'pot_collect', 'chip_allin'],
  },
  {
    label: 'UI',
    names: ['ui_hover', 'ui_click', 'ui_back', 'ui_error', 'ui_confirm', 'ui_tick', 'ui_warn'],
  },
  {
    label: 'Magic — schools',
    names: ['cast_entropy', 'cast_veil', 'cast_chronos', 'cast_bind', 'cast_ruin', 'cast_weave'],
  },
  {
    label: 'Magic — effects',
    names: [
      'spell_counter', 'spell_fizzle', 'collapse', 'superpose', 'diverge',
      'entangle', 'inscribe', 'rewind', 'seal',
    ],
  },
  {
    label: 'Game beats',
    names: [
      'deal_start', 'street_flop', 'street_turn', 'street_river', 'showdown',
      'win_normal', 'win_big', 'win_impossible', 'lose_hand', 'eliminate',
      'victory', 'shop_open', 'shop_buy', 'shop_reroll', 'level_up',
      'heartbeat', 'your_turn',
    ],
  },
];

// A safety net rather than the source of truth: if sfx.ts ever grows a name
// this list hasn't caught up with yet, it still gets a button instead of
// silently going untested.
const CATEGORIZED = new Set<SfxName>(CATEGORIES.flatMap((c) => c.names));
const UNCATEGORIZED = SFX_NAMES.filter((n) => !CATEGORIZED.has(n));

const MOODS: readonly Mood[] = ['menu', 'table', 'tension', 'shop', 'showdown'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SoundTest() {
  const [ready, setReady] = useState(audio.ready);
  const [activeMood, setActiveMood] = useState<Mood>('none');
  const [pitch, setPitch] = useState(1);
  const [last, setLast] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const [flashed, setFlashed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void audio.init().then(() => {
      if (!cancelled) setReady(audio.ready);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(flashTimer.current);
    };
  }, []);

  const flash = (label: string) => {
    setLast(label);
    setFlashed(label);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashed(null), 260);
  };

  const playOne = (name: SfxName) => {
    audio.unlock();
    setReady(audio.ready);
    audio.play(name, { pitch });
    flash(name);
  };

  const playMood = (mood: Mood) => {
    audio.unlock();
    setReady(audio.ready);
    audio.music(mood);
    setActiveMood(mood);
    flash(`music: ${mood}`);
  };

  const stopMusic = () => {
    audio.stopMusic();
    setActiveMood('none');
    flash('music: stop');
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>HEXHOLD — sound test</div>
          <div style={styles.subtitle}>
            {ready ? 'audio engine ready' : 'not unlocked yet — click any button'}
            {last ? <> · last played <code style={styles.code}>{last}</code></> : null}
          </div>
        </div>
        <label style={styles.pitchLabel}>
          pitch
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={pitch}
            onChange={(e) => setPitch(Number(e.target.value))}
            style={styles.pitchRange}
          />
          <code style={styles.code}>{pitch.toFixed(2)}×</code>
        </label>
      </div>

      <section style={styles.section}>
        <div style={styles.sectionTitle}>Music moods</div>
        <div style={styles.row}>
          {MOODS.map((mood) => (
            <button
              key={mood}
              type="button"
              onClick={() => playMood(mood)}
              style={{
                ...styles.btn,
                ...(activeMood === mood ? styles.btnActive : null),
                ...(flashed === `music: ${mood}` ? styles.btnFlash : null),
              }}
            >
              {mood}
            </button>
          ))}
          <button
            type="button"
            onClick={stopMusic}
            style={{ ...styles.btn, ...styles.btnGhost, ...(flashed === 'music: stop' ? styles.btnFlash : null) }}
          >
            stop
          </button>
        </div>
      </section>

      {CATEGORIES.map((cat) => (
        <section key={cat.label} style={styles.section}>
          <div style={styles.sectionTitle}>
            {cat.label} <span style={styles.count}>({cat.names.length})</span>
          </div>
          <div style={styles.row}>
            {cat.names.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => playOne(name)}
                style={{ ...styles.btn, ...(flashed === name ? styles.btnFlash : null) }}
              >
                {name}
              </button>
            ))}
          </div>
        </section>
      ))}

      {UNCATEGORIZED.length > 0 ? (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>
            Uncategorized <span style={styles.count}>— sfx.ts has grown since this panel was written</span>
          </div>
          <div style={styles.row}>
            {UNCATEGORIZED.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => playOne(name)}
                style={{ ...styles.btn, ...(flashed === name ? styles.btnFlash : null) }}
              >
                {name}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline styles — no dependency on src/styles/ or src/components/
// ---------------------------------------------------------------------------

const ink = {
  bg: '#0a0c16',
  panel: '#12142280',
  border: '#f0c46533',
  text: '#e8e6f0',
  dim: '#9a97ad',
  gold: '#f0c465',
};

const styles: Record<string, CSSProperties> = {
  panel: {
    display: 'grid',
    gap: 18,
    padding: 20,
    background: ink.bg,
    color: ink.text,
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 13,
    maxHeight: '100%',
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 12,
    borderBottom: `1px solid ${ink.border}`,
  },
  title: {
    fontFamily: "'Cinzel', Georgia, serif",
    letterSpacing: '.08em',
    color: ink.gold,
    fontSize: 15,
  },
  subtitle: { color: ink.dim, fontSize: 12, marginTop: 4 },
  code: {
    fontFamily: "'JetBrains Mono', monospace",
    color: ink.gold,
  },
  pitchLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: ink.dim,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '.08em',
  },
  pitchRange: { width: 120 },
  section: { display: 'grid', gap: 8 },
  sectionTitle: {
    color: ink.gold,
    fontSize: 11,
    letterSpacing: '.14em',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  count: { color: ink.dim, fontWeight: 400, textTransform: 'none', letterSpacing: 0 },
  row: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  btn: {
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${ink.border}`,
    background: '#ffffff0a',
    color: ink.text,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    cursor: 'pointer',
    transition: 'background 120ms ease, border-color 120ms ease, transform 80ms ease',
  },
  btnGhost: { opacity: 0.75, fontStyle: 'italic' },
  btnActive: {
    borderColor: ink.gold,
    background: '#f0c46522',
  },
  btnFlash: {
    background: ink.gold,
    color: '#161016',
    borderColor: ink.gold,
    transform: 'scale(0.96)',
  },
};
