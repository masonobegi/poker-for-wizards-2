import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('./package.json') as { version: string };

export default defineConfig({
  plugins: [react()],
  // The version a player can read off the menu, so a bug report names a
  // build. Read from package.json so the two cannot drift apart.
  // `__HEXHOLD_DEMO__` builds the Next Fest demo client (src/lib/demo.ts):
  // set HEXHOLD_DEMO=1, or run `npm run build:demo`. `__HEXHOLD_PLAYTEST__`
  // builds the Steam Playtest client (src/lib/playtest.ts): HEXHOLD_PLAYTEST=1.
  define: {
    __HEXHOLD_VERSION__: JSON.stringify(pkg.version),
    __HEXHOLD_DEMO__: JSON.stringify(process.env.HEXHOLD_DEMO === '1'),
    __HEXHOLD_PLAYTEST__: JSON.stringify(process.env.HEXHOLD_PLAYTEST === '1'),
  },
  base: './',
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      // Build outputs live inside the project; without this the dev server
      // tries to crawl the packaged client as if it were source.
      ignored: ['**/dist/**', '**/dist-server/**', '**/release/**'],
    },
  },
  optimizeDeps: {
    // Scan the real entry points only, for the same reason.
    entries: ['index.html', 'src/**/*.{ts,tsx}'],
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
