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
});
