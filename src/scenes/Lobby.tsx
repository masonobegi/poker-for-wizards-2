import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge, Button, Modal, Range, Toggle } from '@/components/ui/kit';
import { useGame, useIsHost, useView } from '@/store/net';
import { playSfx } from '@/lib/sound';
import Avatar from '@/components/Avatar';
import ChatBox from '@/components/ChatBox';
import Codex from '@/components/Codex';
import './lobby.css';

export default function Lobby() {
  const view = useView();
  const isHost = useIsHost();
  const { setReady, startGame, addBot, kick, leave, setConfig } = useGame();
  const [copied, setCopied] = useState(false);
  const [codex, setCodex] = useState(false);
  const [tuning, setTuning] = useState(false);

  if (!view) return null;

  const me = view.players.find((p) => p.isYou);
  const seats = [...view.players].sort((a, b) => a.seat - b.seat);
  const empty = Math.max(0, view.config.maxPlayers - seats.length);
  const enough = seats.length >= 2;
  const allReady = seats.every((p) => p.ready || p.isBot);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(view.code);
      setCopied(true);
      playSfx('ui_confirm');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="lobby">
      <header className="lobby-head">
        <Button tone="ghost" size="sm" onClick={leave}>&larr; Leave</Button>
        <div className="lobby-headmid">
          <span className="eyebrow">Table Code</span>
          <button className="lobby-code" onClick={() => void copyCode()} title="Copy to clipboard">
            {view.code}
            <span className="lobby-copy">{copied ? 'copied' : 'copy'}</span>
          </button>
        </div>
        <Button tone="ghost" size="sm" onClick={() => setCodex(true)}>Codex</Button>
      </header>

      <div className="lobby-body">
        <section className="lobby-seats panel">
          <div className="panel-head">
            <span className="panel-title">
              Seats &mdash; {seats.length} / {view.config.maxPlayers}
            </span>
            {isHost ? (
              <div className="row" style={{ gap: 6 }}>
                <Button size="sm" tone="ghost" disabled={!seats.some((p) => p.isBot)}
                  onClick={() => addBot(false)}>&minus; Bot</Button>
                <Button size="sm" tone="ghost" disabled={empty === 0}
                  onClick={() => addBot(true)}>+ Bot</Button>
              </div>
            ) : null}
          </div>

          <ul className="lobby-list">
            <AnimatePresence initial={false}>
              {seats.map((p) => (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 14 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className={`lobby-seat ${p.ready || p.isBot ? 'is-ready' : ''}`}
                >
                  <Avatar seed={p.avatar} size={38} bot={p.isBot} />
                  <div className="lobby-who">
                    <span className="lobby-name">
                      {p.name}
                      {p.isYou ? <span className="lobby-you">you</span> : null}
                    </span>
                    <span className="lobby-sub">
                      {p.id === view.hostId ? 'Host' : p.isBot ? 'Bot' : 'Player'}
                    </span>
                  </div>
                  {p.isBot ? <Badge>ready</Badge>
                    : p.ready ? <Badge tone="good">ready</Badge>
                      : <Badge>waiting</Badge>}
                  {isHost && !p.isYou ? (
                    <button className="lobby-kick" onClick={() => kick(p.id)} title="Remove">
                      &times;
                    </button>
                  ) : null}
                </motion.li>
              ))}
            </AnimatePresence>

            {Array.from({ length: empty }, (_, i) => (
              <li key={`empty-${i}`} className="lobby-seat is-empty">
                <div className="lobby-emptyav" />
                <span className="lobby-sub">Empty seat</span>
              </li>
            ))}
          </ul>

          <div className="lobby-actions">
            {!me?.isBot ? (
              <Button
                tone={me?.ready ? 'ghost' : 'good'}
                block
                onClick={() => setReady(!me?.ready)}
              >
                {me?.ready ? 'Not ready' : "I'm ready"}
              </Button>
            ) : null}

            {isHost ? (
              <Button
                tone="primary"
                display
                block
                size="lg"
                disabled={!enough}
                onClick={startGame}
              >
                {enough ? 'Deal the first hand' : 'Need two players'}
              </Button>
            ) : (
              <p className="lobby-wait">
                {allReady ? 'Waiting on the host to deal…' : 'Waiting for the table…'}
              </p>
            )}

            {isHost ? (
              <Button tone="ghost" size="sm" block onClick={() => setTuning(true)}>
                Table rules
              </Button>
            ) : null}
          </div>
        </section>

        <aside className="lobby-side">
          <div className="lobby-rules panel">
            <div className="panel-head"><span className="panel-title">This table</span></div>
            <dl className="lobby-dl">
              <Row k="Starting chips" v={view.config.startingChips.toLocaleString()} />
              <Row k="Blinds" v={`${view.sb.toLocaleString()} / ${view.bb.toLocaleString()}`} />
              <Row k="Hands per ante" v={String(view.config.handsPerAnte)} />
              <Row k="Starting shards" v={String(view.config.startingShards)} />
              <Row k="Clock" v={`${view.config.actionSeconds}s`} />
              <Row k="Magic" v={view.config.magicEnabled ? 'Enabled' : 'Disabled'} />
            </dl>
            {view.config.magicEnabled ? (
              <p className="lobby-blurb">
                Everyone opens with a <strong>Nullify</strong> and one random sigil,
                so the first bluff is never free.
              </p>
            ) : (
              <p className="lobby-blurb">
                Magic is off. This is plain No-Limit Hold&rsquo;em.
              </p>
            )}
          </div>

          <ChatBox className="lobby-chat" />
        </aside>
      </div>

      <Modal open={codex} onClose={() => setCodex(false)}>
        <Codex onClose={() => setCodex(false)} />
      </Modal>

      <Modal open={tuning} onClose={() => setTuning(false)}>
        <RulesEditor
          config={view.config}
          onChange={setConfig}
          onClose={() => setTuning(false)}
        />
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="lobby-dlrow">
      <dt>{k}</dt>
      <dd className="mono">{v}</dd>
    </div>
  );
}

