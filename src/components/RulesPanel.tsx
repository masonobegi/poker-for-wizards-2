/**
 * Every rule in force, in one list.
 *
 * By the fourth ante this game is being played under a dozen rules that were
 * not in it when the hand started: omens that never come off, relics each
 * player bought, a rank struck out of the deck, a hex level, somebody's
 * creed. All of that was already on screen — as a pink chip in the header, a
 * glyph on a seat, a line that scrolled past in the ledger three minutes ago
 * — and a player asked, reasonably, to be able to see "their own mods and
 * the table mods" somewhere.
 *
 * So this is that somewhere. It reads only what the table view already
 * carries, says where each rule came from, and splits it the way a player
 * thinks about it: what is true for everybody, and what is true for me.
 */
import { memo } from 'react';
import type { PlayerView, TableView } from '@shared/types';
import { OMEN_BY_ID } from '@shared/omens';
import { RELIC_BY_ID } from '@shared/relics';
import { RANK_NAME, rankPlural } from '@shared/cards';
import { COVEN_CHOICE } from '@shared/covens';
import { Mark } from '@/art/marks';

interface Rule {
  key: string;
  /** Where it came from: the word that makes it findable elsewhere. */
  from: string;
  title: string;
  text: string;
  tone?: 'good' | 'bad';
}

/** The rules every seat is playing under. */
function tableRules(view: TableView): Rule[] {
  const out: Rule[] = [];

  for (const a of view.omens) {
    const def = OMEN_BY_ID[a.id];
    if (!def) continue;
    out.push({
      key: `omen:${a.id}`,
      from: `Omen · ante ${a.ante}`,
      title: def.name,
      text: def.text + (a.rank ? ` The rank is ${rankPlural(a.rank)}.` : ''),
    });
  }

  const m = view.activeMods ?? {};
  if (m.lowWins) out.push({ key: 'low', from: 'In force', title: 'The worst hand wins', text: 'Every pot goes to the lowest hand at showdown.', tone: 'bad' });
  if (m.mergedColors) out.push({ key: 'merged', from: 'In force', title: 'Two suits, not four', text: 'Hearts and Diamonds count as one suit; Spades and Clubs count as one suit.' });
  if (m.wheelWrap) out.push({ key: 'wheel', from: 'In force', title: 'The ace bridges both ends', text: 'Queen-King-Ace-Two-Three is a straight.' });
  if (m.facesAreKings) out.push({ key: 'court', from: 'In force', title: 'The court closes ranks', text: 'Jacks and Queens may be read as Kings.' });
  if (m.flushSize && m.flushSize !== 5) out.push({ key: 'flush', from: 'In force', title: `Flushes need ${m.flushSize}`, text: `A flush is ${m.flushSize} cards of a suit instead of five.` });
  if (m.straightSize && m.straightSize !== 5) out.push({ key: 'straight', from: 'In force', title: `Straights need ${m.straightSize}`, text: `A straight is ${m.straightSize} cards in sequence instead of five.` });
  if (m.straightGap) out.push({ key: 'gap', from: 'In force', title: 'Straights may skip', text: 'A straight may skip one rank: Five, Six, Eight, Nine, Ten counts.' });
  if (m.memoryBonus) out.push({ key: 'memory', from: 'In force', title: 'The deck remembers', text: 'Every card scores one rank higher for each pot it has already won.' });
  for (const r of m.deadRanks ?? []) {
    out.push({ key: `dead:${r}`, from: 'In force', title: `No ${rankPlural(r)}`, text: `Every ${RANK_NAME[r]} is struck from every hand at this table.`, tone: 'bad' });
  }
  for (const r of m.wildRanks ?? []) {
    out.push({ key: `wild:${r}`, from: 'In force', title: `${rankPlural(r)} are Wild`, text: `Every ${RANK_NAME[r]} counts as any rank and any suit.`, tone: 'good' });
  }

  // Anything a sigil did to the whole table this hand that has no flag of its
  // own — the server writes these in words.
  for (const note of view.modNotes) {
    if (out.some((r) => r.title.toLowerCase() === note.toLowerCase())) continue;
    out.push({ key: `note:${note}`, from: 'This hand', title: note, text: 'Cast at this table this hand.' });
  }

  if (view.config.hex > 1) {
    out.push({
      key: 'hex',
      from: 'Difficulty',
      title: `Hex ${'I'.repeat(Math.min(view.config.hex - 1, 5))}`,
      text: 'The run is being played a step harder: the bots play their rules sooner and the blinds climb faster.',
    });
  }

  return out;
}

