/**
 * The only bridge between the page and the desktop shell. Deliberately tiny:
 * the game is a web app that happens to be in a window, and nothing in it
 * needs the filesystem or the network beyond its own socket.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hexhold', {
  desktop: true,
  port: () => ipcRenderer.invoke('hexhold:port'),
  version: () => ipcRenderer.invoke('hexhold:version'),
  toggleFullscreen: (on) => ipcRenderer.invoke('hexhold:fullscreen', on),
  quit: () => ipcRenderer.invoke('hexhold:quit'),
  crashLogPath: () => ipcRenderer.invoke('hexhold:crashLog'),
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
  },
});
