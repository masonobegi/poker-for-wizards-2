/**
 * Quit means gone, in well under a second.
 *
 * Measured on the packaged Windows build (test/quit.mjs, 2026-10-09): after
 * Quit, the window closed in about 150ms and the shell's own JavaScript was
 * finished (save written, game server stopped, Node's 'exit' fired) within
 * about 100ms more. Then Electron's native teardown kept HEXHOLD.exe alive
 * for another 4 to 12 seconds: the GPU process and the audio service took 1.6
 * to 7 seconds to wind down, and the browser process 2 to 5 seconds after
 * them. Once, under load, over 15 seconds. app.exit() and process.exit() do
 * not skip that teardown (measured: still 3.5 to 10 seconds). For all that
 * time Steam shows the game as running, and a relaunch is refused.
 *
 * Nothing the game needs happens in that teardown. The save is written
 * synchronously while the window closes (preload, beforeunload), window state
 * on 'close', settings when they change, and the shell clears Chromium's own
 * storage at every launch. So once Electron emits 'quit', the shell ends its
 * child processes and itself directly.
 *
 * Kept free of Electron so it can be unit-tested with stand-ins.
 */

/**
 * End every child process the app reports, then this process.
 *
 * @param {{ selfPid: number, metrics: Array<{ pid: number }>, kill: (pid: number) => void, exit: (code: number) => void, before?: () => void }} io
 * @returns {number[]} the pids it asked to end (for tests)
 */
function endProcessTree({ selfPid, metrics, kill, exit, before }) {
  const ended = [];
  try { before?.(); } catch { /* never let cleanup stop the exit */ }
  for (const m of metrics ?? []) {
    if (!m || !Number.isInteger(m.pid) || m.pid <= 0 || m.pid === selfPid) continue;
    try { kill(m.pid); ended.push(m.pid); } catch { /* already gone */ }
  }
  exit(0);
  return ended;
}

module.exports = { endProcessTree };
