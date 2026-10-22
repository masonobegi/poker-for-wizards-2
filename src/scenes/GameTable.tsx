import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame, useMe, useView } from '@/store/net';
import { defOf, type SigilDef } from '@shared/sigils';
import type { SigilTargets } from '@shared/types';
import { PHYLACTERY_BEFORE_ANTE } from '@shared/hexes';
import { Button, Modal } from '@/components/ui/kit';

import Seat from '@/components/table/Seat';
import Board from '@/components/table/Board';
import Rail from '@/components/table/Rail';
import ActionBar from '@/components/table/ActionBar';
import StackOverlay from '@/components/table/StackOverlay';
import TargetPrompt from '@/components/table/TargetPrompt';
import ShowdownPanel from '@/components/table/ShowdownPanel';
import LogPanel from '@/components/LogPanel';
import ChatBox from '@/components/ChatBox';
import RulesPanel from '@/components/RulesPanel';
import Codex from '@/components/Codex';
import SettingsPanel from '@/components/SettingsPanel';
import Shop from '@/scenes/Shop';
import GameOver from '@/components/table/GameOver';
import OmenBar from '@/components/OmenBar';
import Hints from '@/components/onboarding/Hints';
import FeltDust from '@/components/table/FeltDust';
import { FeltArcana } from '@/components/table/FeltArcana';
import { useBannerIdle } from '@/components/BannerLayer';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import Deck from '@/components/table/Deck';

import './table.css';
import { Mark } from '@/art/marks';

/**
 * Where an opponent sits on the arc above the felt.
 *
 * A seat is anchored at its centre and is about 165px tall, so the vertical
 * radius has to leave half of that above the topmost seat — otherwise the
 * player sitting directly opposite has their cards cropped off the top of the
 * screen, which is exactly what happened before these numbers were measured
 * against a real 900px viewport.
 */
const ARC_TOP = 46;
const ARC_RY = 28;
const ARC_RX = 39;

/**
 * Where a seat is, as well as where it sits.
 *
 * The seat OPPOSITE you has the community cards directly underneath it, and
 * everything a seat hangs below itself — its coven mark, its relics, its
 * flags, its bet — lands on them. That was invisible while the board sat at
 * 62% of the felt and became a bet chip on the middle community card the
 * moment the board was centred on the cloth, which is where it belongs. So
 * the seat has to know it is the top one, and `table.css` puts its furniture
 * either side of the pod instead of under it.
 */
function arcPosition(i: number, n: number): { left: string; top: string; pos: 'left' | 'top' | 'right' } {
  if (n === 1) return { left: '50%', top: `${ARC_TOP - ARC_RY}%`, pos: 'top' };
  const spread = n <= 3 ? 130 : n === 4 ? 156 : 176;
  const start = 180 + (180 - spread) / 2;
  const angle = (start + (spread * i) / (n - 1)) * (Math.PI / 180);
  const dx = Math.cos(angle);
  return {
    left: `${50 + dx * ARC_RX}%`,
    top: `${ARC_TOP + Math.sin(angle) * ARC_RY}%`,
    // A quarter of the arc's width either side of centre counts as "top":
    // that is the band in which a seat is over the card strip.
    pos: dx < -0.25 ? 'left' : dx > 0.25 ? 'right' : 'top',
  };
}

/** The placement, without the `pos` that goes on the element as data. */
function seatStyle(a: { left: string; top: string }): { left: string; top: string } {
  return { left: a.left, top: a.top };
}

/**
 * However long the banners run, the Market is never held back further than
 * this. The server's shop clock is already running while the client waits,
 * so an unbounded wait would be paid for in shopping time.
 */
const MARKET_MAX_WAIT_MS = 4000;
/** The Market lands before its first-run hint is allowed on top of it. */
const MARKET_SETTLE_MS = 700;

/**
 * The ante break as a sequence rather than a pile.
 *
 * It used to be four layers at once — the last showdown, the omen banner,
 * the Market and the Market's hint — with the omen, the high point of the
 * run, buried under the other three. Now: the showdown panel leaves the
 * moment the ante turns over; the Market mounts only once the banner queue is
 * idle; its hint only once the Market has landed.
 */
