/**
 * HEXHOLD server.
 *
 * Authoritative: the client is a renderer and an input device, nothing more.
 * Every card identity, every mana point and every shuffle lives here, because
 * half the game's mechanics are about who is allowed to know what.
 */
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { attach } from './net/io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const DEV = process.env.NODE_ENV !== 'production';

const app = express();
const http = createServer(app);

const io = new Server(http, {
  cors: DEV ? { origin: true, methods: ['GET', 'POST'] } : undefined,
  pingInterval: 15_000,
  pingTimeout: 25_000,
  maxHttpBufferSize: 1e5,
});

const rooms = attach(io);

app.get('/health', (_req, res) => {
  res.json({ ok: true, ...rooms.stats(), uptime: Math.round(process.uptime()) });
});

// In production the built client is served from the same origin. The desktop
// shell relocates both, so allow an explicit override.
const dist = process.env.CLIENT_DIR
  ? path.resolve(process.env.CLIENT_DIR)
  : path.resolve(__dirname, '..', 'dist');
app.use(express.static(dist, { maxAge: DEV ? 0 : '1h', index: false }));
app.get('*', (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) res.status(404).send('HEXHOLD client not built. Run `npm run build`.');
  });
});

http.listen(PORT, () => {
  console.log(`\n  HEXHOLD server listening on http://localhost:${PORT}`);
  console.log(`  ${DEV ? 'dev' : 'production'} mode\n`);
});

const shutdown = () => {
  console.log('\n  Closing tables…');
  io.close();
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
