/**
 * The only bridge between the page and the desktop shell. Deliberately tiny:
 * the game is a web app that happens to be in a window, and nothing in it
 * needs the filesystem or the network beyond its own socket.
 */
const { contextBridge, ipcRenderer, webFrame } = require('electron');

/**
 * Saved state that survives the port changing.
 *
 * The page is served from 127.0.0.1 on a port picked fresh every launch, and
 * localStorage is per-origin, port included. So before any page script runs,
 * seed localStorage from the copy the shell keeps in the user data folder, and
 * flush it back whenever it changes. Preload shares the page's storage even
 * with context isolation on.
 */
(() => {
  let last = '';
  const dump = () => {
    const out = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k !== null) out[k] = localStorage.getItem(k) ?? '';
    }
    return JSON.stringify(out);
  };
  try {
    const saved = ipcRenderer.sendSync('hexhold:storage:load');
    if (saved && typeof saved === 'object') {
      // The file is the whole truth. The shell already clears every origin's
      // storage at launch (main.cjs); clearing here as well means a key the
      // player deleted can never come back from this origin's old copy.
      localStorage.clear();
      for (const [k, v] of Object.entries(saved)) {
        if (typeof v === 'string') localStorage.setItem(k, v);
      }
    }
    last = dump();
  } catch { /* storage unavailable: the game still runs, it just forgets */ }

  const flush = (sync) => {
    try {
      const now = dump();
      if (now === last) return;
      last = now;
      if (sync) ipcRenderer.sendSync('hexhold:storage:save', now);
      else ipcRenderer.send('hexhold:storage:save', now);
    } catch { /* never let a save break the page */ }
  };
  setInterval(() => flush(false), 1500);
  window.addEventListener('pagehide', () => flush(true));
  window.addEventListener('beforeunload', () => flush(true));
})();

contextBridge.exposeInMainWorld('hexhold', {
  desktop: true,
  port: () => ipcRenderer.invoke('hexhold:port'),
  version: () => ipcRenderer.invoke('hexhold:version'),
  toggleFullscreen: (on) => ipcRenderer.invoke('hexhold:fullscreen', on),
  quit: () => ipcRenderer.invoke('hexhold:quit'),
  display: () => ipcRenderer.invoke('hexhold:display'),
  setDisplay: (req) => ipcRenderer.invoke('hexhold:setDisplay', req),
  crashLogPath: () => ipcRenderer.invoke('hexhold:crashLog'),
  /**
   * Settings > Video > UI Scale, as the page's zoom factor: the page is laid
   * out at (window / zoom) CSS pixels, so media queries see the real size.
   * Synchronous, and limited to the range the slider offers.
   */
  getZoom: () => webFrame.getZoomFactor(),
  setZoom: (f) => {
    if (typeof f === 'number' && Number.isFinite(f) && f >= 0.5 && f <= 2) webFrame.setZoomFactor(f);
    return webFrame.getZoomFactor();
  },
  reportCrash: (detail) => ipcRenderer.invoke('hexhold:reportCrash', String(detail).slice(0, 8000)),

  /**
   * Steam. Every method resolves to a harmless value when Steam is absent, so
   * the renderer never needs to branch on whether it is running through Steam.
   */
  steam: {
    status: () => ipcRenderer.invoke('steam:status'),
    playerName: () => ipcRenderer.invoke('steam:name'),
    unlockAchievement: (name) => ipcRenderer.invoke('steam:unlock', name),
    isUnlocked: (name) => ipcRenderer.invoke('steam:unlocked', name),
    setRichPresence: (key, value) => ipcRenderer.invoke('steam:presence', key, value),
    cloudRead: (file) => ipcRenderer.invoke('steam:cloudRead', file),
    cloudWrite: (file, contents) => ipcRenderer.invoke('steam:cloudWrite', file, contents),
    /** Steam's on-screen keyboard beside a field ({x, y, width, height} in CSS px). */
    showKeyboard: (req) => ipcRenderer.invoke('steam:keyboard', req),
  },
});
