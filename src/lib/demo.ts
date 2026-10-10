/**
 * Whether this client was built as the Steam Next Fest demo.
 *
 * `__HEXHOLD_DEMO__` is substituted by Vite from HEXHOLD_DEMO=1 at build time
 * (see vite.config.ts and scripts/build-demo.mjs). The client only uses it to
 * shape the menu; the server is what actually enforces the demo's limits, and
 * a table says it is a demo table in `view.config.demoAntes`.
 */
import { wishlistUrl } from '@shared/demo';

declare const __HEXHOLD_DEMO__: boolean | undefined;

export const IS_DEMO: boolean = typeof __HEXHOLD_DEMO__ !== 'undefined' && __HEXHOLD_DEMO__ === true;

/**
 * Open the full game's store page. In the desktop shell a new window is
 * refused and the URL goes to the system browser (electron/main.cjs
 * setWindowOpenHandler); in a browser it opens a tab.
 */
export function openWishlist(): void {
  try { window.open(wishlistUrl(), '_blank', 'noopener'); } catch { /* nothing to open with */ }
}
