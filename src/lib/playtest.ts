/**
 * Whether this client was built for the Steam Playtest (shared/playtest.ts).
 *
 * `__HEXHOLD_PLAYTEST__` is substituted by Vite from HEXHOLD_PLAYTEST=1 at
 * build time (vite.config.ts, scripts/build-playtest.mjs).
 */
import { feedbackUrl } from '@shared/playtest';

declare const __HEXHOLD_PLAYTEST__: boolean | undefined;

export const IS_PLAYTEST: boolean =
  typeof __HEXHOLD_PLAYTEST__ !== 'undefined' && __HEXHOLD_PLAYTEST__ === true;

/** The feedback link for this build, or null when there is nowhere to send it. */
export const playtestFeedback = (): string | null => (IS_PLAYTEST ? feedbackUrl() : null);

/**
 * Open the feedback link. In the desktop shell a new window is refused and the
 * URL goes to the system browser (electron/main.cjs setWindowOpenHandler).
 */
export function openFeedback(): void {
  const url = playtestFeedback();
  if (!url) return;
  try { window.open(url, '_blank', 'noopener'); } catch { /* nothing to open with */ }
}
