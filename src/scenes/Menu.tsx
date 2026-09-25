import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Field, Modal } from '@/components/ui/kit';
import { readName, useGame } from '@/store/net';
import { SCHOOLS, SIGILS } from '@shared/sigils';
import type { BotSkill, TableSpeed } from '@shared/types';
import { RELICS } from '@shared/relics';
import Codex from '@/components/Codex';
import SettingsPanel from '@/components/SettingsPanel';
import IntroFlow, { hasSeenIntro } from '@/components/onboarding/IntroFlow';
import ProfileCard from '@/components/profile/ProfileCard';
import ServerPanel from '@/components/shell/ServerPanel';
import { Card } from '@/components/card/Card';
import { MENU_BACK, MENU_COURT, MENU_DIVERGED, MENU_QUANTUM, MENU_VEILED, MENU_WILD } from '@/scenes/menuCards';
import { getHexholdApi, isDesktop } from '@/components/shell/desktop';
import { appVersion } from '@/components/shell/version';
import './menu.css';
import { EASE_OUT } from '@/styles/motion';
import { Mark } from '@/art/marks';
import { COVENS, DEFAULT_COVEN, covenOf } from '@shared/covens';
import { loadProfile } from '@/components/profile/profile';

type Pane = 'home' | 'host' | 'join';

/**
 * The practice table's two knobs.
 *
 * They exist so the game can actually be *tested* — a run against three
 * masters at blitz speed reaches ante four in the time a relaxed novice table
 * reaches ante one, and the two tables teach completely different things about
 * whether the game is any good.
 *
 * The descriptions say what changes, not how good it is. "Novice" that turns
 * out to mean "plays randomly" would be a worse test than no setting at all,
 * so the copy commits to the actual model: they misread their hands.
 */
const SKILLS: ReadonlyArray<{ id: BotSkill; label: string; blurb: string }> = [
  { id: 'novice', label: 'Novice', blurb: 'Misjudge their hands, call too much, barely use magic.' },
  { id: 'adept', label: 'Adept', blurb: 'Read the board honestly and punish a loose call.' },
  { id: 'master', label: 'Master', blurb: 'Sharper reads, heavier aggression, magic at every opening.' },
];

const SPEEDS: ReadonlyArray<{ id: TableSpeed; label: string; blurb: string }> = [
  { id: 'relaxed', label: 'Relaxed', blurb: 'Bots take their time. Room to watch a hand play out.' },
  { id: 'standard', label: 'Standard', blurb: 'The pace the game is tuned for.' },
  { id: 'blitz', label: 'Blitz', blurb: 'Bots act fast. For covering a lot of hands quickly.' },
];

/** Remembered between sessions, because a tester changes it once and plays ten runs. */
function readPick<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    // Private windows and blocked site data both throw here.
    return fallback;
  }
}

function writePick(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* not worth failing a click over */ }
}

/**
 * A segmented picker. Real buttons rather than a styled `<select>`, so
 * controller navigation reaches every option directly instead of having to
 * open a native dropdown it cannot drive.
 */
function Picker<T extends string>({
  legend, value, options, onPick,
}: {
  legend: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string; blurb: string }>;
  onPick: (v: T) => void;
}) {
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <div className="menu-pick" role="group" aria-label={legend}>
      <span className="menu-pick-legend">{legend}</span>
      <div className="menu-pick-row">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`menu-pick-btn ${o.id === value ? 'is-on' : ''}`}
            aria-pressed={o.id === value}
            onClick={() => onPick(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="menu-pick-blurb">{current.blurb}</p>
    </div>
  );
}

