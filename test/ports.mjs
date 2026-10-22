/**
 * Ports and switches the browser harnesses share.
 *
 * freePorts(n): n ports nobody is listening on, held together so they differ.
 * The OS picks them, unless HEXHOLD_PORT_RANGE (e.g. "5600-5699") says where
 * to look: a machine shared with other sessions, each keeping to its own
 * range, should not find a harness's game server on a port someone else's
 * tool is about to take.
 *
 * covenChoice(): whether the coven picker is on (COVEN_CHOICE in
 * shared/covens.ts), read from the source the build was made from, so a
 * harness expects the menu the build actually has and still fails when a
 * picker that should be there is not.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const range = (() => {
  const m = /^(\d+)-(\d+)$/.exec(process.env.HEXHOLD_PORT_RANGE ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
})();

const hold = (port) => new Promise((done) => {
  const s = createServer();
  s.once('error', () => done(null));
  s.listen(port, '127.0.0.1', () => done(s));
});

export async function freePorts(n) {
  const held = [];
  if (range) {
    for (let p = range[0]; p <= range[1] && held.length < n; p++) {
      const s = await hold(p);
      if (s) held.push(s);
    }
    if (held.length < n) throw new Error(`HEXHOLD_PORT_RANGE ${range.join('-')} has fewer than ${n} free ports`);
  } else {
    while (held.length < n) held.push(await hold(0));
  }
  const ports = held.map((s) => s.address().port);
  await Promise.all(held.map((s) => new Promise((r) => s.close(r))));
  return ports;
}

export const freePort = async () => (await freePorts(1))[0];

export function covenChoice() {
  const src = readFileSync(path.join(root, 'shared', 'covens.ts'), 'utf8');
  const m = /export const COVEN_CHOICE\s*=\s*(true|false)/.exec(src);
  if (!m) throw new Error('COVEN_CHOICE not found in shared/covens.ts');
  return m[1] === 'true';
}
