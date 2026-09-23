/**
 * The Market, between antes.
 *
 * Everyone shops their own stock simultaneously, so nobody is racing anybody.
 * Rites are the interesting purchase: they inscribe a card in the *shared* deck,
 * which means the upgrade you paid for can land in someone else's hand later.
 */
import { forwardRef, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PlayerView, ShopItem, TableView } from '@shared/types';
import { SCHOOLS, SIGIL_BY_ID, RARITY_COLOR } from '@shared/sigils';
import { RELIC_BY_ID, RELIC_RARITY_COLOR } from '@shared/relics';
import { MARKS } from '@shared/cards';
import { Button } from '@/components/ui/kit';
import { useGame } from '@/store/net';
import { useFinePointer } from '@/components/fx/useFinePointer';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import './shop.css';
import { EASE_OUT, ENTER_PANEL, SPRING_SOFT, T_REDUCED } from '@/styles/motion';

export default function Shop({ view, me }: { view: TableView; me: PlayerView }) {
  const reduced = useReducedMotionPref();
  const { buy, reroll, shopDone } = useGame();
  const shop = view.shop;
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!shop?.closesAt) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((shop.closesAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [shop?.closesAt]);

  if (!shop) return null;

  const others = view.players.filter((p) => !p.isYou && !p.eliminated);

  return (
    <motion.div
      className="shop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={ENTER_PANEL}
    >
      <motion.div
        className="shop-panel"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.97 }}
        transition={reduced ? { duration: T_REDUCED, ease: EASE_OUT } : SPRING_SOFT}
      >
        <header className="shop-head">
          <div>
            <h2 className="shop-title">The Market</h2>
            <p className="shop-sub">Ante {view.ante} &mdash; blinds are now {view.sb.toLocaleString()} / {view.bb.toLocaleString()}</p>
          </div>
          <div className="shop-purse">
            <span className="shop-shards mono">◆ {me.shards}</span>
            <span className="shop-clock mono">{left}s</span>
          </div>
        </header>

        <div className="shop-grid">
          <AnimatePresence mode="popLayout">
            {shop.items.map((item, i) => (
              <ShopCard
                key={item.uid}
                item={item}
                index={i}
                sold={shop.sold.includes(item.uid)}
                affordable={me.shards >= item.price}
                owned={item.kind === 'relic' && me.relics.includes(item.id)}
                onBuy={() => buy(item.uid)}
              />
            ))}
          </AnimatePresence>
        </div>

        <footer className="shop-foot">
          <Button
            tone="ghost"
            disabled={me.shards < shop.rerollCost}
            onClick={reroll}
          >
            Reroll &mdash; ◆{shop.rerollCost}
          </Button>

          <div className="shop-ready">
            {others.map((p) => (
              <span
                key={p.id}
                className={`shop-dot ${p.shopDone ? 'is-done' : ''}`}
                title={`${p.name}: ${p.shopDone ? 'ready' : 'shopping'}`}
              />
            ))}
          </div>

          <Button
            tone={me.shopDone ? 'ghost' : 'primary'}
            display
            disabled={me.shopDone}
            onClick={shopDone}
          >
            {me.shopDone ? 'Waiting…' : 'Done'}
          </Button>
        </footer>
      </motion.div>
    </motion.div>
  );
}

/** Forwards a ref because `AnimatePresence mode="popLayout"` clones with one. */
const ShopCard = forwardRef<HTMLElement, {
  item: ShopItem;
  index: number;
  sold: boolean;
  affordable: boolean;
  owned: boolean;
  onBuy: () => void;
}>(function ShopCard({ item, index, sold, affordable, owned, onBuy }, ref) {
  const finePointer = useFinePointer();
  const reduced = useReducedMotionPref();
  const info = describe(item);
  const locked = sold || !affordable || owned;

  return (
    <motion.article
      ref={ref}
      className={`shopcard ${sold ? 'is-sold' : ''} ${locked && !sold ? 'is-locked' : ''}`}
      style={{ ['--accent' as string]: info.accent }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, rotateZ: -2 }}
      animate={{ opacity: 1, y: 0, rotateZ: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      transition={reduced
        ? { duration: T_REDUCED, ease: EASE_OUT }
        : { ...SPRING_SOFT, delay: Math.min(index * 0.06, 0.3) }}
      whileHover={locked || !finePointer || reduced ? undefined : { y: -8, scale: 1.03 }}
    >
      <span className="shopcard-kind">{info.kind}</span>
      <div className="shopcard-glyph">{info.glyph}</div>
      <h3 className="shopcard-name">{info.name}</h3>
      <p className="shopcard-text">{info.text}</p>
      {info.impossible ? (
        <p className="shopcard-impossible"><span aria-hidden>⧉</span> {info.impossible}</p>
      ) : null}

      <footer className="shopcard-foot">
        {sold ? (
          <span className="shopcard-sold">Sold</span>
        ) : owned ? (
          <span className="shopcard-sold">Owned</span>
        ) : (
          <Button
            size="sm"
            tone={affordable ? 'primary' : 'ghost'}
            disabled={!affordable}
            onClick={onBuy}
            sound="shop_buy"
          >
            ◆ {item.price}
          </Button>
        )}
      </footer>
    </motion.article>
  );
});

interface Described {
  kind: string; name: string; text: string; glyph: string;
  accent: string; impossible?: string;
}

function describe(item: ShopItem): Described {
  switch (item.kind) {
    case 'sigil': {
      const d = SIGIL_BY_ID[item.id];
      return {
        kind: 'Sigil',
        name: d?.name ?? item.id,
        text: d?.text ?? '',
        glyph: d?.glyph ?? '✦',
        accent: d ? SCHOOLS[d.school].accent : 'var(--text-3)',
        impossible: d?.impossible,
      };
    }
    case 'relic': {
      const d = RELIC_BY_ID[item.id];
      return {
        kind: 'Relic',
        name: d?.name ?? item.id,
        text: d?.text ?? '',
        glyph: d?.glyph ?? '⬡',
        accent: d ? RELIC_RARITY_COLOR[d.rarity] : 'var(--text-3)',
        impossible: d?.impossible,
      };
    }
    case 'rite': {
      const m = MARKS[item.markId];
      return {
        kind: 'Rite',
        name: item.label,
        text: `${m.blurb} Permanent, and written onto the shared deck — anyone who draws that exact card gets it.`,
        glyph: m.glyph,
        accent: m.color,
        impossible: 'A deck that carries edits between games.',
      };
    }
    case 'mana':
      return {
        kind: 'Attunement',
        name: `+${item.amount} Max Mana`,
        text: 'Raises your mana ceiling for the rest of the run.',
        glyph: '◇',
        accent: 'var(--veil)',
      };
    default:
      return { kind: '', name: '', text: '', glyph: '', accent: 'var(--text-3)' };
  }
}

export { RARITY_COLOR };