export default function Menu() {
  const [pane, setPane] = useState<Pane>('home');
  const [name, setName] = useState(() => readName());
  const [code, setCode] = useState('');
  const [codex, setCodex] = useState(false);
  // The run's opening decision, remembered between sessions so a player who
  // has found the one they like does not re-pick it every time.
  const [coven, setCoven] = useState<string>(() => {
    try { return localStorage.getItem('hexhold.coven') ?? DEFAULT_COVEN; } catch { return DEFAULT_COVEN; }
  });
  // Re-read on every pick so the record under the blurb is the real one, not
  // whatever it was when the menu mounted.
  const [profile, setProfile] = useState(() => loadProfile());
  const covenRecord = profile.covens[coven];
  const pickCoven = (id: string): void => {
    setProfile(loadProfile());
    setCoven(id);
    try { localStorage.setItem('hexhold.coven', id); } catch { /* private mode */ }
  };
  const [settings, setSettings] = useState(false);
  const [server, setServer] = useState(false);
  const [intro, setIntro] = useState(() => !hasSeenIntro());
  const [practicing, setPracticing] = useState(false);
  const [skill, setSkill] = useState<BotSkill>(
    () => readPick<BotSkill>('hexhold.botSkill', 'adept', ['novice', 'adept', 'master']),
  );
  const [speed, setSpeed] = useState<TableSpeed>(
    () => readPick<TableSpeed>('hexhold.speed', 'standard', ['relaxed', 'standard', 'blitz']),
  );

  const createRoom = useGame((s) => s.createRoom);
  const joinRoom = useGame((s) => s.joinRoom);
  const tryRejoin = useGame((s) => s.tryRejoin);
  const addBot = useGame((s) => s.addBot);
  const startGame = useGame((s) => s.startGame);
  const joining = useGame((s) => s.joining);
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  const connected = useGame((s) => s.connected);

  useEffect(() => { void tryRejoin(); }, [tryRejoin]);
  useEffect(() => { if (pane !== 'home') clearError(); }, [pane, clearError]);

  const trimmed = name.trim();
  const canHost = trimmed.length > 0 && connected && !joining;
  const canJoin = canHost && code.trim().length === 4;

  const host = async () => { if (canHost) await createRoom(trimmed); };
  const join = async () => { if (canJoin) await joinRoom(code.trim(), trimmed); };

  /**
   * One click, straight to a live table: create a private room, seat three
   * bots, and deal. `room:create` gets an ack, so we await that; `room:bot`
   * and `room:start` are plain emits over the same socket, and the server
   * handles every event on a socket in the order it arrives and fully
   * synchronously (see server/net/io.ts and Engine.addBot/start) — so firing
   * the three bot adds and the start in sequence right after the room exists
   * is enough to guarantee the bots are seated before the hand deals, with
   * no polling of the lobby view required.
   */
  const practice = async () => {
    if (!connected || practicing) return;
    setPracticing(true);
    try {
      const code = await createRoom(
        trimmed || 'Adept',
        { maxPlayers: 4, private: true, botSkill: skill, speed },
        coven,
      );
      if (!code) return;
      addBot(true);
      addBot(true);
      addBot(true);
      startGame();
    } finally {
      setPracticing(false);
    }
  };

  return (
    <div className="menu">
      <MenuBackdrop />

      <div className="menu-inner">
        <motion.header
          className="menu-brand"
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE_OUT }}
        >
          <div className="menu-sigil" aria-hidden>
            <svg viewBox="0 0 120 120" width="88" height="88">
              <defs>
                <linearGradient id="brandgold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffe6a8" />
                  <stop offset="100%" stopColor="#a67c2a" />
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r="54" fill="none" stroke="url(#brandgold)" strokeWidth="1.2" opacity=".55" />
              <circle cx="60" cy="60" r="44" fill="none" stroke="url(#brandgold)" strokeWidth=".7" opacity=".35" />
              <path d="M60 14 L99 37 L99 83 L60 106 L21 83 L21 37 Z" fill="none"
                stroke="url(#brandgold)" strokeWidth="1.6" />
              <path d="M42 40 V80 M78 40 V80 M42 60 H78" fill="none"
                stroke="url(#brandgold)" strokeWidth="4" strokeLinecap="square" />
            </svg>
          </div>

          <h1 className="menu-title">HEXHOLD</h1>
          <p className="menu-tag">Impossible Poker</p>
        </motion.header>

        <AnimatePresence>
          {pane === 'home' ? (
            <motion.div key="home" className="menu-panel hx-plate" {...paneMotion}>
              <p className="menu-pitch">
                Texas Hold&rsquo;em, played with a deck that does not obey physics.
                Cards sit in two states at once. The King you are looking at is not
                the King your opponent sees. The river has run before, and it can
                run again.
              </p>

              {/* The coven picker. This is the first decision of a run and it
                  sits directly above the button that starts one, because a
                  choice a player has to go looking for is a choice most of
                  them never make. */}
              <div className="menu-covens" role="radiogroup" aria-label="Choose your coven">
                {COVENS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={coven === c.id}
                    className={`menu-coven ${coven === c.id ? 'is-on' : ''}`}
                    style={{ ['--school' as string]: SCHOOLS[c.school].accent }}
                    onClick={() => pickCoven(c.id)}
                    title={c.style}
                  >
                    <span className="menu-coven__glyph" aria-hidden><Mark kind="coven" id={c.id} fallback={c.glyph} /></span>
                    <span className="menu-coven__name">{c.name}</span>
                  </button>
                ))}
              </div>
              <p className="menu-covennote">
                {covenOf(coven).text}
                {covenRecord ? (
                  <em className="menu-covenrecord">
                    {covenRecord.runs} run{covenRecord.runs === 1 ? '' : 's'}
                    {covenRecord.wins > 0 ? ` · ${covenRecord.wins} won` : ''}
                    {covenRecord.deepestAnte > 0 ? ` · deepest ante ${covenRecord.deepestAnte}` : ''}
                    {covenRecord.impossible > 0 ? ` · ${covenRecord.impossible} impossible` : ''}
                  </em>
                ) : <em className="menu-covenrecord">never played</em>}
              </p>

              <div className="menu-actions">
                <Button tone="primary" size="lg" display block
                  loading={practicing} disabled={!connected || practicing}
                  onClick={() => void practice()}>
                  {connected ? 'Practice vs Bots' : 'Connecting…'}
                </Button>
                <p className="menu-practicenote">
                  Three bots fill the table and the first hand deals itself.
                </p>

                {/* The host and join panes have always shown this; the home
                    pane never did, and the home pane is where the button most
                    people press lives. A refused `room:create` — the server
                    full, or its per-address rate limit tripped — therefore
                    did nothing at all: no table, no message, a button that
                    looked broken. The server sends a sentence explaining
                    itself; the least this can do is print it. */}
                {error ? <p className="menu-error">{error}</p> : null}

                <div className="menu-setup">
                  <Picker
                    legend="Opponents"
                    value={skill}
                    options={SKILLS}
                    onPick={(v) => { setSkill(v); writePick('hexhold.botSkill', v); }}
                  />
                  <Picker
                    legend="Table speed"
                    value={speed}
                    options={SPEEDS}
                    onPick={(v) => { setSpeed(v); writePick('hexhold.speed', v); }}
                  />
                </div>

                <div className="menu-actions-row">
                  <Button size="md" block disabled={!connected} onClick={() => setPane('host')}>
                    Host a Table
                  </Button>
                  <Button size="md" block disabled={!connected} onClick={() => setPane('join')}>
                    Join with a Code
                  </Button>
                </div>
              </div>

              <ProfileCard />

              <div className="menu-links">
                <Button tone="ghost" size="sm" onClick={() => setIntro(true)}>
                  How this works
                </Button>
                <Button tone="ghost" size="sm" onClick={() => setCodex(true)}>
                  Codex &mdash; {SIGILS.length} sigils, {RELICS.length} relics
                </Button>
                <Button tone="ghost" size="sm" onClick={() => setSettings(true)}>
                  Settings
                </Button>
                <Button tone="ghost" size="sm" onClick={() => setServer(true)}>
                  Online
                </Button>
              </div>

              {/* A packaged build runs frameless and often fullscreen, where
                  there is no window chrome to close. Browsers own their own
                  tab, so this only appears on the desktop shell. */}
              {isDesktop() ? (
                <div className="menu-quit">
                  <Button tone="ghost" size="sm" onClick={() => void getHexholdApi()?.quit()}>
                    Quit
                  </Button>
                </div>
              ) : null}
            </motion.div>
          ) : null}

          {pane === 'host' ? (
            <motion.div key="host" className="menu-panel hx-plate" {...paneMotion}>
              <h2 className="menu-h2">Host a Table</h2>
              <Field
                label="Your name"
                value={name}
                maxLength={16}
                autoFocus
                placeholder="Name at the table"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void host(); }}
              />
              <p className="menu-note">
                You will get a four-letter code. Anyone with it can sit down.
                Fill the empty seats with bots if you want to start now.
              </p>
              {error ? <p className="menu-error">{error}</p> : null}
              <div className="menu-actions">
                <Button tone="primary" size="lg" display block
                  loading={joining} disabled={!canHost} onClick={() => void host()}>
                  Open the Table
                </Button>
                <Button tone="ghost" block onClick={() => setPane('home')}>Back</Button>
              </div>
            </motion.div>
          ) : null}

          {pane === 'join' ? (
            <motion.div key="join" className="menu-panel hx-plate" {...paneMotion}>
              <h2 className="menu-h2">Join a Table</h2>
              <Field
                label="Table code"
                className="input-code"
                value={code}
                maxLength={4}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                placeholder="ABCD"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') void join(); }}
              />
              <Field
                label="Your name"
                value={name}
                maxLength={16}
                placeholder="Name at the table"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void join(); }}
              />
              {error ? <p className="menu-error">{error}</p> : null}
              <div className="menu-actions">
                <Button tone="primary" size="lg" display block
                  loading={joining} disabled={!canJoin} onClick={() => void join()}>
                  Take a Seat
                </Button>
                <Button tone="ghost" block onClick={() => setPane('home')}>Back</Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <footer className="menu-foot">
          <span className={connected ? 'pulse-dot' : 'pulse-dot off'} />
          <span>{connected ? 'Connected' : 'Looking for the server'}</span>
          {/* So a bug report can name the build it came from. */}
          <span className="menu-version mono">v{appVersion()}</span>
        </footer>
      </div>

      <Modal open={codex} onClose={() => setCodex(false)}>
        <Codex onClose={() => setCodex(false)} />
      </Modal>
      <Modal open={settings} onClose={() => setSettings(false)}>
        <SettingsPanel onClose={() => setSettings(false)} />
      </Modal>
      <Modal open={server} onClose={() => setServer(false)}>
        <ServerPanel onClose={() => setServer(false)} />
      </Modal>
      <IntroFlow open={intro} onClose={() => setIntro(false)} />
    </div>
  );
}

