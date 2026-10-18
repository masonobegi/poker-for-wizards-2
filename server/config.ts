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

/**
 * Substituted by esbuild in a demo build (`npm run build:demo`), so the
 * packaged demo cannot be turned into the full game with an environment
 * variable. Undefined everywhere else.
 */
declare const __HEXHOLD_DEMO__: boolean | undefined;

export const config = {
  port: int('PORT', 3001, 1, 65535),

  /**
   * The Next Fest demo: runs end after DEMO_ANTES antes, three covens, no hex
   * ladder, Daily Rite or hosting. See shared/demo.ts. Read lazily, so a test
   * can switch it on.
   */
  get demo(): boolean {
    return (typeof __HEXHOLD_DEMO__ !== 'undefined' && __HEXHOLD_DEMO__ === true) || bool('HEXHOLD_DEMO', false);
  },

  /**
   * Multiplies every scheduled beat on the table — bot deliberation, the deal,
   * street changes, the payout hold. 100 is normal play and the default, so
   * this is inert unless somebody asks for it.
   *
   * It exists so a game can be recorded slowly enough to follow: the default
   * pacing is tuned for playing, where 300ms of bot think time reads as
   * responsive, and for watching, where it reads as "what just happened?".
   * Expressed in percent because env vars are integers — 300 is three times
   * slower. See `npm run record`.
   */
  pacePercent: int('HEXHOLD_PACE', 100, 10, 2000),
  host: process.env.HOST ?? '0.0.0.0',
  /**
   * Production mode: stricter CORS, long cache headers on hashed assets.
   *
   * `RAILWAY_ENVIRONMENT` is set on every Railway deployment and nowhere else.
   * Without it a deploy whose NODE_ENV did not survive the builder would run
   * with `origin: true` — every origin allowed — which is the one default
   * that is WORSE when it is wrong. A hosted deployment is production whether
   * or not the builder remembered to say so.
   *
   * A getter, like the persistence paths below and for the same reason: a
   * module-level snapshot of `process.env` is taken before anything that
   * imports this file has had a chance to set it.
   */
  get production(): boolean {
    return process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
  },

  /** Where the built client lives, if this process is also serving it. */
  clientDir: process.env.CLIENT_DIR ?? null,

  /**
   * Origins allowed to open a socket. Empty means same-origin only, which is
   * the right default for a server that also serves the client. A desktop
   * build connects from `file://` or its own loopback origin, so it sends no
   * usable Origin header and is allowed through by `null`.
   *
   * A getter, so `test/deploy.test.ts` can set the variable and read back who
   * would be let in. This is the one setting here whose failure mode is a
   * server that works perfectly for the wrong people, and a rule nothing can
   * exercise is a rule nobody can trust.
   */
  get allowedOrigins(): string[] {
    return list('ALLOWED_ORIGINS');
  },

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

  /**
   * Persist tables so a restart does not end everyone's game.
   *
   * Read lazily rather than captured at import. A module-level snapshot of
   * `process.env` is evaluated before anything that imports this module has had
   * a chance to set it — which silently pointed the save at the wrong file.
   */
  persistence: {
    get enabled(): boolean { return bool('PERSIST', true); },
    /**
     * Where the snapshot lives.
     *
     * A hosted container's filesystem is ephemeral — on Railway the whole
     * thing is replaced on every deploy — so the default lands wherever the
     * process was started and is lost with it. That is survivable, because a
     * lost snapshot costs the tables that were live at the moment of a
     * restart and nothing else.
     *
     * If a volume IS attached, use it: Railway sets
     * `RAILWAY_VOLUME_MOUNT_PATH` to its mount point, and a table that
     * survives a deploy is worth having for free. `PERSIST_FILE` still wins
     * over both, because an operator who names a path means it.
     */
    get file(): string {
      if (process.env.PERSIST_FILE) return process.env.PERSIST_FILE;
      const vol = process.env.RAILWAY_VOLUME_MOUNT_PATH;
      return vol ? `${vol.replace(/\/+$/, '')}/hexhold.db` : 'hexhold.db';
    },
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
