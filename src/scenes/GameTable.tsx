import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame, useMe, useView } from '@/store/net';
import { SIGIL_BY_ID, type SigilDef } from '@shared/sigils';
import type { SigilTargets } from '@shared/types';
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
import Codex from '@/components/Codex';
import SettingsPanel from '@/components/SettingsPanel';
import Shop from '@/scenes/Shop';
import GameOver from '@/components/table/GameOver';
import OmenBar from '@/components/OmenBar';
import Hints from '@/components/onboarding/Hints';

import './table.css';

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

function arcPosition(i: number, n: number): { left: string; top: string } {
  if (n === 1) return { left: '50%', top: `${ARC_TOP - ARC_RY}%` };
  const spread = n <= 3 ? 130 : n === 4 ? 156 : 176;
  const start = 180 + (180 - spread) / 2;
  const angle = (start + (spread * i) / (n - 1)) * (Math.PI / 180);
  return {
    left: `${50 + Math.cos(angle) * ARC_RX}%`,
    top: `${ARC_TOP + Math.sin(angle) * ARC_RY}%`,
  };
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
  const [codex, setCodex] = useState(false);
  const [settings, setSettings] = useState(false);
  const [side, setSide] = useState<'log' | 'chat'>('log');
  // Below 1100px `.tbl-side` (the ledger/chat rail) is hidden for room — this
  // gives it back as an on-demand drawer instead, so the log stays reachable.
  const [logOpen, setLogOpen] = useState(false);

  // Any phase change invalidates a half-finished target selection.
  useEffect(() => { setTargeting(null); }, [view?.phase, view?.handNumber]);

  const beginCast = useCallback((uid: string) => {
    const inst = me?.sigils?.find((s) => s.uid === uid);
    const def = inst ? SIGIL_BY_ID[inst.defId] : undefined;
    if (!def) return;
    if (def.target === 'none' || def.target === 'stack') {
      cast(uid, {});
      return;
    }
    setTargeting({ uid, def, picked: [] });
  }, [me?.sigils, cast]);

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

  const sideTabs = (
    <div className="tbl-sidetabs">
      <button
        className={`tbl-sidetab ${side === 'log' ? 'is-on' : ''}`}
        onClick={() => setSide('log')}
      >
        Ledger
      </button>
      <button
        className={`tbl-sidetab ${side === 'chat' ? 'is-on' : ''}`}
        onClick={() => setSide('chat')}
      >
        Talk
      </button>
    </div>
  );
  const sidePanel = side === 'log'
    ? <LogPanel entries={view.log} players={view.players} />
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
            <span className="tbl-blinds mono">
              {view.sb.toLocaleString()} / {view.bb.toLocaleString()}
            </span>
          </div>
          {view.handsUntilAnte > 0 ? (
            <span className="tbl-antesub">
              market in {view.handsUntilAnte} hand{view.handsUntilAnte === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="tbl-antesub gold">market next</span>
          )}
        </div>

        <OmenBar omens={view.omens} />

        <div className="tbl-top-r">
          <Button tone="ghost" size="sm" className="tbl-logbtn" onClick={() => setLogOpen(true)}>Log</Button>
          <Button tone="ghost" size="sm" onClick={() => setCodex(true)}>Codex</Button>
          <Button tone="ghost" size="sm" onClick={() => setSettings(true)}>Settings</Button>
        </div>
      </header>

      <main className="tbl-main">
        <div className="felt">
          <div className="felt-surface" aria-hidden />
          <div className="felt-rail" aria-hidden />

          {opponents.map((p, i) => (
            <div
              key={p.id}
              className="tbl-seatslot"
              style={arcPosition(i, opponents.length)}
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
            {view.phase === 'payout' && view.payout
              ? <ShowdownPanel key="showdown" view={view} />
              : null}
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
        onCancelCast={() => setTargeting(null)}
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
            <span className="tbl-targetglyph">{targeting.def.glyph}</span>
            <span>
              {targeting.def.name} &mdash;{' '}
              {playerTargetMode ? 'choose an opponent'
                : targeting.def.target === 'two_cards'
                  ? `choose two cards (${targeting.picked.length}/2)`
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
        {view.phase === 'shop' ? <Shop key="shop" view={view} me={me} /> : null}
      </AnimatePresence>

      <AnimatePresence>
        {view.phase === 'gameover' ? <GameOver key="over" view={view} /> : null}
      </AnimatePresence>

      <Modal open={codex} onClose={() => setCodex(false)}>
        <Codex onClose={() => setCodex(false)} />
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

      <Hints />
    </div>
  );
}
