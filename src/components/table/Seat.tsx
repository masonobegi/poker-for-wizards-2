import { memo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PlayerView, TableView } from '@shared/types';
import { RELIC_BY_ID } from '@shared/relics';
import { EMOTES } from '@shared/protocol';
import { CardRow } from '@/components/card/CardRow';
import Avatar from '@/components/Avatar';
import { Tooltip } from '@/components/ui/kit';
import { useGame } from '@/store/net';
import ManaPips from '@/components/table/ManaPips';
import { TurnTimer } from '@/components/fx/TurnTimer';
import { RollingNumber } from '@/components/fx/RollingNumber';
import { useCardAnchors } from '@/components/fx/useCardAnchors';
import { spellFlight } from '@/components/fx/SpellFlight';
import { ENTER, SPRING_CRISP } from '@/styles/motion';

export interface SeatProps {
  player: PlayerView;
  view: TableView;
  targetable?: boolean;
  onTarget?: (id: string) => void;
  targetableCards?: boolean;
  pickedIds?: string[];
  onPickCard?: (id: string) => void;
}

function SeatBase({
  player: p, view, targetable, onTarget, targetableCards, pickedIds = [], onPickCard,
}: SeatProps) {
  const emote = useGame((s) => s.emotes[p.id]);
  const acting = view.actingId === p.id;
  const isDealer = view.dealerSeat === p.seat;
  const winner = p.result && p.result.won > 0;

  const state = p.eliminated ? 'out'
    : p.folded ? 'folded'
      : p.allIn ? 'allin'
        : 'in';

  const cardsRef = useRef<HTMLDivElement>(null);
  useCardAnchors(cardsRef, p.hole.map((c) => c.id));

  const handleTarget = (): void => {
    spellFlight.release(document.querySelector(`[data-seat-id="${CSS.escape(p.id)}"]`));
    onTarget?.(p.id);
  };
  const handlePickCard = (id: string): void => {
    spellFlight.release(document.querySelector(`[data-card-id="${CSS.escape(id)}"]`));
    onPickCard?.(id);
  };

  return (
    <div
      className={[
        'seat',
        `is-${state}`,
        acting ? 'is-acting' : '',
        targetable ? 'is-targetable' : '',
        winner ? 'is-winner' : '',
        !p.connected && !p.isBot ? 'is-away' : '',
      ].filter(Boolean).join(' ')}
      data-seat-id={p.id}
      onClick={targetable ? handleTarget : undefined}
      role={targetable ? 'button' : undefined}
      tabIndex={targetable ? 0 : undefined}
      onKeyDown={targetable ? (e) => { if (e.key === 'Enter') handleTarget(); } : undefined}
    >
      {acting ? <TurnTimer className="seat-timer" until={view.actingUntil} total={view.config.actionSeconds} /> : null}

      <div className="seat-cards" ref={cardsRef}>
        <CardRow
          views={p.hole}
          size="sm"
          overlap={0.42}
          faceDown={false}
          highlightIds={p.result?.usedIds}
          highlight="winning"
          restHighlight={p.folded ? 'dimmed' : 'none'}
          selectable={targetableCards && !p.warded}
          selectedIds={pickedIds}
          onCardClick={targetableCards ? handlePickCard : undefined}
          tiltOnHover={false}
        />
      </div>

      <div className="seat-pod">
        <div className="seat-av">
          <Avatar seed={p.avatar} size={40} bot={p.isBot} dim={p.folded || p.eliminated} />
          {isDealer ? <span className="seat-button" title="Dealer">D</span> : null}
        </div>

        <div className="seat-info">
          <span className="seat-name">{p.name}</span>
          <span className="seat-chips mono">
            {p.eliminated ? 'OUT' : <RollingNumber value={p.chips} spring={{ stiffness: 260, damping: 24, mass: 1 }} />}
          </span>
        </div>

        <div className="seat-meta">
          <ManaPips value={p.mana} max={p.maxMana} compact />
          {p.sigilCount > 0 ? (
            <Tooltip body={`${p.sigilCount} sigil${p.sigilCount === 1 ? '' : 's'} in hand`}>
              <span className="seat-sigilcount">✦{p.sigilCount}</span>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {p.relics.length ? (
        <div className="seat-relics">
          {p.relics.slice(0, 6).map((id) => {
            const r = RELIC_BY_ID[id];
            if (!r) return null;
            return (
              <Tooltip key={id} body={<><strong>{r.name}</strong><br />{r.text}</>}>
                <span className="seat-relic">{r.glyph}</span>
              </Tooltip>
            );
          })}
        </div>
      ) : null}

      <div className="seat-flags">
        {p.warded ? <Tooltip body="Warded — their cards cannot be targeted"><span className="seat-flag">☾</span></Tooltip> : null}
        {p.severed ? <Tooltip body="Severed — no mana this hand"><span className="seat-flag is-bad">⨯</span></Tooltip> : null}
        {p.hexed > 0 ? <Tooltip body={`Hexed ×${p.hexed} — scores lower`}><span className="seat-flag is-bad">☠</span></Tooltip> : null}
      </div>

      <AnimatePresence>
        {p.bet > 0 ? (
          <motion.div
            className="seat-bet"
            initial={{ opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={SPRING_CRISP}
          >
            <span className="seat-betchip" aria-hidden />
            <span className="mono">
              {p.betVeiled ? '???' : <RollingNumber value={p.bet} spring={{ stiffness: 300, damping: 22, mass: 0.8 }} />}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {p.lastAction && !p.bet ? (
          <motion.span
            key={`${p.lastAction.kind}-${p.lastAction.at}`}
            className={`seat-action is-${p.lastAction.kind}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {p.lastAction.kind}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {emote ? (
          <motion.span
            key={emote.at}
            className="seat-emote"
            initial={{ opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={SPRING_CRISP}
          >
            {EMOTES.find((e) => e.id === emote.id)?.glyph ?? '•'}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {p.result && view.phase === 'payout' && !p.folded ? (
          <motion.div
            className={`seat-result ${p.result.impossible ? 'is-impossible' : ''}`}
            initial={{ opacity: 0, y: 8 }}
            // Rises past and away rather than retracing its entrance — the hand
            // is being cleared, not undone. Every other transient badge on this
            // seat already exits; this one used to vanish on a single frame.
            animate={{ opacity: 1, y: 0, transition: { ...ENTER, delay: 0.3 } }}
            exit={{ opacity: 0, y: -6, transition: ENTER }}
          >
            {p.result.handName}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default memo(SeatBase);
