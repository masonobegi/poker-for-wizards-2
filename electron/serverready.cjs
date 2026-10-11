/**
 * When the forked game server can answer, and not before.
 *
 * The shell used to wait for a stdout line containing "listening". The server
 * has never printed one (its banner says "HEXHOLD server on ..."), so every
 * launch sat out the 6-second fallback before the window was even created:
 * six seconds of nothing after Play, on every machine. And on a machine slow
 * enough to need longer than that, the window loaded a port nobody was
 * listening on yet.
 *
 * Now the server says so over the fork's IPC channel the moment `listen`
 * calls back (server/index.ts), and this waits for exactly that.
 * test/serverready.test.ts forks the real server to hold the two ends to the
 * same message.
 */
const READY_MESSAGE = 'hexhold:listening';

/**
 * Resolve when `child` reports it is listening; reject if it exits, fails to
 * spawn, or stays silent for `timeoutMs`.
 *
 * @param {import('node:events').EventEmitter} child a forked ChildProcess (or a stand-in)
 * @param {{ timeoutMs?: number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout }} [opts]
 * @returns {Promise<void>}
 */
function waitForServer(child, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const setTimer = opts.setTimer ?? setTimeout;
  const clearTimer = opts.clearTimer ?? clearTimeout;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimer(timer);
      child.removeListener('message', onMessage);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      if (err) reject(err); else resolve();
    };
    const onMessage = (m) => { if (m && typeof m === 'object' && m.type === READY_MESSAGE) finish(); };
    const onExit = (code, signal) => finish(new Error(
      `the game server stopped before it was ready (${code ?? signal ?? 'no exit code'})`));
    const onError = (err) => finish(err instanceof Error ? err : new Error(String(err)));
    child.on('message', onMessage);
    child.on('exit', onExit);
    child.on('error', onError);
    if (!settled) timer = setTimer(() => finish(new Error(
      `the game server did not start within ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
  });
}

module.exports = { waitForServer, READY_MESSAGE };
