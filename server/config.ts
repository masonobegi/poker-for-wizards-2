/**
 * Server configuration, all of it from the environment.
 *
 * A build that is going to be run by someone other than the developer cannot
 * have its limits baked in. Everything that protects the process — room caps,
 * message rates, payload sizes, who may connect — is set here and nowhere else,
 * so an operator can see the whole attack surface in one file.
 */

const int = (name: string, fallback: number, lo: number, hi: number): number => {
  const raw = process.env[name];
  const n = raw === undefined ? fallback : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
};

const bool = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
};

const list = (name: string): string[] =>
  (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: int('PORT', 3001, 1, 65535),
  host: process.env.HOST ?? '0.0.0.0',
  production: process.env.NODE_ENV === 'production',

  /** Where the built client lives, if this process is also serving it. */
  clientDir: process.env.CLIENT_DIR ?? null,

  /**
   * Origins allowed to open a socket. Empty means same-origin only, which is
   * the right default for a server that also serves the client. A desktop
   * build connects from `file://` or its own loopback origin, so it sends no
   * usable Origin header and is allowed through by `null`.
   */
  allowedOrigins: list('ALLOWED_ORIGINS'),

  limits: {
    /** Total live tables. Beyond this, room creation is refused politely. */
    maxRooms: int('MAX_ROOMS', 500, 1, 100_000),
    /** Sockets from one address. Stops one client opening a thousand tables. */
    maxSocketsPerIp: int('MAX_SOCKETS_PER_IP', 12, 1, 1000),
    /** Rooms one address may create per hour. */
    roomsPerIpPerHour: int('ROOMS_PER_IP_PER_HOUR', 40, 1, 10_000),
    /** Messages per socket per second before it is throttled. */
    messagesPerSecond: int('MESSAGES_PER_SECOND', 25, 1, 1000),
    /** Sustained breaches before the socket is dropped. */
    floodStrikes: int('FLOOD_STRIKES', 12, 1, 1000),
    /** Largest accepted socket payload, bytes. */
    maxPayloadBytes: int('MAX_PAYLOAD_BYTES', 64 * 1024, 1024, 1024 * 1024),
    /** Idle tables are closed after this long with nobody connected. */
    idleRoomMinutes: int('IDLE_ROOM_MINUTES', 45, 1, 60 * 24),
  },

  /** Persist tables and profiles so a restart does not end everyone's game. */
  persistence: {
    enabled: bool('PERSIST', true),
    file: process.env.PERSIST_FILE ?? 'hexhold.db',
  },

  /** Printed at boot so an operator can see what they actually started. */
  describe(): string {
    return [
      `  port            ${this.port}`,
      `  mode            ${this.production ? 'production' : 'development'}`,
      `  origins         ${this.allowedOrigins.length ? this.allowedOrigins.join(', ') : 'same-origin only'}`,
      `  max rooms       ${this.limits.maxRooms}`,
      `  persistence     ${this.persistence.enabled ? this.persistence.file : 'off'}`,
    ].join('\n');
  },
};

/** Is this origin allowed to open a socket? */
export function originAllowed(origin: string | undefined): boolean {
  // No Origin header: a native client, curl, or a same-origin request.
  if (!origin) return true;
  if (!config.production) return true;
  if (config.allowedOrigins.length === 0) return false;
  if (config.allowedOrigins.includes('*')) return true;
  return config.allowedOrigins.includes(origin);
}
