/**
 * HEXHOLD server.
 *
 * Authoritative: the client is a renderer and an input device, nothing more.
 * Every card identity, every mana point and every shuffle lives here, because
 * half the game's mechanics are about who is allowed to know what.
 *
 * This process is also the one an operator actually deploys, so it has to be
 * boring and unkillable: bounded resources, no unhandled rejections, a real
 * health endpoint, and a shutdown that lets hands finish.
 */
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { config, originAllowed } from './config';
import { attach } from './net/io';
import { guardStats, startGuardSweep } from './net/guard';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable('x-powered-by');
const http = createServer(app);

const io = new Server(http, {
  cors: config.production
    ? {
      origin: (origin, cb) => cb(null, originAllowed(origin ?? undefined)),
      methods: ['GET', 'POST'],
      credentials: false,
    }
    : { origin: true, methods: ['GET', 'POST'] },
  pingInterval: 15_000,
  pingTimeout: 25_000,
  maxHttpBufferSize: config.limits.maxPayloadBytes,
  connectionStateRecovery: {
    // A phone changing networks should not lose its seat.
    maxDisconnectionDuration: 60_000,
    skipMiddlewares: false,
  },
});

const rooms = attach(io);
const sweep = startGuardSweep();

// --- operations ------------------------------------------------------------

app.get('/health', (_req, res) => {
  const stats = rooms.stats();
  res.json({
    ok: true,
    ...stats,
    ...guardStats(),
    uptime: Math.round(process.uptime()),
    version: process.env.npm_package_version ?? '0.9.0',
  });
});

/** Liveness vs readiness, so a container orchestrator can tell them apart. */
app.get('/ready', (_req, res) => {
  const full = rooms.count >= config.limits.maxRooms;
  res.status(full ? 503 : 200).json({ ready: !full, rooms: rooms.count });
});

// --- the client ------------------------------------------------------------

const dist = config.clientDir
  ? path.resolve(config.clientDir)
  : path.resolve(__dirname, '..', 'dist');

app.use(express.static(dist, {
  maxAge: config.production ? '1h' : 0,
  index: false,
  setHeaders: (res, filePath) => {
    // Hashed asset filenames can be cached hard; the entry point cannot.
    if (/\/assets\//.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

app.get('*', (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) res.status(404).send('HEXHOLD client not built. Run `npm run build`.');
  });
});

// --- lifecycle -------------------------------------------------------------

http.listen(config.port, config.host, () => {
  console.log(`\n  HEXHOLD server on http://${config.host}:${config.port}`);
  console.log(config.describe());
  console.log('');
});

// A game server must not die because one socket handler threw.
process.on('unhandledRejection', (reason) => {
  console.error('[hexhold] unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[hexhold] uncaught exception:', err);
});

let closing = false;
const shutdown = (signal: string) => {
  if (closing) return;
  closing = true;
  console.log(`\n  ${signal} — closing tables…`);
  clearInterval(sweep);
  rooms.shutdown();
  io.close();
  http.close(() => process.exit(0));
  // Do not hang forever on a socket that will not close.
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
