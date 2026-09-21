/**
 * The omens in force.
 *
 * These are the rules that have been added to the table since the game began,
 * and they never come off. Keeping them permanently on screen is not optional:
 * by ante four a player genuinely cannot reason about their hand without
 * knowing that suits have merged and a rank has been struck out.
 */
import { memo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { OMEN_BY_ID, type ActiveOmen } from '@shared/omens';
import { RANK_NAME } from '@shared/cards';
import './omens.css';

function OmenBarBase({ omens }: { omens: ActiveOmen[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (omens.length === 0) return null;

  return (
    <div className="omens" aria-label="Rules in force at this table">
      <span className="omens-label">Omens</span>
      <ul className="omens-list">
        <AnimatePresence initial={false}>
          {omens.map((o) => {
            const def = OMEN_BY_ID[o.id];
            if (!def) return null;
            const showing = open === o.id;
            return (
              <motion.li
                key={o.id}
                layout
                initial={{ opacity: 0, scale: 0.7, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 380, damping: 24 }}
              >
                <button
                  className={`omen ${showing ? 'is-open' : ''}`}
                  onPointerEnter={() => setOpen(o.id)}
                  onPointerLeave={() => setOpen((v) => (v === o.id ? null : v))}
                  onFocus={() => setOpen(o.id)}
                  onBlur={() => setOpen((v) => (v === o.id ? null : v))}
                  onClick={() => setOpen((v) => (v === o.id ? null : o.id))}
                  aria-expanded={showing}
                >
                  <span className="omen-glyph" aria-hidden>{def.glyph}</span>
                  <span className="omen-name">{def.name}</span>
                  {o.rank ? <span className="omen-rank">{RANK_NAME[o.rank]}s</span> : null}
                </button>

                <AnimatePresence>
                  {showing ? (
                    <motion.div
                      className="omen-tip"
                      role="tooltip"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                    >
                      <strong>{def.name}</strong>
                      <p>
                        {def.text}
                        {o.rank ? ` The rank is ${RANK_NAME[o.rank]}s.` : ''}
                      </p>
                      <p className="omen-impossible">
                        <span aria-hidden>⧉</span> {def.impossible}
                      </p>
                      <span className="omen-since">Arrived at ante {o.ante}</span>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export default memo(OmenBarBase);
