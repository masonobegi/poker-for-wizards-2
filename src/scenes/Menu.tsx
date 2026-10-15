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
import { COVENS, DEFAULT_COVEN, covenOf, creedOf } from '@shared/covens';
import { RELIC_BY_ID } from '@shared/relics';
import { loadProfile } from '@/components/profile/profile';
import { DAILY_HEX, HEXES, dailyCoven, dailySeed, dayKey } from '@shared/hexes';
import { DEMO_ANTES, DEMO_COVENS, demoCoven } from '@shared/demo';
import { IS_DEMO, openWishlist } from '@/lib/demo';

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

function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
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
  options: ReadonlyArray<{ id: T; label: string; blurb: string; locked?: string }>;
  onPick: (v: T) => void;
}) {
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <div className="menu-pick" role="group" aria-label={legend}>
      <span className="menu-pick-legend">{legend}</span>
      <div className="menu-pick-row" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`menu-pick-btn ${o.id === value ? 'is-on' : ''} ${o.locked ? 'is-locked' : ''}`}
            aria-pressed={o.id === value}
            // Locked, not hidden: the ladder is the reason to come back, so
            // it has to be visible before it is climbable.
            aria-disabled={o.locked ? true : undefined}
            title={o.locked}
            onClick={() => { if (!o.locked) onPick(o.id); }}
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
    let id = DEFAULT_COVEN;
    try { id = localStorage.getItem('hexhold.coven') ?? DEFAULT_COVEN; } catch { /* private mode */ }
    // The demo opens three covens; anything else falls back to the first.
    return IS_DEMO ? demoCoven(id) : id;
  });
  // Re-read on every pick so the record under the blurb is the real one, not
  // whatever it was when the menu mounted.
  const [profile, setProfile] = useState(() => loadProfile());
  const covenRecord = profile.covens[coven];
  // A demo coven that is held back still says what it is, on hover, focus or
  // a tap, in the line under the picker (a tooltip never shows on a pad or a
  // touchscreen, which is how a Deck plays the demo).
  const [peek, setPeek] = useState<string | null>(null);
  const pickCoven = (id: string): void => {
    setProfile(loadProfile());
    setCoven(id);
    try { localStorage.setItem('hexhold.coven', id); } catch { /* private mode */ }
  };
  // The hex for this coven: remembered per coven, never above what is open.
  const openHex = covenRecord?.hex ?? 1;
  const [hexPicks, setHexPicks] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('hexhold.hex') ?? '{}') as Record<string, number>; } catch { return {}; }
  });
  const hex = IS_DEMO ? 1 : Math.min(openHex, Math.max(1, hexPicks[coven] ?? openHex));
  const pickHex = (level: number): void => {
    const next = { ...hexPicks, [coven]: level };
    setHexPicks(next);
    writePick('hexhold.hex', JSON.stringify(next));
  };
  const hexOptions = HEXES.map((h) => ({
    id: String(h.level),
    label: h.name.replace('Hex ', ''),
    blurb: `${h.name}. ${h.text}${h.level > 1 ? ' Every hex below it still applies.' : ''}`,
    locked: h.level > openHex
      ? `Win a run at Hex ${HEXES[h.level - 2].name.replace('Hex ', '')} as ${covenOf(coven).name} to open this.`
      : undefined,
  }));

  // The Daily Rite: the same seeded table for everyone today.
  const today = dayKey();
  const todayCoven = covenOf(dailyCoven(today));
  const todayBest = profile.daily[today];

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
        { maxPlayers: 4, private: true, botSkill: skill, speed, hex },
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

  /** Same seat-three-bots-and-deal flow, at today's seed, coven and hex. */
  const daily = async () => {
    if (!connected || practicing) return;
    setPracticing(true);
    try {
      const code = await createRoom(
        trimmed || 'Adept',
        {
          maxPlayers: 4, private: true, botSkill: 'adept', speed,
          hex: DAILY_HEX, seed: dailySeed(today),
        },
        todayCoven.id,
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
                  <stop offset="0%" stopColor="#f4f1e8" />
                  <stop offset="100%" stopColor="#a86a2a" />
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
                {COVENS.map((c) => {
                  // In the demo the other four are shown, locked: a demo
                  // should show the shape of what it is holding back.
                  const locked = IS_DEMO && !DEMO_COVENS.includes(c.id);
                  return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={coven === c.id}
                    aria-disabled={locked || undefined}
                    aria-label={locked ? `${c.name}, in the full game` : undefined}
                    className={`menu-coven ${coven === c.id ? 'is-on' : ''} ${locked ? 'is-locked' : ''}`}
                    style={{ ['--school' as string]: SCHOOLS[c.school].accent }}
                    onClick={() => { if (locked) setPeek(c.id); else { setPeek(null); pickCoven(c.id); } }}
                    onMouseEnter={locked ? () => setPeek(c.id) : undefined}
                    onMouseLeave={locked ? () => setPeek(null) : undefined}
                    onFocus={locked ? () => setPeek(c.id) : undefined}
                    onBlur={locked ? () => setPeek(null) : undefined}
                    title={locked ? undefined : c.style}
                  >
                    <span className="menu-coven__glyph" aria-hidden><Mark kind="coven" id={c.id} fallback={c.glyph} /></span>
                    <span className="menu-coven__name">{c.name}</span>
                    {locked ? (
                      <svg className="menu-coven__lock" viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                        <rect x="3" y="7" width="10" height="7" rx="1.2" fill="currentColor" />
                        <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    ) : null}
                  </button>
                  );
                })}
              </div>
              <p className="menu-covennote">
                {peek ? (
                  <>
                    <strong className="menu-covenpeek">{covenOf(peek).name}, in the full game.</strong>{' '}
                    {covenOf(peek).text}
                    <CreedLine coven={peek} />
                  </>
                ) : <>{covenOf(coven).text}<CreedLine coven={coven} /></>}
                {peek ? null : covenRecord ? (
                  <em className="menu-covenrecord">
                    {covenRecord.runs} run{covenRecord.runs === 1 ? '' : 's'}
                    {covenRecord.wins > 0 ? ` · ${covenRecord.wins} won` : ''}
                    {covenRecord.deepestAnte > 0 ? ` · deepest ante ${covenRecord.deepestAnte}` : ''}
                    {covenRecord.impossible > 0 ? ` · ${covenRecord.impossible} impossible` : ''}
                  </em>
                ) : <em className="menu-covenrecord">never played</em>}
              </p>

              {IS_DEMO ? (
                <p className="menu-demonote">
                  Demo: a run of {DEMO_ANTES} antes, as {DEMO_COVENS.length} of the {COVENS.length} covens.
                  The full game adds five hexes per coven, the Daily Rite and tables with friends.
                </p>
              ) : (
                <Picker
                  legend="Hex"
                  value={String(hex)}
                  options={hexOptions}
                  onPick={(v) => pickHex(Number(v))}
                />
              )}

              <div className="menu-actions">
                <Button tone="primary" size="lg" display block
                  loading={practicing} disabled={!connected || practicing}
                  onClick={() => void practice()}>
                  {connected ? (IS_DEMO ? 'Play the Demo' : 'Practice vs Bots') : 'Connecting…'}
                </Button>
                <p className="menu-practicenote">
                  Three bots fill the table and the first hand deals itself.
                </p>

                {IS_DEMO ? (
                  <Button size="md" block onClick={openWishlist}>
                    Wishlist on Steam
                  </Button>
                ) : null}

                {IS_DEMO ? null : (<>
                <Button size="md" block disabled={!connected || practicing}
                  onClick={() => void daily()}>
                  Daily Rite &mdash; {todayCoven.name}
                </Button>
                <p className="menu-practicenote">
                  Today&rsquo;s table, the same for everyone: one coven, Hex {HEXES[DAILY_HEX - 1].name.replace('Hex ', '')}, every deal and omen fixed.
                  {todayBest ? (
                    <em className="menu-covenrecord">
                      {todayBest.won ? 'won today' : `best today: ${ordinal(todayBest.placement)} of ${todayBest.players}, ante ${todayBest.antesSurvived}`}
                      {` · ${todayBest.attempts} attempt${todayBest.attempts === 1 ? '' : 's'}`}
                    </em>
                  ) : null}
                </p>
                </>)}

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

                {IS_DEMO ? null : (
                <div className="menu-actions-row">
                  <Button size="md" block disabled={!connected} onClick={() => setPane('host')}>
                    Host a Table
                  </Button>
                  <Button size="md" block disabled={!connected} onClick={() => setPane('join')}>
                    Join with a Code
                  </Button>
                </div>
                )}
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
                {IS_DEMO ? null : (
                  <Button tone="ghost" size="sm" onClick={() => setServer(true)}>
                    Online
                  </Button>
                )}
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

/**
 * The coven's creed, under its one-line pitch: the rule the whole run is
 * played under, which is the reason to pick one coven over another.
 */
function CreedLine({ coven }: { coven: string }): JSX.Element | null {
  const id = creedOf(covenOf(coven));
  const creed = id ? RELIC_BY_ID[id] : undefined;
  if (!creed) return null;
  return (
    <span className="menu-covencreed">
      {' '}<strong>{creed.name}:</strong> {creed.text}
    </span>
  );
}