/** The rules only this player is playing under. */
function yourRules(view: TableView, me: PlayerView): Rule[] {
  const out: Rule[] = [];

  for (const id of me.relics) {
    const r = RELIC_BY_ID[id];
    if (!r) continue;
    /* "How did this happen? I don't ever remember this" — about The Last
       Word, which arrives with the coven everybody now plays (COVEN_CHOICE
       is off), so nobody chose it and nothing said where it came from. It is
       a rule of the table now, so it says so. */
    if (r.coven && !COVEN_CHOICE) {
      out.push({
        key: `creed:${id}`,
        from: 'Every seat',
        title: r.name,
        text: `${r.text} Nobody picked this: with the covens gone it is simply how this table plays, for everyone.`,
        tone: 'good',
      });
      continue;
    }
    out.push({ key: `relic:${id}`, from: r.coven ? 'Creed' : 'Relic', title: r.name, text: r.text });
  }

  if (me.warded) out.push({ key: 'warded', from: 'This hand', title: 'Warded', text: 'No sigil can target you or your cards.', tone: 'good' });
  if (me.severed) out.push({ key: 'severed', from: 'This hand', title: 'Severed', text: 'You get no mana this hand.', tone: 'bad' });
  if (me.hexed > 0) {
    out.push({
      key: 'hexed',
      from: 'This hand',
      title: me.hexed > 1 ? `Hexed ×${me.hexed}` : 'Hexed',
      text: `Your hand is read ${me.hexed === 1 ? 'one category' : `${me.hexed} categories`} lower at showdown: a flush would score as a straight.`,
      tone: 'bad',
    });
  }
  if (me.blinded) out.push({ key: 'blinded', from: 'This hand', title: 'Blinded', text: 'You cannot see your own cards.', tone: 'bad' });

  out.push({
    key: 'supply',
    from: 'Always',
    title: 'Mana and sigils',
    text: `+${me.manaRegen} mana at the start of every street, up to ${me.maxMana}. `
      + `${me.sigilDraw} new sigils each hand, up to ${me.sigilMax} in hand. `
      + 'Unmaking a sigil gives a mana back.',
  });

  return out;
}

function RuleList({ rules, empty }: { rules: Rule[]; empty: string }) {
  if (rules.length === 0) return <p className="rules-empty">{empty}</p>;
  return (
    <ul className="rules-list">
      {rules.map((r) => (
        <li key={r.key} className={`rules-item ${r.tone ? `is-${r.tone}` : ''}`}>
          <span className="rules-from">{r.from}</span>
          <strong className="rules-title">{r.title}</strong>
          <p className="rules-text">{r.text}</p>
        </li>
      ))}
    </ul>
  );
}

function RulesPanelBase({ view, me, className = '' }: {
  view: TableView;
  me: PlayerView;
  className?: string;
}) {
  const table = tableRules(view);
  const mine = yourRules(view, me);

  return (
    <section className={`rules panel ${className}`}>
      <div className="rules-scroll">
        <h3 className="rules-head">
          <Mark kind="ui" id="impossible" /> This table
          <span className="rules-count">{table.length}</span>
        </h3>
        <RuleList rules={table} empty="Ordinary poker, so far. The first omen lands at ante 2." />

        <h3 className="rules-head">You<span className="rules-count">{mine.length}</span></h3>
        <RuleList rules={mine} empty="Nothing of your own yet — the Market sells relics between antes." />
      </div>
    </section>
  );
}

export default memo(RulesPanelBase);