/* Menu navigation is a pad/keyboard control path. `mode="wait"` plus 340ms
   each way meant ~680ms of dead time per press, during which the autoFocus
   field in the incoming pane did not exist yet. */
const paneMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, pointerEvents: 'auto' as const },
  // Same reason as the scene crossfade in App.tsx: the outgoing pane overlaps
  // the incoming one briefly and must not take a click meant for it.
  exit: { opacity: 0, pointerEvents: 'none' as const },
  transition: { duration: 0.12, ease: EASE_OUT },
};

/**
 * What sits behind the menu.
 *
 * Six drifting school glyphs used to be the whole of it, at six per cent
 * opacity — too faint and too sparse to read as anything but specks, on a
 * screen that was otherwise seven-tenths empty. This is the first thing a
 * player sees and the frame a store page screenshot gets taken from, and it
 * was not saying that this is a card game at all.
 *
 * So the cards themselves do the work now. They are the best-looking thing
 * the project owns and they cost nothing to reuse, and every one of them is a
 * state a normal deck cannot hold — a card in superposition, a card sealed by
 * rank, a card that reads differently to the player opposite. The pitch is on
 * the table before anybody has read the paragraph.
 *
 * Kept well back: blurred, low contrast, slow. It must never compete with the
 * panel in front of it.
 */
