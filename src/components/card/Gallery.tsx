/**
 * Gallery — a standalone dev page for eyeballing every visual state the card
 * layer can produce. Not part of the game itself; mount it from a debug
 * route (or temporarily swap it in for <App/>) when tuning card.css.
 *
 * Nothing here is wired to the network layer or to shared/cards' CardEntity
 * — it builds plain CardView objects directly so every combination (rank,
 * suit, mark, highlight, quantum cloud, leak) can be forced independently of
 * whether a real game would ever produce it.
 */
import { type CSSProperties, type ReactNode } from 'react';
import type { CardView, Face, MarkId, Rank, Suit } from '@shared/cards';
import { MARKS, RANKS, SUITS, faceLabel, nextCardId } from '@shared/cards';
import { Card, type CardHighlight, type CardSize } from './Card';
import { CardRow } from './CardRow';

const MARK_IDS = Object.keys(MARKS) as MarkId[];
const HIGHLIGHTS: readonly CardHighlight[] = ['none', 'winning', 'used', 'target', 'dimmed'];
const SIZES: readonly CardSize[] = ['xs', 'sm', 'md', 'lg'];

// ---------------------------------------------------------------------------
// View builders
// ---------------------------------------------------------------------------

function view(state: CardView['state'], patch: Partial<CardView> = {}): CardView {
  return {
    id: nextCardId(),
    state,
    face: null,
    marks: [],
    memory: 0,
    ...patch,
  };
}

function faceup(face: Face, patch: Partial<CardView> = {}): CardView {
  return view('faceup', { face, ...patch });
}

// ---------------------------------------------------------------------------
// Layout helpers — inline styles only; this page is dev-only scaffolding and
// deliberately doesn't add its own classes to card.css, which is scoped to
// CardArt / CardBack / Card / CardRow.
// ---------------------------------------------------------------------------

const page: CSSProperties = {
  minHeight: '100%',
  padding: '48px 40px 96px',
  background: 'var(--void)',
  color: 'var(--text)',
  fontFamily: 'var(--font-ui)',
};

const h1: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-2xl)',
  letterSpacing: '0.04em',
  color: 'var(--gold)',
  margin: '0 0 6px',
};

const intro: CSSProperties = {
  color: 'var(--text-3)',
  maxWidth: 640,
  lineHeight: 1.6,
  margin: '0 0 40px',
};

const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-lg)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-2)',
  margin: '0 0 4px',
};

const sectionNote: CSSProperties = {
  color: 'var(--text-4)',
  fontSize: 'var(--fs-sm)',
  margin: '0 0 18px',
};

const section: CSSProperties = {
  marginBottom: 56,
  paddingBottom: 40,
  borderBottom: '1px solid var(--line-soft)',
};

const swatchRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 22,
  alignItems: 'flex-end',
};

const swatch: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
};

const caption: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-xs)',
  color: 'var(--text-3)',
  letterSpacing: '0.02em',
};

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
  gap: 14,
};

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section style={section}>
      <h2 style={sectionTitle}>{title}</h2>
      {note && <p style={sectionNote}>{note}</p>}
      {children}
    </section>
  );
}

function Swatch({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={swatch}>
      {children}
      <span style={caption}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export function CardGallery() {
  const sampleFace: Face = { rank: 13, suit: 'S' };

  return (
    <div className="app" style={page}>
      <h1 style={h1}>HEXHOLD — Card Gallery</h1>
      <p style={intro}>
        Every state, size, mark and highlight the card layer can render, side by side, so a change to
        card.css can be eyeballed instead of guessed at. Not part of the game — dev use only.
      </p>

      <Section title="Sizes" note="md is the --card-w / --card-h token pair; xs/sm/lg scale from it.">
        <div style={swatchRow}>
          {SIZES.map((size) => (
            <Swatch key={size} label={size}>
              <Card view={faceup(sampleFace)} size={size} />
            </Swatch>
          ))}
        </div>
      </Section>

      <Section
        title="States"
        note="facedown, faceup, quantum (holder's cloud vs. an observer's unknown field), and veiled (rank leaked / suit leaked)."
      >
        <div style={swatchRow}>
          <Swatch label="facedown">
            <Card view={view('facedown')} />
          </Swatch>
          <Swatch label="faceup">
            <Card view={faceup(sampleFace)} />
          </Swatch>
          <Swatch label="quantum · seen">
            <Card
              view={view('quantum', {
                possible: [
                  { rank: 14, suit: 'S' },
                  { rank: 13, suit: 'H' },
                  { rank: 9, suit: 'D' },
                ],
              })}
            />
          </Swatch>
          <Swatch label="quantum · hidden">
            <Card view={view('quantum')} />
          </Swatch>
          <Swatch label="veiled · rank leaked">
            <Card view={view('veiled', { rank: 12 })} />
          </Swatch>
          <Swatch label="veiled · suit leaked">
            <Card view={view('veiled', { suit: 'H' })} />
          </Swatch>
        </div>
      </Section>

      <Section
        title="Special flags"
        note="diverged, entangled and memory can layer on top of any faceup card."
      >
        <div style={swatchRow}>
          <Swatch label="diverged">
            <Card view={faceup(sampleFace, { diverged: true })} />
          </Swatch>
          <Swatch label="entangled">
            <Card view={faceup(sampleFace, { entangled: true })} />
          </Swatch>
          <Swatch label="memory · 3">
            <Card view={faceup(sampleFace, { memory: 3 })} />
          </Swatch>
          <Swatch label="memory · 12">
            <Card view={faceup(sampleFace, { memory: 12 })} />
          </Swatch>
          <Swatch label="diverged + entangled + memory">
            <Card view={faceup(sampleFace, { diverged: true, entangled: true, memory: 2 })} />
          </Swatch>
        </div>
      </Section>

      <Section title="Marks" note="One inscription each; wild, blooded, cursed, burning and echo carry a full-card effect too.">
        <div style={grid}>
          {MARK_IDS.map((id) => (
            <Swatch key={id} label={MARKS[id].name}>
              <Card view={faceup({ rank: 11, suit: 'C' }, { marks: [id] })} size="sm" />
            </Swatch>
          ))}
        </div>
      </Section>

      <Section title="Highlights" note="none / winning / used / target / dimmed.">
        <div style={swatchRow}>
          {HIGHLIGHTS.map((h) => (
            <Swatch key={h} label={h}>
              <Card view={faceup({ rank: 14, suit: 'H' })} highlight={h} />
            </Swatch>
          ))}
        </div>
      </Section>

      <Section title="Rows" note="A straight overlapping row (the board) and a fanned hand (the player's own hole cards).">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <CardRow
            views={RANKS.slice(0, 5).map((rank) => faceup({ rank, suit: 'D' }))}
            size="md"
            label="Board, straight"
          />
          <CardRow
            views={[
              faceup({ rank: 14, suit: 'S' }),
              faceup({ rank: 13, suit: 'S' }),
            ]}
            size="lg"
            fan
            label="Hole cards, fanned"
          />
        </div>
      </Section>

      <Section title="Every rank, every suit" note={`${RANKS.length} ranks × ${SUITS.length} suits = ${RANKS.length * SUITS.length} faces.`}>
        <div style={grid}>
          {SUITS.map((suit: Suit) =>
            RANKS.map((rank: Rank) => (
              <Swatch key={`${rank}${suit}`} label={faceLabel({ rank, suit })}>
                <Card view={faceup({ rank, suit })} size="sm" />
              </Swatch>
            )),
          )}
        </div>
      </Section>
    </div>
  );
}

export default CardGallery;
