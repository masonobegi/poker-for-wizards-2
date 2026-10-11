/**
 * The desktop shell opens its window when the forked game server is
 * listening (electron/serverready.cjs), and the server goes when the shell
 * does.
 *
 * Before: the shell waited for a stdout line containing "listening", which
 * the server never printed, so every launch sat out a 6-second fallback
 * before the window was created (measured on the Linux build: the banner at
 * ~0.3s, the menu at 7 to 9s). And a game server whose shell was killed ran
 * on indefinitely (two were found still running half an hour later).
 */
import { strict as assert } from 'node:assert';
import { fork } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { waitForServer, READY_MESSAGE } = require('../electron/serverready.cjs') as {
  READY_MESSAGE: string;
  waitForServer(child: EventEmitter, opts?: {
    timeoutMs?: number;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (t: unknown) => void;
  }): Promise<void>;
};

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const settledYet = async (p: Promise<unknown>) => {
  let state = 'pending';
  p.then(() => { state = 'resolved'; }, () => { state = 'rejected'; });
  await new Promise((r) => setImmediate(r));
  return state;
};

test('the window waits for the ready message, and only that message', async () => {
  const child = new EventEmitter();
  const ready = waitForServer(child, { timeoutMs: 60_000 });
  child.emit('message', 'listening');
  child.emit('message', { type: 'something-else' });
  assert.equal(await settledYet(ready), 'pending', 'a banner or another message is not the server being ready');
  child.emit('message', { type: READY_MESSAGE, port: 1234 });
  await ready;
  assert.equal(child.listenerCount('message') + child.listenerCount('exit') + child.listenerCount('error'), 0,
    'it leaves no listeners behind');
});

test('a server that stops before it is ready is an error, not a blank window', async () => {
  const child = new EventEmitter();
  const ready = waitForServer(child, { timeoutMs: 60_000 });
  child.emit('exit', 1, null);
  await assert.rejects(ready, /stopped before it was ready \(1\)/);
});

test('a server that never answers times out with a reason', async () => {
  const child = new EventEmitter();
  const clock = { fire: () => {} };
  const ready = waitForServer(child, { timeoutMs: 20_000, setTimer: (fn) => { clock.fire = fn; return 1; }, clearTimer: () => {} });
  assert.equal(await settledYet(ready), 'pending');
  clock.fire();
  await assert.rejects(ready, /did not start within 20 seconds/);
});

const freePort = () => new Promise<number>((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address() as net.AddressInfo;
    s.close(() => resolve(port));
  });
});

test('the real server says it is listening, answers, and leaves when the shell does', async () => {
  const port = await freePort();
  const child = fork(path.join(root, 'server', 'index.ts'), [], {
    execArgv: ['--import', 'tsx'],
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', PERSIST: '0' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  try {
    const t0 = Date.now();
    await waitForServer(child, { timeoutMs: 30_000 });
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json() as { ok: boolean };
    assert.equal(health.ok, true, 'ready means it answers');
    assert.ok(Date.now() - t0 < 30_000);

    // The shell going away closes the IPC channel; the server must follow.
    const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
    child.disconnect();
    const code = await Promise.race([exited, new Promise<string>((r) => setTimeout(() => r('still running'), 8_000))]);
    assert.equal(code, 0, 'the server exits cleanly once the game is gone');
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});
