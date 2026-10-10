/**
 * Quit means gone (electron/shutdown.cjs). The packaged-build measurement is
 * test/quit.mjs; this pins the logic with stand-ins for the OS.
 */
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { endProcessTree } = require('../electron/shutdown.cjs') as {
  endProcessTree(io: {
    selfPid: number;
    metrics: Array<{ pid: number }>;
    kill(pid: number): void;
    exit(code: number): void;
    before?: () => void;
  }): number[];
};

test('quit ends every child process, then itself, in that order', () => {
  const calls: string[] = [];
  const ended = endProcessTree({
    selfPid: 100,
    metrics: [{ pid: 100 }, { pid: 201 }, { pid: 202 }, { pid: 203 }],
    kill: (pid) => calls.push(`kill ${pid}`),
    exit: (code) => calls.push(`exit ${code}`),
    before: () => calls.push('stop server'),
  });
  assert.deepEqual(calls, ['stop server', 'kill 201', 'kill 202', 'kill 203', 'exit 0']);
  assert.deepEqual(ended, [201, 202, 203], 'it must never kill itself before exiting cleanly');
});

test('a child that is already gone, a bad pid or a failing cleanup never stops the exit', () => {
  let exited = -1;
  const ended = endProcessTree({
    selfPid: 1,
    metrics: [{ pid: 0 }, { pid: -5 }, { pid: Number.NaN }, { pid: 7 }, null as never, { pid: 8 }],
    kill: (pid) => { if (pid === 7) throw new Error('ESRCH'); },
    exit: (code) => { exited = code; },
    before: () => { throw new Error('server already stopped'); },
  });
  assert.equal(exited, 0);
  assert.deepEqual(ended, [8]);
});