function RulesEditor({ config, onChange, onClose }: {
  config: import('@shared/types').RoomConfig;
  onChange: (p: Partial<import('@shared/types').RoomConfig>) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 'var(--s-5)' }}>
      <header className="row spread">
        <h2 style={{
          fontSize: 'var(--fs-xl)', letterSpacing: '.22em',
          textTransform: 'uppercase', color: 'var(--gold)',
        }}>
          Table Rules
        </h2>
        <Button tone="ghost" size="sm" onClick={onClose}>Done</Button>
      </header>

      <Tune label="Starting chips" value={config.startingChips} min={2000} max={100000} step={1000}
        onChange={(v) => onChange({ startingChips: v })} fmt={(v) => v.toLocaleString()} />
      <Tune label="Big blind" value={config.baseBlind} min={50} max={2000} step={50}
        onChange={(v) => onChange({ baseBlind: v })} fmt={(v) => v.toLocaleString()} />
      <Tune label="Hands per ante" value={config.handsPerAnte} min={1} max={12} step={1}
        onChange={(v) => onChange({ handsPerAnte: v })} />
      <Tune label="Starting shards" value={config.startingShards} min={0} max={60} step={2}
        onChange={(v) => onChange({ startingShards: v })} />
      <Tune label="Action clock" value={config.actionSeconds} min={10} max={90} step={5}
        onChange={(v) => onChange({ actionSeconds: v })} fmt={(v) => `${v}s`} />
      <Tune label="Response window" value={config.responseSeconds} min={3} max={20} step={1}
        onChange={(v) => onChange({ responseSeconds: v })} fmt={(v) => `${v}s`} />
      <Tune label="Market time" value={config.shopSeconds} min={20} max={180} step={10}
        onChange={(v) => onChange({ shopSeconds: v })} fmt={(v) => `${v}s`} />

      <hr className="rule" />

      <Toggle
        checked={config.magicEnabled}
        onChange={(v) => onChange({ magicEnabled: v })}
        label="Magic enabled"
      />
      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)', lineHeight: 1.6 }}>
        Turning magic off leaves plain No-Limit Hold&rsquo;em — useful for teaching
        someone the betting before the deck starts misbehaving.
      </p>
    </div>
  );
}

function Tune({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span className="row spread" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
        <span style={{ letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600 }}>
          {label}
        </span>
        <span className="mono gold">{fmt ? fmt(value) : value}</span>
      </span>
      <Range min={min} max={max} step={step} value={value} onChange={onChange} />
    </label>
  );
}
