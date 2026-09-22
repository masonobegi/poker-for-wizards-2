/**
 * Which server this client talks to.
 *
 * A browser build talks to whatever origin served it. A desktop build talks to
 * the server it launched on loopback, which is what makes offline play and LAN
 * hosting work with nothing to configure. Either can be pointed at a public
 * server instead — that is the whole of "online multiplayer" from the client's
 * side, and it has to be changeable without a rebuild.
 *
 * Resolution order: an explicit choice the player saved, then a URL baked in
 * at build time, then the sensible default for this kind of build.
 */
const KEY = 'hexhold.server';

export interface ServerChoice {
  /** Empty string means "the default for this build". */
  url: string;
  label: string;
}

const BUILT_IN = (import.meta.env?.VITE_HEXHOLD_SERVER ?? '').trim();

export const isDesktop = (): boolean =>
  typeof window !== 'undefined'
  && !!(window as unknown as { hexhold?: { desktop?: boolean } }).hexhold?.desktop;

/** The address used when the player has not chosen one. */
export function defaultServerUrl(): string {
  if (BUILT_IN) return BUILT_IN;
  if (typeof window === 'undefined') return 'http://127.0.0.1:3001';
  // In dev the client is served by Vite on another port to the game server.
  if (import.meta.env?.DEV) return `http://${window.location.hostname}:3001`;
  return window.location.origin;
}

export function readServerUrl(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch { /* private mode */ }
  return defaultServerUrl();
}

/** Returns the normalised URL, or null when it is not usable. */
export function normalizeServerUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `http://${text}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname) return null;
    // Keep only what socket.io needs; a path or query would break the handshake.
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function writeServerUrl(url: string | null): void {
  try {
    if (url) localStorage.setItem(KEY, url);
    else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
}

export const isUsingDefaultServer = (): boolean => {
  try { return !localStorage.getItem(KEY); } catch { return true; }
};

/** Ask a server whether it is alive and has room, before committing to it. */
export async function probeServer(url: string, timeoutMs = 4000): Promise<
  { ok: true; rooms: number; players: number; version: string } | { ok: false; error: string }
> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/health`, { signal: ctl.signal, mode: 'cors' });
    if (!res.ok) return { ok: false, error: `Server replied ${res.status}` };
    const body = await res.json() as { rooms?: number; players?: number; version?: string };
    return {
      ok: true,
      rooms: body.rooms ?? 0,
      players: body.players ?? 0,
      version: body.version ?? 'unknown',
    };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return { ok: false, error: aborted ? 'No reply in time' : 'Could not reach that server' };
  } finally {
    window.clearTimeout(timer);
  }
}
