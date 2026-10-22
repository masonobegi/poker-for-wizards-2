/**
 * Build the Steam Playtest: the full game, with HEXHOLD_PLAYTEST baked into
 * the client (shared/playtest.ts).
 *
 *   npm run build:playtest              client to dist-playtest/, server to dist-server/
 *   npm run package:playtest:win        ...then the Windows playtest into release-playtest/
 *   npm run package:playtest:linux      ...then the Linux (Deck) playtest into release-playtest/
 *
 * Its own appId and productName ("HEXHOLD Playtest"), so its saves live in
 * their own folder and never carry into the full game, and its own output
 * folder, which steam/steampipe/playtest/ uploads. The server is the full
 * game's own bundle: a playtest tests the real game.
 *
 * Not the same thing as `npm run build:play` (release-play/), the 3 MB Node
 * bundle for sending to a friend outside Steam.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
process.env.HEXHOLD_PLAYTEST = '1';
// The terminals this is run from set it, and it turns Electron into Node.
delete process.env.ELECTRON_RUN_AS_NODE;

// The two constants feedbackUrl() reads (shared/playtest.ts), read from the
// source because plain node does not load the extensionless .ts imports.
const url = /PLAYTEST_FEEDBACK_URL\s*=\s*'([^']*)'/.exec(readFileSync('shared/playtest.ts', 'utf8'))?.[1] ?? '';
const app = Number(/FULL_GAME_APP_ID\s*=\s*(\d+)/.exec(readFileSync('shared/demo.ts', 'utf8'))?.[1] ?? 0);
const fb = /^https:\/\//.test(url) ? url : app > 0 ? `https://steamcommunity.com/app/${app}/discussions/` : null;
if (!fb) {
  console.warn('\n  !! No feedback link: PLAYTEST_FEEDBACK_URL (shared/playtest.ts) is empty and');
  console.warn('  !! FULL_GAME_APP_ID (shared/demo.ts) is 0, so this build shows no feedback');
  console.warn('  !! button. Set one before it goes to playtesters.\n');
} else {
  console.log(`playtest feedback -> ${fb}`);
}

const { build: viteBuild } = await import('vite');
await viteBuild({ root, build: { outDir: 'dist-playtest', emptyOutDir: true }, logLevel: 'warn' });
console.log('playtest client -> dist-playtest/');

const target = process.argv.includes('--win') ? '--win' : process.argv.includes('--linux') ? '--linux' : null;
if (target) {
  const bin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(bin, ['run', 'build:server'], { stdio: 'inherit', shell: process.platform === 'win32' });
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const cfg = {
    ...pkg.build,
    appId: 'com.hexhold.playtest',
    productName: 'HEXHOLD Playtest',
    directories: { ...pkg.build.directories, output: 'release-playtest' },
    extraResources: [
      { from: 'dist-playtest', to: 'client' },
      { from: 'dist-server', to: 'server' },
    ],
    nsis: { ...pkg.build.nsis, shortcutName: 'HEXHOLD Playtest' },
  };
  mkdirSync('release-playtest', { recursive: true });
  writeFileSync('release-playtest/playtest-builder.json', JSON.stringify(cfg, null, 2));
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  // Linux: the unpacked directory, which is what a Steam depot uploads.
  const targets = target === '--linux' ? ['--linux', 'dir'] : [target];
  execFileSync(npx, ['electron-builder', ...targets, '--config', 'release-playtest/playtest-builder.json', '--publish', 'never'], {
    stdio: 'inherit', shell: process.platform === 'win32',
  });
}
