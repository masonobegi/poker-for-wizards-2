/**
 * Window-size arithmetic for the Video settings, and the release menu. Pure,
 * so it can be tested without Electron (test/display.test.ts).
 *
 * Electron measures windows in device-independent pixels (DIPs). The presets
 * are labelled in real pixels, because that is what a player means by
 * "1920×1080". On a display scaled to 150%, one DIP is 1.5 pixels, so before
 * 2026-10-09 "1920×1080" made a 2880×1620 window there, and on a 1080p laptop
 * at 150% every preset was filtered out and the row came up empty.
 */
const WINDOW_SIZES = [
  [1280, 720], [1280, 800], [1366, 768], [1600, 900],
  [1920, 1080], [1920, 1200], [2560, 1440], [3840, 2160],
];

/** The smallest window the layout is built for, frame included, in DIPs. */
const MIN_WINDOW = { width: 1024, height: 680 };

/** A window's title bar and borders, in DIPs, when it cannot be measured. */
const DEFAULT_FRAME = { width: 16, height: 40 };

const scale = (sf) => (Number.isFinite(sf) && sf > 0 ? sf : 1);

/** A size in real pixels, as DIPs on a display with this scale factor. */
function toDip(size, scaleFactor) {
  const sf = scale(scaleFactor);
  return { width: Math.round(size.width / sf), height: Math.round(size.height / sf) };
}

/**
 * A content size in DIPs, as real pixels. Snaps to a preset within rounding,
 * so the button for the size the player picked still reads as selected.
 */
function toPixels(size, scaleFactor) {
  const sf = scale(scaleFactor);
  const width = Math.round(size.width * sf);
  const height = Math.round(size.height * sf);
  const preset = WINDOW_SIZES.find(([w, h]) => Math.abs(w - width) <= 2 && Math.abs(h - height) <= 2);
  return preset ? { width: preset[0], height: preset[1] } : { width, height };
}

/**
 * The presets, in real pixels, that this display can honour as a window:
 * the content plus the frame fits the work area, and the window is not
 * smaller than the minimum Electron would silently enforce instead.
 */
function fittingSizes({ workArea, scaleFactor, frame = DEFAULT_FRAME, min = MIN_WINDOW }) {
  const f = {
    width: Math.max(frame.width | 0, 0),
    height: Math.max(frame.height | 0, 0),
  };
  return WINDOW_SIZES
    .filter(([width, height]) => {
      const dip = toDip({ width, height }, scaleFactor);
      const outer = { width: dip.width + f.width, height: dip.height + f.height };
      return outer.width <= workArea.width && outer.height <= workArea.height
        && outer.width >= min.width && outer.height >= min.height;
    })
    .map(([width, height]) => ({ width, height }));
}

/** The frame around a window's content, falling back when it reads as none. */
function frameOf(outer, content) {
  const width = outer.width - content.width;
  const height = outer.height - content.height;
  return width > 0 && height > 0 ? { width, height } : { ...DEFAULT_FRAME };
}

/**
 * The minimum window size, shrunk to fit the smallest attached display. A
 * 1080p laptop at 150% has a work area about 672 DIPs tall, under the 680 the
 * layout prefers; a minimum taller than the screen pushes the window under
 * the taskbar.
 */
function minWindowSize(workAreas) {
  const areas = (workAreas ?? []).filter((a) => a && a.width > 0 && a.height > 0);
  return {
    width: Math.min(MIN_WINDOW.width, ...areas.map((a) => a.width)),
    height: Math.min(MIN_WINDOW.height, ...areas.map((a) => a.height)),
  };
}

/**
 * The application menu for a release build.
 *
 * Windows and Linux get none: Electron's default menu, hidden or not, keeps
 * live Reload and DevTools accelerators. macOS is different: Cmd+C, V, X, A
 * and Cmd+Q in a text field come from the app and Edit menu items, so with no
 * menu at all they stop working. It gets those roles and nothing that reloads
 * or opens DevTools.
 */
function releaseMenuTemplate(platform) {
  if (platform !== 'darwin') return null;
  return [{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }];
}

module.exports = {
  WINDOW_SIZES,
  MIN_WINDOW,
  toDip,
  toPixels,
  fittingSizes,
  frameOf,
  minWindowSize,
  releaseMenuTemplate,
};
