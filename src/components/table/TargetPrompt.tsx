/**
 * Target pickers for sigils that ask for something other than a card or a seat:
 * a rank, a suit, or a mark to inscribe.
 */
import { motion } from 'framer-motion';
import { MARKS, RANK_LABEL, RANK_NAME, SUITS, SUIT_GLYPH, SUIT_NAME, isRed, type MarkId, type Rank } from '@shared/cards';
import { SCHOOLS, type SigilDef } from '@shared/sigils';
import type { SigilTargets } from '@shared/types';
import { Button } from '@/components/ui/kit';

const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const RITE_MARKS: MarkId[] = ['blooded', 'prism', 'echo', 'wild', 'leaden', 'cursed'];

export interface TargetPromptProps {
  def: SigilDef;
  onCancel: () => void;
  onConfirm: (targets: SigilTargets) => void;
}

export default function TargetPrompt({ def, onCancel, onConfirm }: TargetPromptProps) {
  const school = SCHOOLS[def.school];

  return (
    <motion.div
      className="prompt"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <motion.div
        className="prompt-panel"
        style={{ ['--school' as string]: school.accent }}
        initial={{ y: 24, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 16, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      >
        <header className="prompt-head">
          <span className="prompt-glyph">{def.glyph}</span>
          <div>
            <h3>{def.name}</h3>
            <p>{def.text}</p>
          </div>
        </header>

        {def.target === 'rank' ? (
          <>
            <p className="prompt-ask">Name a rank</p>
            <div className="prompt-ranks">
              {RANKS.map((r) => (
                <button
                  key={r}
                  className="prompt-rank"
                  title={RANK_NAME[r]}
                  onClick={() => onConfirm({ rank: r })}
                >
                  {RANK_LABEL[r]}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {def.target === 'suit' ? (
          <>
            <p className="prompt-ask">Name a suit</p>
            <div className="prompt-suits">
              {SUITS.map((s) => (
                <button
                  key={s}
                  className={`prompt-suit ${isRed(s) ? 'is-red' : ''}`}
                  title={SUIT_NAME[s]}
                  onClick={() => onConfirm({ suit: s })}
                >
                  {SUIT_GLYPH[s]}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {def.id === 'inscribe' ? (
          <>
            <p className="prompt-ask">Choose the mark</p>
            <div className="prompt-marks">
              {RITE_MARKS.map((m) => (
                <button
                  key={m}
                  className="prompt-mark"
                  style={{ ['--mark' as string]: MARKS[m].color }}
                  onClick={() => onConfirm({ markId: m })}
                >
                  <span className="prompt-markglyph">{MARKS[m].glyph}</span>
                  <strong>{MARKS[m].name}</strong>
                  <em>{MARKS[m].blurb}</em>
                </button>
              ))}
            </div>
          </>
        ) : null}

        <p className="prompt-impossible"><span aria-hidden>⧉</span> {def.impossible}</p>

        <Button tone="ghost" block onClick={onCancel}>Cancel</Button>
      </motion.div>
    </motion.div>
  );
}
