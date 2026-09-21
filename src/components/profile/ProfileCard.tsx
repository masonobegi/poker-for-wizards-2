import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { OMEN_BY_ID } from '@shared/omens';
import { RELIC_BY_ID } from '@shared/relics';
import { IMPOSSIBLE_CATS, type Cat } from '@shared/hand';
import { catName, loadProfile } from './profile';
import './profile.css';

/**
 * The reason to start another run.
 *
 * Deliberately shows the best thing that has ever happened rather than a
 * win rate — a Flush Five from three days ago is a better hook than a
 * percentage, and it is the only place the game's headline hands get to be
 * a personal record instead of a rules footnote.
 */
export default function ProfileCard() {
  const [profile] = useState(() => loadProfile());
  const t = profile.totals;

  const last = profile.runs[0];
  const bestIsImpossible = useMemo(
    () => t.bestCat >= 0 && IMPOSSIBLE_CATS.has(t.bestCat as Cat),
    [t.bestCat],
  );

  if (t.runs === 0) return null;

  return (
    <motion.section
      className="profile"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      aria-label="Your record"
    >
      <div className="profile-row">
        <Stat label="Runs" value={String(t.runs)} />
        <Stat label="Won" value={String(t.wins)} good={t.wins > 0} />
        <Stat label="Pots" value={String(t.handsWon)} />
        <Stat label="Deepest" value={`Ante ${t.deepestAnte}`} />
      </div>

      {t.bestHand ? (
        <div className={`profile-best ${bestIsImpossible ? 'is-impossible' : ''}`}>
          <span className="profile-bestlabel">Best hand</span>
          <strong>{t.bestHand || catName(t.bestCat)}</strong>
          {bestIsImpossible ? <span className="profile-tag">impossible</span> : null}
        </div>
      ) : null}

      {t.impossible > 0 ? (
        <p className="profile-note">
          {t.impossible} impossible hand{t.impossible === 1 ? '' : 's'} landed.
        </p>
      ) : null}

      {(t.omensSeen.length > 0 || t.relicsOwned.length > 0) ? (
        <div className="profile-glyphs">
          {t.omensSeen.slice(0, 10).map((id) => {
            const o = OMEN_BY_ID[id];
            return o ? (
              <span key={`o${id}`} className="profile-glyph is-omen" title={`${o.name} — ${o.text}`}>
                {o.glyph}
              </span>
            ) : null;
          })}
          {t.relicsOwned.slice(0, 10).map((id) => {
            const r = RELIC_BY_ID[id];
            return r ? (
              <span key={`r${id}`} className="profile-glyph" title={`${r.name} — ${r.text}`}>
                {r.glyph}
              </span>
            ) : null;
          })}
        </div>
      ) : null}

      {last ? (
        <p className="profile-last">
          Last run:{' '}
          {last.won
            ? 'took the table'
            : `${ordinal(last.placement)} of ${last.players}`}
          {last.bestHand ? ` — ${last.bestHand}` : ''}
        </p>
      ) : null}
    </motion.section>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <span className="profile-stat">
      <span className={`profile-value mono ${good ? 'is-good' : ''}`}>{value}</span>
      <span className="profile-label">{label}</span>
    </span>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