function MenuBackdrop() {
  const glyphs = useMemo(() => {
    const entries = Object.values(SCHOOLS);
    return entries.map((s, i) => ({
      id: s.id,
      accent: s.accent,
      // One sigil per school, drifting behind the menu. It is the real mark
      // from the real school, not a decorative asterisk.
      sigil: SIGILS.find((g) => g.school === s.id),
      left: `${8 + (i * 15.5) % 84}%`,
      top: `${12 + ((i * 37) % 70)}%`,
      delay: i * 2.4,
      dur: 26 + i * 4,
      size: 44 + (i % 3) * 22,
    }));
  }, []);

  // Placed outside the middle third, which is where the panel sits.
  const cards = useMemo(
    () => [
      { view: MENU_QUANTUM, left: '7%', top: '17%', rot: -14, dur: 34, delay: 0 },
      { view: MENU_COURT, left: '80%', top: '11%', rot: 11, dur: 41, delay: 3 },
      { view: MENU_VEILED, left: '13%', top: '62%', rot: 8, dur: 38, delay: 6 },
      { view: MENU_DIVERGED, left: '84%', top: '58%', rot: -9, dur: 45, delay: 2 },
      { view: MENU_BACK, left: '68%', top: '80%', rot: 17, dur: 37, delay: 8 },
      { view: MENU_WILD, left: '24%', top: '86%', rot: -6, dur: 43, delay: 5 },
    ],
    [],
  );

  return (
    <div className="menu-backdrop" aria-hidden>
      {cards.map((c, i) => (
        <span
          key={i}
          className="menu-bgcard"
          style={{
            left: c.left,
            top: c.top,
            ['--rot' as string]: `${c.rot}deg`,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.dur}s`,
          }}
        >
          <Card view={c.view} size="md" tiltOnHover={false} />
        </span>
      ))}

      {glyphs.map((g) => (
        <span
          key={g.id}
          className="menu-glyph"
          style={{
            left: g.left,
            top: g.top,
            color: g.accent,
            fontSize: g.size,
            animationDelay: `${g.delay}s`,
            animationDuration: `${g.dur}s`,
          }}
        >
          {g.sigil ? <Mark kind="sigil" id={g.sigil.id} fallback={g.sigil.glyph} /> : null}
        </span>
      ))}
    </div>
  );
}
