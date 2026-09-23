/**
 * The Codex — every sigil and relic, with the line explaining why it could not
 * exist at a physical table. That line is the game's thesis, so it gets equal
 * billing with the rules text.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Badge } from '@/components/ui/kit';
import { SCHOOLS, SIGILS, RARITY_COLOR, type School } from '@shared/sigils';
import { RELICS, RELIC_RARITY_COLOR } from '@shared/relics';
import { MARKS } from '@shared/cards';
import { ACHIEVEMENTS } from '@shared/achievements';
import { earned } from '@/lib/achievements';
import '@/components/achievements.css';
import './codex.css';
import { ENTER } from '@/styles/motion';

type Tab = 'sigils' | 'relics' | 'marks' | 'rules' | 'feats';

export default function Codex({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('rules');
  const [school, setSchool] = useState<School | 'all'>('all');

  const sigils = useMemo(
    () => (school === 'all' ? SIGILS : SIGILS.filter((s) => s.school === school)),
    [school],
  );

  return (
    <div className="codex">
      <header className="codex-head">
        <h2 id="codex-title" className="codex-title">Codex</h2>
        <Button tone="ghost" size="sm" onClick={onClose}>Close</Button>
      </header>

      <nav className="codex-tabs" role="tablist">
        {(['rules', 'sigils', 'relics', 'marks', 'feats'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`codex-tab ${tab === t ? 'is-on' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'rules' ? <Rules /> : null}
      {tab === 'feats' ? <Feats /> : null}

      {tab === 'sigils' ? (
        <>
          <div className="codex-filters">
            <button
              className={`codex-chip ${school === 'all' ? 'is-on' : ''}`}
              onClick={() => setSchool('all')}
            >
              All
            </button>
            {Object.values(SCHOOLS).map((s) => (
              <button
                key={s.id}
                className={`codex-chip ${school === s.id ? 'is-on' : ''}`}
                style={{ ['--chip' as string]: s.accent }}
                onClick={() => setSchool(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>

          {school !== 'all' ? (
            <p className="codex-motto" style={{ color: SCHOOLS[school].accent }}>
              &ldquo;{SCHOOLS[school].motto}&rdquo;
            </p>
          ) : null}

          <ul className="codex-list">
            {sigils.map((s, i) => (
              <motion.li
                key={s.id}
                className="codex-entry"
                style={{ ['--accent' as string]: SCHOOLS[s.school].accent }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...ENTER, delay: Math.min(i * 0.06, 0.3) }}
              >
                <div className="codex-glyph">{s.glyph}</div>
                <div className="codex-body">
                  <div className="codex-row">
                    <strong>{s.name}</strong>
                    <span className="codex-meta">
                      <Badge>{s.cost} mana</Badge>
                      <span style={{ color: RARITY_COLOR[s.rarity] }}>{s.rarity}</span>
                    </span>
                  </div>
                  <p className="codex-text">{s.text}</p>
                  <p className="codex-impossible">
                    <span aria-hidden>⧉</span> {s.impossible}
                  </p>
                </div>
              </motion.li>
            ))}
          </ul>
        </>
      ) : null}

      {tab === 'relics' ? (
        <ul className="codex-list">
          {RELICS.map((r) => (
            <li key={r.id} className="codex-entry" style={{ ['--accent' as string]: RELIC_RARITY_COLOR[r.rarity] }}>
              <div className="codex-glyph">{r.glyph}</div>
              <div className="codex-body">
                <div className="codex-row">
                  <strong>{r.name}</strong>
                  <span className="codex-meta">
                    <Badge tone="gold">{r.price} shards</Badge>
                    <span style={{ color: RELIC_RARITY_COLOR[r.rarity] }}>{r.rarity}</span>
                  </span>
                </div>
                <p className="codex-text">{r.text}</p>
                <p className="codex-impossible"><span aria-hidden>⧉</span> {r.impossible}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'marks' ? (
        <ul className="codex-list">
          {Object.values(MARKS).map((m) => (
            <li key={m.id} className="codex-entry" style={{ ['--accent' as string]: m.color }}>
              <div className="codex-glyph" style={{ color: m.color }}>{m.glyph}</div>
              <div className="codex-body">
                <div className="codex-row"><strong>{m.name}</strong></div>
                <p className="codex-text">{m.blurb}</p>
              </div>
            </li>
          ))}
          <li className="codex-note">
            Marks are bound to one specific card, not to a rank. Inscribe the Seven
            of Hearts and it stays inscribed &mdash; in this hand, and in every hand
            after, for whoever draws it next.
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function Feats() {
  const got = earned();
  const done = ACHIEVEMENTS.filter((a) => got.has(a.id)).length;

  return (
    <>
      <p className="ach-progress">{done} of {ACHIEVEMENTS.length} earned</p>
      <ul className="achlist">
        {ACHIEVEMENTS.map((a) => {
          const has = got.has(a.id);
          const secret = a.hidden && !has;
          return (
            <li key={a.id} className={`achrow ${has ? 'is-earned' : ''}`}>
              <span className="achrow-mark" aria-hidden>{has ? '✦' : '·'}</span>
              <span className="achrow-body">
                <span className="achrow-name">{secret ? 'Hidden' : a.name}</span>
                <span className="achrow-text">
                  {secret ? 'Earn it to find out what it was.' : a.text}
                </span>
              </span>
              <span className="achrow-state">{has ? 'earned' : ''}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Rules() {
  return (
    <div className="codex-rules">
      <section>
        <h3>The short version</h3>
        <p>
          It is Texas Hold&rsquo;em. Two hole cards, five community cards, four
          rounds of betting, best five-card hand takes the pot. If you already
          know poker, you already know ninety percent of this.
        </p>
      </section>

      <section>
        <h3>Mana and sigils</h3>
        <p>
          The other ten percent is <strong>mana</strong>. You gain it each street
          and spend it on <strong>sigils</strong> &mdash; spells that rewrite the
          cards. Mana is public. When an opponent is sitting on five unspent mana,
          that is information, and it should frighten you.
        </p>
        <p>
          Cast a sigil and it goes on the <strong>stack</strong>. Everyone holding
          a counterspell gets a short window to answer. The last thing cast
          resolves first &mdash; so a Nullify played after your spell resolves
          before it, and eats it.
        </p>
      </section>

      <section>
        <h3>Hands that cannot exist</h3>
        <p>
          Wild marks, mirrored cards and superposition make hands a physical deck
          cannot produce. Above a Straight Flush sit <strong>Five of a Kind</strong>,{' '}
          <strong>Flush House</strong> and <strong>Flush Five</strong>. Win with one
          and the table pays attention.
        </p>
      </section>

      <section>
        <h3>The run</h3>
        <p>
          Blinds climb every few hands. Between antes the <strong>Market</strong>{' '}
          opens and you spend <strong>shards</strong> on sigils, relics and rites.
        </p>
        <p>
          Rites inscribe a permanent mark on a card in the <em>shared</em> deck.
          The upgrade you paid for can turn up in someone else&rsquo;s hand three
          hands later. That is the trade.
        </p>
      </section>

      <section>
        <h3>What makes it impossible</h3>
        <p>
          A card can hold two identities until someone looks. A community card can
          show you a King and show the player opposite a Four, and both readings
          score. A named rank can be dealt face down before anyone has seen it. The
          river can be taken back and run again.
        </p>
        <p className="codex-closer">
          None of that survives contact with cardboard. That is the entire point.
        </p>
      </section>
    </div>
  );
}
