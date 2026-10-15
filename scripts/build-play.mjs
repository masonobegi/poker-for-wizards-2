/**
 * Build the playtest bundle — the version you send to someone.
 *
 *   npm run build:play        -> release-play/HEXHOLD-play/ and HEXHOLD-play.zip
 *
 * It is the whole game, client and server, in a folder that needs nothing but
 * Node 20: no install, no node_modules, no internet. About three megabytes.
 *
 * WHY NOT THE ELECTRON BUILD. `npm run package:win` makes the same game in a
 * window and it is 153 MB compressed, because it carries its own copy of
 * Chromium. For "can you try this and tell me if it's fun" that ratio is the
 * whole argument: fifty times smaller, and it opens in the browser they
 * already have.
 *
 * WHY IT IS A SCRIPT. The first one of these was assembled by hand — build,
 * copy two folders, write a .bat, zip it — which worked exactly once and then
 * sat on disk going stale while the game was rebuilt around it. Every time the
 * look changed the bundle was wrong and nobody could tell by looking at it. A
 * build you cannot repeat is a build you cannot trust, so this is the
 * repeatable version and the hand-made one is gone.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
// The terminals this is run from set it, and it turns Electron into Node.
delete process.env.ELECTRON_RUN_AS_NODE;

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const OUT = join(root, 'release-play');
const DIR = join(OUT, 'HEXHOLD-play');
const ZIP = join(OUT, 'HEXHOLD-play.zip');

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root });

// --- 1. the client ---------------------------------------------------------
console.log('building client...');
const { build: viteBuild } = await import('vite');
await viteBuild({ root, logLevel: 'warn' });

// --- 2. the server, as one file -------------------------------------------
console.log('bundling server...');
const { build: esbuild } = await import('esbuild');
await esbuild({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: join(OUT, '.tmp-server.mjs'),
  external: ['bufferutil', 'utf-8-validate'],
  banner: { js: "import{createRequire as __hxcr}from'node:module';const require=__hxcr(import.meta.url);" },
  logLevel: 'warning',
});

// --- 3. assemble -----------------------------------------------------------
rmSync(DIR, { recursive: true, force: true });
mkdirSync(join(DIR, 'server'), { recursive: true });
cpSync(join(root, 'dist'), join(DIR, 'dist'), { recursive: true });
cpSync(join(OUT, '.tmp-server.mjs'), join(DIR, 'server', 'index.mjs'));
rmSync(join(OUT, '.tmp-server.mjs'), { force: true });

writeFileSync(join(DIR, 'PLAY-HEXHOLD.bat'), [
  '@echo off',
  'title HEXHOLD',
  'echo Starting HEXHOLD...',
  'start "" http://localhost:3001',
  'node server\\index.mjs',
  'echo.',
  'echo HEXHOLD stopped. If nothing opened, make sure Node 20+ is installed.',
  'pause',
].join('\r\n') + '\r\n');

writeFileSync(join(DIR, 'play.sh'), [
  '#!/usr/bin/env bash',
  '# macOS and Linux. Windows: double-click PLAY-HEXHOLD.bat',
  'cd "$(dirname "$0")"',
  '(sleep 1; (command -v xdg-open >/dev/null && xdg-open http://localhost:3001) \\',
  '  || (command -v open >/dev/null && open http://localhost:3001) || true) &',
  'exec node server/index.mjs',
  '',
].join('\n'));
try { execFileSync('chmod', ['+x', join(DIR, 'play.sh')]); } catch { /* not fatal */ }

writeFileSync(join(DIR, 'README.txt'), `HEXHOLD ${pkg.version} - playtest build
==============================

Needs Node 20 or newer (node --version). Nothing else - no install, no
node_modules, no internet. Everything is in this folder.

WINDOWS
  Double-click PLAY-HEXHOLD.bat
  Your browser opens on http://localhost:3001

MAC / LINUX
  ./play.sh

ANY PLATFORM
  node server/index.mjs
  then open http://localhost:3001

To stop it, close the window (or Ctrl+C).

PLAYING
  "Practice vs Bots" on the menu deals you in against three of them.
  Opponents:   Novice / Adept / Master
  Table speed: Relaxed / Standard / Blitz
  Hex I-V raise the difficulty; the Daily Rite is one seeded run a day.

  It is Texas Hold'em with a magic layer: every player holds sigils that
  bend the deck, and the hands you can make with them are ones a normal
  deck cannot produce. Settings has a Codex with every card in it.

WHY NOT AN .EXE
  The Electron desktop build is the same game in a window, but it is 153 MB
  compressed because it carries its own copy of Chromium. This is 3 MB and
  runs in the browser you already have. Build the desktop one yourself any
  time with:  npm run package:win
`);

// --- 4. zip ----------------------------------------------------------------
rmSync(ZIP, { force: true });
let zipped = false;
try {
  run('zip', ['-rq', ZIP, 'HEXHOLD-play']);
  zipped = true;
} catch {
  console.warn('no `zip` on PATH — the folder is built, the archive is not');
}

// --- 5. say what was made --------------------------------------------------
const bytes = (p) => {
  let n = 0;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const q = join(p, e.name);
    n += e.isDirectory() ? bytes(q) : statSync(q).size;
  }
  return n;
};
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(`\nplaytest build -> ${DIR}  (${mb(bytes(DIR))} on disk)`);
if (zipped && existsSync(ZIP)) console.log(`archive        -> ${ZIP}  (${mb(statSync(ZIP).size)})`);
