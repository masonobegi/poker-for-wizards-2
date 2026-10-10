/**
 * Build the Steam Next Fest demo: the same game with HEXHOLD_DEMO baked in.
 *
 *   npm run build:demo                 client to dist-demo/, server to dist-server-demo/
 *   npm run package:demo:win           ...then the Windows demo into release-demo/
 *   npm run package:demo:linux         ...then the Linux (Deck) demo into release-demo/
 *
 * The demo flag is compiled into both halves, not read from the environment
 * at run time, so a packaged demo cannot be turned into the full game. It
 * builds into its own folders so the full game's dist/ (which `npm run
 * responsive` and `npm run play:pad` test against) is never overwritten.
 *
 * What a demo is and where it ends: shared/demo.ts.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
process.env.HEXHOLD_DEMO = '1';
// The terminals this is run from set it, and it turns Electron into Node.
delete process.env.ELECTRON_RUN_AS_NODE;

const { build: viteBuild } = await import('vite');
await viteBuild({ root, build: { outDir: 'dist-demo', emptyOutDir: true }, logLevel: 'warn' });
console.log('demo client  -> dist-demo/');

const { build: esbuild } = await import('esbuild');
await esbuild({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist-server-demo/index.mjs',
  external: ['bufferutil', 'utf-8-validate'],
  define: { __HEXHOLD_DEMO__: 'true' },
  banner: { js: "import{createRequire as __hxcr}from'node:module';const require=__hxcr(import.meta.url);" },
  logLevel: 'warning',
});
console.log('demo server  -> dist-server-demo/index.mjs');

const target = process.argv.includes('--win') ? '--win' : process.argv.includes('--linux') ? '--linux' : null;
if (target) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const cfg = {
    ...pkg.build,
    appId: 'com.hexhold.demo',
    productName: 'HEXHOLD Demo',
    directories: { ...pkg.build.directories, output: 'release-demo' },
    extraResources: [
      { from: 'dist-demo', to: 'client' },
      { from: 'dist-server-demo', to: 'server' },
    ],
    nsis: { ...pkg.build.nsis, shortcutName: 'HEXHOLD Demo' },
  };
  mkdirSync('release-demo', { recursive: true });
  writeFileSync('release-demo/demo-builder.json', JSON.stringify(cfg, null, 2));
  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(bin, ['electron-builder', target, '--config', 'release-demo/demo-builder.json', '--publish', 'never'], {
    stdio: 'inherit', shell: process.platform === 'win32',
  });
}
