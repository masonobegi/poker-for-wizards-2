/**
 * Typed access to the bridge the Electron preload exposes at
 * `window.hexhold` (see electron/preload.cjs). Undefined in a plain browser.
 */
export interface HexholdDesktopApi {
  desktop: true;
  port(): Promise<number>;
  version(): Promise<string>;
  toggleFullscreen(on?: boolean): Promise<boolean>;
  quit(): Promise<void>;
}

export function getHexholdApi(): HexholdDesktopApi | undefined {
  return (window as unknown as { hexhold?: HexholdDesktopApi }).hexhold;
}

export function isDesktop(): boolean {
  try { return !!getHexholdApi()?.desktop; } catch { return false; }
}
