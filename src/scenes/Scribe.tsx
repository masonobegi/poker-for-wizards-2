/**
 * The Market's blank page: write a sigil in plain words.
 *
 * The reading updates as you type, from the same reader the server uses, so
 * what you see is what you will be charged for. Anything the reader could not
 * use is said out loud. When it cannot read the words at all it says so and
 * points at the ready-made spells, which are always on the page for anyone
 * who would rather tap than type — or who is holding a controller.
 */
import { useMemo, useState } from 'react';
import type { PlayerView, TableView } from '@shared/types';
import { SCRIBE_PRESETS, readSpell } from '@shared/scribe';
import { hexPrice } from '@shared/hexes';
import { SCHOOLS, defOf } from '@shared/sigils';
import { Button } from '@/components/ui/kit';
import { useGame } from '@/store/net';

const STREET: Record<string, string> = {
  deal: 'the deal', preflop: 'pre-flop', flop: 'flop', turn: 'turn', river: 'river', showdown: 'showdown',
};

export default function Scribe({
  view, me, uid, onClose,
}: { view: TableView; me: PlayerView; uid: string; onClose: () => void }) {
  const scribe = useGame((s) => s.scribe);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Hand size is the server's call (relics change it); it says so when full,
  // and from then on the page asks which sigil to give up.
  const [replace, setReplace] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  const roster = useMemo(() => ({
    selfId: me.id,
    players: view.players.filter((p) => !p.eliminated).map((p) => ({ id: p.id, name: p.name })),
  }), [me.id, view.players]);

  const read = useMemo(() => (text.trim() ? readSpell(text, roster) : null), [text, roster]);
  const spell = read?.ok ? read.spell : undefined;
  const price = spell ? hexPrice(spell.price, view.config.hex ?? 1, false) : 0;
  const short = spell ? me.shards < price : false;

  const write = async (words: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setServerError(null);
    const r = await scribe(uid, words, replace ?? undefined);
    setBusy(false);
    if (r.ok) { onClose(); return; }
    if (/hand is full/i.test(r.error ?? '')) setFull(true);
    setServerError(r.error ?? 'The page would not take it.');
  };

  return (
    <section className="scribe" aria-label="Write a sigil">
      <header className="scribe-head">
        <h3 className="scribe-title">A Blank Page</h3>
        <p className="scribe-sub">
          Say what the sigil does. Name players, or describe them &mdash; &ldquo;the chip leader&rdquo;,
          &ldquo;whoever raised last&rdquo;, &ldquo;everyone&rdquo;. Up to three effects, joined by
          &ldquo;and&rdquo; or &ldquo;then&rdquo;.
        </p>
      </header>

      <textarea
        className="scribe-input"
        value={text}
        maxLength={160}
        rows={2}
        placeholder="burn the river and see the chip leader's cards"
        aria-label="Your sigil, in words"
        onChange={(e) => { setText(e.target.value); setServerError(null); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && spell && !short) { e.preventDefault(); void write(text); }
        }}
      />

      <div className="scribe-reading" aria-live="polite">
        {!read ? (
          <p className="scribe-hint">Or pick one of the ready-made spells below.</p>
        ) : read.ok && spell ? (
          <>
            <ul className="scribe-chips">
              {read.understood.map((u, i) => (
                <li key={i} className="scribe-chip" style={{ ['--accent' as string]: SCHOOLS[spell.school].accent }}>{u}</li>
              ))}
            </ul>
            <p className="scribe-cost">
              <strong className="mono">{spell.cost}</strong> mana to cast
              {' · '}castable on {spell.timing.map((t) => STREET[t] ?? t).join(', ')}
              {' · '}<strong className="mono">◆ {price}</strong> to write
            </p>
          </>
        ) : (
          <p className="scribe-error">{read.error}</p>
        )}
        {read?.notes.map((n, i) => <p key={i} className="scribe-note">{n}</p>)}
        {serverError ? <p className="scribe-error">{serverError}</p> : null}
      </div>

      {full ? (
        <div className="scribe-replace" role="radiogroup" aria-label="Sigil to replace">
          <span className="scribe-note">Replace:</span>
          {(me.sigils ?? []).map((s) => (
            <button
              key={s.uid}
              type="button"
              role="radio"
              aria-checked={replace === s.uid}
              className={`scribe-preset ${replace === s.uid ? 'is-on' : ''}`}
              onClick={() => { setReplace(s.uid); setServerError(null); }}
            >
              {defOf(s)?.name ?? s.defId}
            </button>
          ))}
        </div>
      ) : null}

      <div className="scribe-presets" role="group" aria-label="Ready-made spells">
        {SCRIBE_PRESETS.map((p) => {
          const r = readSpell(p.text, roster);
          const cost = r.spell ? hexPrice(r.spell.price, view.config.hex ?? 1, false) : 0;
          return (
            <button
              key={p.text}
              type="button"
              className="scribe-preset"
              disabled={!r.ok}
              title={`"${p.text}" — ${r.spell?.cost ?? '?'} mana, ◆${cost}`}
              onClick={() => { setText(p.text); setServerError(null); }}
            >
              {p.label} <span className="mono">◆{cost}</span>
            </button>
          );
        })}
      </div>

      <footer className="scribe-foot">
        <Button tone="ghost" onClick={onClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={!spell || short || busy || (full && !replace)}
          loading={busy}
          onClick={() => void write(text)}
        >
          {short ? `Need ◆${price}` : spell ? `Write it — ◆${price}` : 'Write it'}
        </Button>
      </footer>
    </section>
  );
}