function useAnteBreak(view: ReturnType<typeof useView>): {
  anteTurned: boolean; marketShown: boolean; marketSettled: boolean;
} {
  const bannerIdle = useBannerIdle();
  const reduced = useReducedMotionPref();
  const inShop = view?.phase === 'shop';

  // The ante the current hand was played at. The server raises `ante` when
  // the break begins but leaves the phase on 'payout' until the Market opens,
  // so this is how the client knows the showdown is over as a moment.
  const handAnte = useRef<{ hand: number; ante: number } | null>(null);
  if (view && handAnte.current?.hand !== view.handNumber) {
    handAnte.current = { hand: view.handNumber, ante: view.ante };
  }
  const anteTurned = !!view && !!handAnte.current && view.ante !== handAnte.current.ante;

  const [marketShown, setMarketShown] = useState(false);
  const [marketSettled, setMarketSettled] = useState(false);

  useEffect(() => {
    if (!inShop) { setMarketShown(false); setMarketSettled(false); return; }
    if (bannerIdle) { setMarketShown(true); return; }
    const id = window.setTimeout(() => setMarketShown(true), MARKET_MAX_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [inShop, bannerIdle]);

  useEffect(() => {
    if (!marketShown) return;
    const id = window.setTimeout(() => setMarketSettled(true), reduced ? 0 : MARKET_SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [marketShown, reduced]);

  return { anteTurned, marketShown: inShop && marketShown, marketSettled: inShop && marketSettled };
}

export interface Targeting {
  uid: string;
  def: SigilDef;
  picked: string[];
}

export default function GameTable() {
  const view = useView();
  const me = useMe();
  const { cast, leave } = useGame();
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  /** A targetless sigil waiting for a second click to confirm — see beginCast. */
  const [armed, setArmed] = useState<string | null>(null);
  const [codex, setCodex] = useState(false);
  const [settings, setSettings] = useState(false);
  const [side, setSide] = useState<'log' | 'chat' | 'rules'>('log');
  // Below 1100px `.tbl-side` (the ledger/chat rail) is hidden for room — this
  // gives it back as an on-demand drawer instead, so the log stays reachable.
  const [logOpen, setLogOpen] = useState(false);

  const { anteTurned, marketShown, marketSettled } = useAnteBreak(view);

  // Any phase change invalidates a half-finished target selection.
  useEffect(() => { setTargeting(null); }, [view?.phase, view?.handNumber]);

  /**
   * T opens Talk and puts the cursor in it.
   *
   * Typing at this table was hard for a new player and the reason is the
   * action shortcuts: F folds, C calls, A goes all in, and they listen to the
   * window. Start typing a sentence without having clicked into the chat box
   * first and the first word plays your hand for you. Every multiplayer game
   * solves this the same way — one key takes you to the message line — and
   * the hint under the box says which key it is.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== 't' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setSide('chat');
      setLogOpen(true);
      // After the tab has switched and the input exists.
      window.setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('.chat-input');
        input?.focus();
      }, 30);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
   * A sigil that needs no target used to fire on the first click.
   *
   * "You should more easily be able to back out of a spell if you
   * accidentally click it" — and for a targeted one you can: the prompt has a
   * Cancel, a click outside it, and now Escape. A targetless one had no step
   * between brushing the card and the mana being gone. So the first click
   * arms it and says so on the card, and the second commits. Escape, a click
   * anywhere else, or six seconds of nothing puts it back down.
   */
  const beginCast = useCallback((uid: string) => {
    const inst = me?.sigils?.find((s) => s.uid === uid);
    const def = inst ? defOf(inst) : undefined;
    if (!def) return;
    if (def.target === 'none' || def.target === 'stack') {
      if (armed === uid) { setArmed(null); cast(uid, {}); return; }
      setArmed(uid);
      return;
    }
    setArmed(null);
    setTargeting({ uid, def, picked: [] });
  }, [me?.sigils, cast, armed]);

  /* Backing out, by every gesture a player would try. Escape cancels the
     target prompt as well as an armed card — the system menu already stands
     aside while `.prompt` is up (see shell/SystemMenu). */
  useEffect(() => {
    if (!armed && !targeting) return;
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setArmed(null);
      setTargeting(null);
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [armed, targeting]);

  useEffect(() => {
    if (!armed) return;
    const away = (e: PointerEvent): void => {
      if (!(e.target as HTMLElement | null)?.closest?.('.sigil')) setArmed(null);
    };
    // Six seconds: long enough to decide, short enough that a card is never
    // left armed into a street you did not mean it for.
    const id = window.setTimeout(() => setArmed(null), 6000);
    document.addEventListener('pointerdown', away, true);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', away, true);
    };
  }, [armed]);

  // Nothing stays armed across a hand, a street or a stack opening.
  useEffect(() => { setArmed(null); }, [view?.phase, view?.handNumber, view?.stack]);

  const finishCast = useCallback((targets: SigilTargets) => {
    if (!targeting) return;
    cast(targeting.uid, targets);
    setTargeting(null);
  }, [targeting, cast]);

  /** A card was clicked while a sigil is waiting for targets. */
  const pickCard = useCallback((id: string) => {
    if (!targeting) return;
    const want = targeting.def.target === 'two_cards' ? 2 : 1;
    const next = targeting.picked.includes(id)
      ? targeting.picked.filter((x) => x !== id)
      : [...targeting.picked, id].slice(-want);
    if (next.length === want) finishCast({ cardIds: next });
    else setTargeting({ ...targeting, picked: next });
  }, [targeting, finishCast]);

  const pickPlayer = useCallback((id: string) => {
    if (!targeting || targeting.def.target !== 'player') return;
    finishCast({ playerId: id });
  }, [targeting, finishCast]);

  const opponents = useMemo(
    () => (view?.players ?? []).filter((p) => !p.isYou).sort((a, b) => a.seat - b.seat),
    [view?.players],
  );

  if (!view || !me) return null;

  const cardTargetMode = !!targeting
    && ['own_card', 'board_card', 'any_card', 'two_cards'].includes(targeting.def.target);
  const playerTargetMode = targeting?.def.target === 'player';

  const targetableBoard = cardTargetMode
    && targeting.def.target !== 'own_card';
  const targetableHole = cardTargetMode
    && targeting.def.target !== 'board_card';

  /* How many rules are in force, for the tab. A number on the tab is the
     whole point: by ante four this game is being played under a dozen rules
     that were not in it when the run started, and nothing counted them. */
  const showdownUp = view.phase === 'payout' && !!view.payout && !anteTurned;

  const ruleCount = view.omens.length + view.modNotes.length
    + (view.activeMods?.deadRanks?.length ?? 0) + me.relics.length;

  const sideTabs = (
    <div className="tbl-sidetabs">
      <button
        className={`tbl-sidetab ${side === 'log' ? 'is-on' : ''}`}
        onClick={() => setSide('log')}
      >
        Ledger
      </button>
      <button
        className={`tbl-sidetab ${side === 'rules' ? 'is-on' : ''}`}
        onClick={() => setSide('rules')}
      >
        Rules
        {ruleCount > 0 ? <span className="tbl-sidecount">{ruleCount}</span> : null}
      </button>
      <button
        className={`tbl-sidetab ${side === 'chat' ? 'is-on' : ''}`}
        onClick={() => setSide('chat')}
      >
        Talk <kbd className="tbl-sidekey">T</kbd>
      </button>
    </div>
  );
  const sidePanel = side === 'log'
    ? <LogPanel entries={view.log} players={view.players} />
    : side === 'rules'
      ? <RulesPanel view={view} me={me} className="tbl-siderules" />
      : <ChatBox compact className="tbl-sidechat" />;

  return (
    <div className="table-scene">
      <header className="tbl-top">
        <div className="tbl-top-l">
          <Button tone="ghost" size="sm" onClick={leave}>&larr; Leave</Button>
          <span className="tbl-code">{view.code}</span>
        </div>

        <div className="tbl-top-c">
          <div className="tbl-ante">
            <span className="eyebrow">Ante {view.ante}</span>
            {/* "100 / 200" never said which number was which, and the two
                blinds are what the whole betting round is measured in. */}
            <span className="tbl-blinds mono">
              <span className="tbl-blind">
                <em>small blind</em>{view.sb.toLocaleString()}
              </span>
              <span className="tbl-blind">
                <em>big blind</em>{view.bb.toLocaleString()}
              </span>
            </span>
          </div>
          {view.handsUntilAnte > 0 ? (
            <span className="tbl-antesub">
              market in {view.handsUntilAnte} hand{view.handsUntilAnte === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="tbl-antesub gold">market next</span>
          )}
          {/* Hex I's buy-back, while it can still be spent (shared/hexes.ts).
              A player should know the first bust is not the last. */}
          {me?.phylactery && view.ante < PHYLACTERY_BEFORE_ANTE ? (
            <span className="tbl-antesub tbl-phylactery" title="Your first bust before ante 3 buys you back in with a full stack. The second one ends the run.">
              phylactery until ante {PHYLACTERY_BEFORE_ANTE}
            </span>
          ) : null}
        </div>

        {/* The omen bar lives inside the right-hand cell rather than beside
            it. As a fourth child of a three-column grid it wrapped the whole
            nav onto a second row the moment the first omen landed at ante 2,
            which then overlapped the felt. */}
        <div className="tbl-top-r">
          <OmenBar omens={view.omens} />
          <Button tone="ghost" size="sm" className="tbl-logbtn" onClick={() => setLogOpen(true)}>Log</Button>
          <Button tone="ghost" size="sm" onClick={() => setCodex(true)}>Codex</Button>
          <Button tone="ghost" size="sm" onClick={() => setSettings(true)}>Settings</Button>
        </div>
      </header>

      <main className="tbl-main">
        {/* The showdown panel is anchored to the top of the felt (it must
            never run off the top — see .showdown in table.css) and it
            reproduces the board along its own top row, so while it is open
            the real strip underneath it is a duplicate the panel is sitting
            on. Fade it rather than fight the anchor. */}
        <div className={`felt ${showdownUp ? 'is-showdown' : ''}`}>
          {/* The floor, its inlay, the dither that joins its tones, and the
              motes in the light above it. The nap plate is gone: a noise
              texture is how you suggest cloth in a rendered image and the
              wrong tool entirely here — pixel art joins two flat tones with a
              checkerboard, not with grain. */}
          <div className="felt-surface" aria-hidden>
            <FeltArcana />
            <div className="felt-dither" />
            <FeltDust />
          </div>
          <div className="felt-rail" aria-hidden />

          {opponents.map((p, i) => (
            <div
              key={p.id}
              className="tbl-seatslot"
              data-seat-pos={arcPosition(i, opponents.length).pos}
              style={seatStyle(arcPosition(i, opponents.length))}
            >
              <Seat
                player={p}
                view={view}
                targetable={!!playerTargetMode && !p.folded && !p.eliminated}
                onTarget={pickPlayer}
                targetableCards={targeting?.def.target === 'any_card'}
                pickedIds={targeting?.picked ?? []}
                onPickCard={pickCard}
              />
            </div>
          ))}

          {/* The deck is the origin every dealt card now flies from, so it
              lives inside the felt and moves with it. `cut` replays the
              top-card lift on each new street and each new hand. */}
          <Deck cut={view.handNumber * 8 + view.board.length} view={view} />

          <Board
            view={view}
            targetable={targetableBoard}
            pickedIds={targeting?.picked ?? []}
            onPickCard={pickCard}
          />

          {/* Inside the felt, not fixed to the viewport, so it lands in the
              band under the pot at every resolution instead of being placed
              by an offset that only held at one window size. */}
          <AnimatePresence>
            {showdownUp ? <ShowdownPanel key="showdown" view={view} /> : null}
          </AnimatePresence>
        </div>

        <aside className="tbl-side">
          {sideTabs}
          {sidePanel}
        </aside>
      </main>

      <Rail
        view={view}
        me={me}
        targeting={targeting}
        targetableHole={targetableHole}
        pickedIds={targeting?.picked ?? []}
        onPickCard={pickCard}
        onBeginCast={beginCast}
        armedUid={armed}
        onCancelCast={() => { setArmed(null); setTargeting(null); }}
      />

      <ActionBar view={view} me={me} blocked={!!targeting || !!view.stack} />

      <AnimatePresence>
        {targeting && !cardTargetMode && !playerTargetMode ? (
          <TargetPrompt
            key="prompt"
            def={targeting.def}
            onCancel={() => setTargeting(null)}
            onConfirm={finishCast}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {targeting && (cardTargetMode || playerTargetMode) ? (
          <motion.div
            key="hint"
            className="tbl-targethint"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <span className="tbl-targetglyph"><Mark kind="sigil" id={targeting.def.id} fallback={targeting.def.glyph} /></span>
            <span>
              {targeting.def.name} &mdash;{' '}
              {playerTargetMode ? 'choose an opponent'
                : targeting.def.target === 'two_cards'
                  ? `${targeting.def.pick?.[targeting.picked.length] ?? 'choose two cards'} (${Math.min(2, targeting.picked.length + 1)} of 2)`
                  : targeting.def.target === 'own_card' ? 'choose one of your cards'
                    : targeting.def.target === 'board_card' ? 'choose a community card'
                      : 'choose a card in play'}
            </span>
            <Button size="sm" tone="ghost" onClick={() => setTargeting(null)}>Cancel</Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <StackOverlay view={view} me={me} onBeginCast={beginCast} />

      <AnimatePresence>
        {marketShown ? <Shop key="shop" view={view} me={me} /> : null}
      </AnimatePresence>

      <AnimatePresence>
        {view.phase === 'gameover' ? <GameOver key="over" view={view} /> : null}
      </AnimatePresence>

      <Modal open={codex} onClose={() => setCodex(false)}>
        <Codex unlocked={!!view.config.unlocked} onClose={() => setCodex(false)} />
      </Modal>
      <Modal open={settings} onClose={() => setSettings(false)}>
        <SettingsPanel onClose={() => setSettings(false)} />
      </Modal>
      <Modal open={logOpen} onClose={() => setLogOpen(false)}>
        <div className="tbl-logdrawer">
          {sideTabs}
          {sidePanel}
        </div>
      </Modal>

      <Hints marketSettled={marketSettled} />
    </div>
  );
}
