import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { SCHOOLS, SIGIL_BY_ID, RARITY_COLOR, type SigilInstance } from '@shared/sigils';

export interface SigilCardProps {
  inst: SigilInstance;
  castable: boolean;
  cost: number;
  affordable: boolean;
  selected?: boolean;
  onCast?: (uid: string) => void;
  onDiscard?: (uid: string) => void;
  index?: number;
  compact?: boolean;
}

function SigilCardBase({
  inst, castable, cost, affordable, selected, onCast, onDiscard, index = 0, compact,
}: SigilCardProps) {
  const def = SIGIL_BY_ID[inst.defId];
  if (!def) return null;
  const school = SCHOOLS[def.school];
  const usable = castable && affordable;

  // A quick pop the instant a sigil crosses from locked to castable (mana
  // just filled the last pip) — a "you can act now" cue, not a loop.
  const wasUsable = useRef(usable);
  const [justUsable, setJustUsable] = useState(false);
  useEffect(() => {
    if (usable && !wasUsable.current) {
      setJustUsable(true);
      const t = window.setTimeout(() => setJustUsable(false), 260);
      wasUsable.current = usable;
      return () => window.clearTimeout(t);
    }
    wasUsable.current = usable;
    return undefined;
  }, [usable]);

  return (
    <motion.div
      className={[
        'sigil',
        usable ? 'is-castable' : 'is-locked',
        selected ? 'is-selected' : '',
        compact ? 'is-compact' : '',
        justUsable ? 'is-justcastable' : '',
      ].filter(Boolean).join(' ')}
      data-sigil-uid={inst.uid}
      style={{
        ['--school' as string]: school.accent,
        ['--school-deep' as string]: school.glow,
        ['--rarity' as string]: RARITY_COLOR[def.rarity],
      }}
      initial={{ opacity: 0, y: 28, rotateZ: -4 }}
      animate={{ opacity: 1, y: 0, rotateZ: 0 }}
      exit={{ opacity: 0, y: 20, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26, delay: index * 0.04 }}
      whileHover={usable ? { y: -14, scale: 1.05, zIndex: 5 } : { y: -5 }}
      onClick={() => { if (usable) onCast?.(inst.uid); }}
      role={usable ? 'button' : undefined}
      tabIndex={usable ? 0 : -1}
      onKeyDown={(e) => { if (usable && e.key === 'Enter') onCast?.(inst.uid); }}
      aria-label={`${def.name}, ${cost} mana`}
    >
      <div className="sigil-frame">
        <header className="sigil-head">
          <span className="sigil-cost mono">{cost}</span>
          <span className="sigil-school">{school.name}</span>
        </header>

        <div className="sigil-glyph">{def.glyph}</div>

        <h4 className="sigil-name">{def.name}</h4>

        {!compact ? <p className="sigil-text">{def.text}</p> : null}

        <footer className="sigil-foot">
          <span className="sigil-rarity">{def.rarity}</span>
          {def.timing.includes('response') ? (
            <span className="sigil-timing">response</span>
          ) : null}
        </footer>
      </div>

      {onDiscard ? (
        <button
          className="sigil-discard"
          title="Unmake for 1 mana"
          aria-label={`Unmake ${def.name} for one mana`}
          onClick={(e) => { e.stopPropagation(); onDiscard(inst.uid); }}
        >
          ⌫
        </button>
      ) : null}

      <div className="sigil-tip" role="tooltip">
        <strong>{def.name}</strong>
        <p>{def.text}</p>
        <p className="sigil-impossible"><span aria-hidden>⧉</span> {def.impossible}</p>
        {!affordable ? <p className="sigil-warn">Not enough mana.</p> : null}
        {affordable && !castable ? <p className="sigil-warn">Cannot be cast right now.</p> : null}
      </div>
    </motion.div>
  );
}

export default memo(SigilCardBase);
