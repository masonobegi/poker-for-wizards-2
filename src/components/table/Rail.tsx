import { memo, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { PlayerView, TableView } from '@shared/types';
import { SIGIL_BY_ID } from '@shared/sigils';
import { RELIC_BY_ID } from '@shared/relics';
import { CardRow } from '@/components/card/CardRow';
import Avatar from '@/components/Avatar';
import ManaPips from '@/components/table/ManaPips';
import SigilCard from '@/components/table/SigilCard';
import { Tooltip } from '@/components/ui/kit';
import { useGame } from '@/store/net';
import type { Targeting } from '@/scenes/GameTable';
import { RollingNumber } from '@/components/fx/RollingNumber';
import { useCardAnchors } from '@/components/fx/useCardAnchors';
import { spellFlight, SpellFlightLayer } from '@/components/fx/SpellFlight';
import type { Vec2 } from '@/vfx/particles';

export interface RailProps {
  view: TableView;
  me: PlayerView;
  targeting: Targeting | null;
  targetableHole: boolean;
  pickedIds: string[];
  onPickCard: (id: string) => void;
  onBeginCast: (uid: string) => void;
  onCancelCast: () => void;
}

/** Relic discounts are applied server-side; mirror them so costs read true. */
function costOf(defId: string, relics: string[]): number {
  const def = SIGIL_BY_ID[defId];
  if (!def) return 0;
  let delta = 0;
  for (const id of relics) delta += RELIC_BY_ID[id]?.sigils?.costDelta ?? 0;
  return Math.max(1, def.cost + delta);
}

/** Where an untargeted (or stack-targeted) cast flies to — "out onto the table". */
function immediateFlightTarget(): Element | Vec2 {
  return document.querySelector('.stack-panel')
    ?? document.querySelector('[data-fx-pot]')
    ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
}

function RailBase({
  view, me, targeting, targetableHole, pickedIds, onPickCard, onBeginCast,
}: RailProps) {
  const discardSigil = useGame((s) => s.discardSigil);
  const castable = new Set(view.castable);
  const sigils = me.sigils ?? [];
  const winningIds = me.result?.usedIds;

  const holeRef = useRef<HTMLDivElement>(null);
  useCardAnchors(holeRef, me.hole.map((c) => c.id));

  const railRef = useRef<HTMLDivElement>(null);

  // An armed cast (waiting on a card/player pick) that never gets released —
  // the target prompt was cancelled, or the phase moved on — must not linger.
  useEffect(() => {
    if (!targeting) spellFlight.cancel();
  }, [targeting]);

  const handleBeginCast = (uid: string): void => {
    const inst = sigils.find((s) => s.uid === uid);
    const def = inst ? SIGIL_BY_ID[inst.defId] : undefined;
    const originEl = railRef.current?.querySelector(`[data-sigil-uid="${CSS.escape(uid)}"]`) ?? null;
    if (def) {
      if (def.target === 'none' || def.target === 'stack') {
        spellFlight.fireNow(originEl, immediateFlightTarget(), def.school, def.glyph);
      } else if (def.target !== 'rank' && def.target !== 'suit') {
        spellFlight.arm(originEl, def.school, def.glyph);
      } else {
        // rank / suit: the target is a value, not an element, so an
        // armed flight would only ever be cancelled. Publish where the cast
        // came from instead, and let the prompt grow out of that card rather
        // than teleporting in from screen centre.
        const r = originEl?.getBoundingClientRect();
        if (r) {
          const root = document.documentElement;
          root.style.setProperty('--prompt-origin-x', String(r.left + r.width / 2));
          root.style.setProperty('--prompt-origin-y', String(r.top + r.height / 2));
        }
      }
    }
    onBeginCast(uid);
  };

  const handlePickCard = (id: string): void => {
    spellFlight.release(document.querySelector(`[data-card-id="${CSS.escape(id)}"]`));
    onPickCard(id);
  };

  return (
    <div className="rail" ref={railRef}>
      <div className="rail-me">
        <Avatar seed={me.avatar} size={46} dim={me.folded} />
        <div className="rail-meinfo">
          <span className="rail-name">
            {me.name}
            {me.warded ? <Tooltip body="Warded — your cards cannot be targeted"><span className="rail-flag">☾</span></Tooltip> : null}
            {me.severed ? <Tooltip body="Severed — no mana this hand"><span className="rail-flag is-bad">⨯</span></Tooltip> : null}
            {me.hexed > 0 ? <Tooltip body={`Hexed ×${me.hexed}`}><span className="rail-flag is-bad">☠</span></Tooltip> : null}
          </span>
          <span className="rail-chips mono">
            <RollingNumber value={me.chips} spring={{ stiffness: 260, damping: 24, mass: 1 }} />
          </span>
        </div>

        <div className="rail-resources">
          <ManaPips value={me.mana} max={me.maxMana} />
          <Tooltip body="Shards — spend them in the market between antes">
            <span className="rail-shards mono">◆ {me.shards}</span>
          </Tooltip>
        </div>

        {me.relics.length ? (
          <div className="rail-relics">
            {me.relics.map((id) => {
              const r = RELIC_BY_ID[id];
              if (!r) return null;
              return (
                <Tooltip key={id} body={<><strong>{r.name}</strong><br />{r.text}</>}>
                  <span className="rail-relic">{r.glyph}</span>
                </Tooltip>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="rail-hole" ref={holeRef}>
        <CardRow
          views={me.hole}
          size="lg"
          fan
          fanSpread={10}
          overlap={0.16}
          highlightIds={winningIds}
          highlight="winning"
          restHighlight={me.folded ? 'dimmed' : 'none'}
          selectable={targetableHole}
          selectedIds={pickedIds}
          onCardClick={targetableHole ? handlePickCard : undefined}
        />
      </div>

      <div className="rail-sigils">
        {sigils.length === 0 ? (
          <p className="rail-nosigils">No sigils in hand</p>
        ) : null}
        <AnimatePresence mode="popLayout">
          {sigils.map((s, i) => {
            const cost = costOf(s.defId, me.relics);
            return (
              <SigilCard
                key={s.uid}
                inst={s}
                index={i}
                cost={cost}
                castable={castable.has(s.uid)}
                affordable={me.mana >= cost}
                selected={targeting?.uid === s.uid}
                onCast={handleBeginCast}
                onDiscard={sigils.length > 1 ? discardSigil : undefined}
              />
            );
          })}
        </AnimatePresence>
      </div>

      <SpellFlightLayer />
    </div>
  );
}

export default memo(RailBase);
