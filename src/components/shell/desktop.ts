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
  /** Present in shells built after 2026-10-09; optional so older ones still type-check. */
  display?(): Promise<DesktopDisplay | null>;
  setDisplay?(req: Partial<{ mode: DisplayMode; width: number; height: number; vsync: boolean }>): Promise<DesktopDisplay | null>;
  reportCrash?(detail: string): Promise<string>;
}

export type DisplayMode = 'windowed' | 'maximized' | 'fullscreen';

export interface DesktopDisplay {
  mode: DisplayMode;
  /** The window's content size in real screen pixels, not DIPs. */
  width: number;
  height: number;
  /** What is saved for next launch. */
  vsync: boolean;
  /** What this launch is actually running with (a VSync change needs a restart). */
  vsyncActive: boolean;
  /** Window sizes, in real screen pixels, that the display the window is on can honour. */
  sizes: { width: number; height: number }[];
}

export function getHexholdApi(): HexholdDesktopApi | undefined {
  return (window as unknown as { hexhold?: HexholdDesktopApi }).hexhold;
}

export function isDesktop(): boolean {
  try { return !!getHexholdApi()?.desktop; } catch { return false; }
}
