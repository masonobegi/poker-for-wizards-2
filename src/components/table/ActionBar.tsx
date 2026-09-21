import { memo, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PlayerView, TableView } from '@shared/types';
import { Button, Range } from '@/components/ui/kit';
import { useGame } from '@/store/net';
import { playSfx } from '@/lib/sound';
import { TurnTimer } from '@/components/fx/TurnTimer';

export interface ActionBarProps {
  view: TableView;
  me: PlayerView;
  blocked: boolean;
}

function ActionBarBase({ view, me, blocked }: ActionBarProps) {
  const act = useGame((s) => s.act);
  const yourTurn = view.yourTurn && !blocked;

  const maxTotal = me.bet + me.chips;
  const minRaise = view.currentBet > 0
    ? Math.min(maxTotal, view.currentBet + view.minRaise)
    : Math.min(maxTotal, Math.max(view.bb, view.minRaise));

  const [amount, setAmount] = useState(minRaise);
  const [raising, setRaising] = useState(false);

  // Re-anchor the slider whenever the betting picture changes under it.
  useEffect(() => {
    setAmount(minRaise);
    setRaising(false);
  }, [view.currentBet, view.phase, view.handNumber, minRaise]);

  const pot = view.pot;
  const presets = useMemo(() => {
    const raw: Array<{ label: string; value: number }> = [
      { label: '⅓', value: view.currentBet + Math.round(pot / 3) },
      { label: '½', value: view.currentBet + Math.round(pot / 2) },
      { label: 'Pot', value: view.currentBet + pot },
    ];
    return raw
      .map((p) => ({ ...p, value: Math.min(maxTotal, Math.max(minRaise, p.value)) }))
      .filter((p, i, arr) => arr.findIndex((q) => q.value === p.value) === i)
      .filter((p) => p.value < maxTotal);
  }, [view.currentBet, pot, maxTotal, minRaise]);

  const send = (fn: () => void) => { fn(); setRaising(false); };
  const canRaise = me.chips > 0 && maxTotal > view.currentBet;
  const isBet = view.currentBet === 0;

  // Keyboard shortcuts — poker is a fast game and the mouse is slow.
  useEffect(() => {
    if (!yourTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === 'f') send(() => act({ kind: 'fold' }));
      else if (k === 'c') send(() => act(view.canCheck ? { kind: 'check' } : { kind: 'call' }));
      else if (k === 'r' && canRaise) setRaising((v) => !v);
      else if (k === 'a' && canRaise) send(() => act({ kind: 'allin' }));
      else if (k === 'enter' && raising) send(() => act({ kind: isBet ? 'bet' : 'raise', amount }));
      else if (k === 'escape') setRaising(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [yourTurn, view.canCheck, canRaise, raising, amount, isBet, act]);

  const waiting = !view.yourTurn && !me.folded && !me.eliminated
    && ['preflop', 'flop', 'turn', 'river'].includes(view.phase);

  return (
    <div className="actionbar">
      {yourTurn ? (
        <div className="ab-clock">
          <TurnTimer until={view.actingUntil} total={view.config.actionSeconds} size={46} sound />
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {yourTurn ? (
          <motion.div
            key="acting"
            className="ab-inner"
            initial={{ opacity: 0, y: 42, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 480, damping: 28, mass: 0.9 }}
          >
            <AnimatePresence>
              {raising ? (
                <motion.div
                  className="ab-raise"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="ab-raisetop">
                    <span className="eyebrow">{isBet ? 'Bet' : 'Raise to'}</span>
                    <span className="ab-amount mono">{amount.toLocaleString()}</span>
                  </div>
                  <Range
                    min={minRaise}
                    max={maxTotal}
                    step={Math.max(1, Math.round(view.bb / 4))}
                    value={amount}
                    onChange={(v) => setAmount(v)}
                    onPointerUp={() => playSfx('ui_tick', { vol: 0.4 })}
                    aria-label="Bet amount"
                  />
                  <div className="ab-presets">
                    {presets.map((p) => (
                      <button
                        key={p.label}
                        className={`ab-preset ${amount === p.value ? 'is-on' : ''}`}
                        onClick={() => { setAmount(p.value); playSfx('ui_hover'); }}
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      className={`ab-preset ${amount === maxTotal ? 'is-on' : ''}`}
                      onClick={() => { setAmount(maxTotal); playSfx('ui_hover'); }}
                    >
                      Max
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="ab-buttons">
              <Button tone="danger" size="lg" onClick={() => send(() => act({ kind: 'fold' }))}>
                Fold <kbd>F</kbd>
              </Button>

              {view.canCheck ? (
                <Button size="lg" onClick={() => send(() => act({ kind: 'check' }))}>
                  Check <kbd>C</kbd>
                </Button>
              ) : (
                <Button size="lg" onClick={() => send(() => act({ kind: 'call' }))}>
                  Call <span className="mono">{view.toCall.toLocaleString()}</span> <kbd>C</kbd>
                </Button>
              )}

              {canRaise ? (
                raising ? (
                  <Button
                    tone="primary" size="lg"
                    onClick={() => send(() => act({ kind: isBet ? 'bet' : 'raise', amount }))}
                  >
                    {amount >= maxTotal ? 'All In' : `${isBet ? 'Bet' : 'Raise'} ${amount.toLocaleString()}`}
                  </Button>
                ) : (
                  <Button tone="primary" size="lg" onClick={() => setRaising(true)}>
                    {isBet ? 'Bet' : 'Raise'} <kbd>R</kbd>
                  </Button>
                )
              ) : null}

              {raising ? (
                <Button tone="ghost" size="lg" onClick={() => setRaising(false)}>Back</Button>
              ) : canRaise ? (
                <Button tone="ghost" size="lg" onClick={() => send(() => act({ kind: 'allin' }))}>
                  All In <kbd>A</kbd>
                </Button>
              ) : null}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            className="ab-idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {me.eliminated ? 'You are out of the game'
              : me.folded ? 'You folded this hand'
                : view.stack ? 'A sigil is resolving…'
                  : blocked ? 'Choose a target'
                    : waiting ? 'Waiting for the table…'
                      : ''}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(ActionBarBase);
