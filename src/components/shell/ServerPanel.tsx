/**
 * Choosing a server.
 *
 * Out of the box a desktop build plays offline against bots and hosts for the
 * local network, and a browser build talks to whatever served it. Playing with
 * someone who is not on your network means pointing at a server somebody has
 * deployed, and that has to be doable from inside the game rather than by
 * rebuilding it.
 */
import { useEffect, useState } from 'react';
import { Button, Field } from '@/components/ui/kit';
import { useGame } from '@/store/net';
import {
  defaultServerUrl, isDesktop, isUsingDefaultServer,
  normalizeServerUrl, probeServer, readServerUrl,
} from '@/lib/server';
import './server.css';

type Probe =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; rooms: number; players: number; version: string }
  | { state: 'bad'; error: string };

export default function ServerPanel({ onClose }: { onClose: () => void }) {
  const useServer = useGame((s) => s.useServer);
  const connected = useGame((s) => s.connected);

  const [current] = useState(() => readServerUrl());
  const [input, setInput] = useState(() => (isUsingDefaultServer() ? '' : readServerUrl()));
  const [probe, setProbe] = useState<Probe>({ state: 'idle' });
  const [live, setLive] = useState<Probe>({ state: 'idle' });

  // Report on the server actually in use, so "connected" is more than a dot.
  useEffect(() => {
    let cancelled = false;
    setLive({ state: 'checking' });
    void probeServer(current).then((r) => {
      if (cancelled) return;
      setLive(r.ok
        ? { state: 'ok', rooms: r.rooms, players: r.players, version: r.version }
        : { state: 'bad', error: r.error });
    });
    return () => { cancelled = true; };
  }, [current]);

  const test = async () => {
    const url = normalizeServerUrl(input);
    if (!url) { setProbe({ state: 'bad', error: 'That does not look like an address' }); return; }
    setProbe({ state: 'checking' });
    const r = await probeServer(url);
    setProbe(r.ok
      ? { state: 'ok', rooms: r.rooms, players: r.players, version: r.version }
      : { state: 'bad', error: r.error });
  };

  const apply = () => {
    const url = normalizeServerUrl(input);
    if (!url) { setProbe({ state: 'bad', error: 'That does not look like an address' }); return; }
    useServer(url);
    onClose();
  };

  const reset = () => {
    useServer(null);
    onClose();
  };

  return (
    <div className="srv">
      <header className="row spread">
        <h2 className="srv-title">Online</h2>
        <Button tone="ghost" size="sm" onClick={onClose}>Close</Button>
      </header>

      <section className="srv-current">
        <span className="eyebrow">Currently playing on</span>
        <code className="srv-url">{current}</code>
        <div className="srv-state">
          <span className={connected ? 'pulse-dot' : 'pulse-dot off'} />
          {live.state === 'checking' ? <span className="dim">checking…</span> : null}
          {live.state === 'ok' ? (
            <span className="dim">
              {live.players} player{live.players === 1 ? '' : 's'} across {live.rooms} table
              {live.rooms === 1 ? '' : 's'} · v{live.version}
            </span>
          ) : null}
          {live.state === 'bad' ? <span className="srv-bad">{live.error}</span> : null}
        </div>
      </section>

      <p className="srv-note">
        {isDesktop()
          ? 'HEXHOLD runs its own server inside this app, so single player and anyone on your network work with no setup. To play with someone further away, point it at a server one of you is hosting.'
          : 'This client talks to whatever server sent it. Point it somewhere else to join a table hosted elsewhere.'}
      </p>

      <Field
        label="Server address"
        placeholder={defaultServerUrl()}
        value={input}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => { setInput(e.target.value); setProbe({ state: 'idle' }); }}
        onKeyDown={(e) => { if (e.key === 'Enter') void test(); }}
        hint="For example hexhold.example.com, or 192.168.1.20:3001 on your network."
      />

      {probe.state === 'ok' ? (
        <p className="srv-good">
          Reachable — {probe.players} player{probe.players === 1 ? '' : 's'} on {probe.rooms} table
          {probe.rooms === 1 ? '' : 's'} (v{probe.version}).
        </p>
      ) : null}
      {probe.state === 'bad' ? <p className="srv-bad">{probe.error}</p> : null}

      <div className="srv-actions">
        <Button onClick={() => void test()} loading={probe.state === 'checking'} disabled={!input.trim()}>
          Test
        </Button>
        <Button tone="primary" onClick={apply} disabled={!input.trim()}>
          Use this server
        </Button>
      </div>

      {!isUsingDefaultServer() ? (
        <Button tone="ghost" size="sm" block onClick={reset}>
          Back to the built-in server
        </Button>
      ) : null}

      <details className="srv-help">
        <summary>Hosting one yourself</summary>
        <p>
          The repository ships a <code>Dockerfile</code> and a{' '}
          <code>docker-compose.yml</code>. On any machine with Docker:
        </p>
        <pre>docker compose up -d --build</pre>
        <p>
          That serves the game and the socket on port 3001. Give your players
          the address and they can put it in this box. If they are joining from
          a browser on another domain, set <code>ALLOWED_ORIGINS</code> to that
          domain; desktop builds need no such setting.
        </p>
      </details>
    </div>
  );
}
