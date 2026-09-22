/**
 * Desktop shell.
 *
 * Steam ships binaries, not URLs, so the desktop build runs the game server in
 * a child process on a free port and points a chromeless window at it. The
 * same build therefore plays single-player-with-bots offline, and can host a
 * table for friends on the same network, with no separate server to deploy.
 */
const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { fork } = require('node:child_process');
const net = require('node:net');
const steam = require('./steam.cjs');

const isDev = !app.isPackaged;

// Two copies of a game fighting over one Steam session and one save file is a
// support ticket waiting to happen.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
let win = null;
let server = null;
let serverPort = 0;

/** Ask the OS for a port nobody is using. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const root = path.join(__dirname, '..');
    const entry = isDev
      ? path.join(root, 'server', 'index.ts')
      : path.join(process.resourcesPath, 'server', 'index.mjs');
    const clientDir = isDev
      ? path.join(root, 'dist')
      : path.join(process.resourcesPath, 'client');

    server = fork(entry, [], {
      execArgv: isDev ? ['--import', 'tsx'] : [],
      cwd: isDev ? root : process.resourcesPath,
      env: {
        ...process.env,
        PORT: String(port),
        CLIENT_DIR: clientDir,
        NODE_ENV: isDev ? 'development' : 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve();
    };

    server.stdout?.on('data', (b) => {
      const line = b.toString();
      process.stdout.write(`[server] ${line}`);
      if (line.includes('listening')) done();
    });
    server.stderr?.on('data', (b) => process.stderr.write(`[server] ${b}`));
    server.on('error', done);
    server.on('exit', (code) => {
      server = null;
      if (!settled) done(new Error(`game server exited with code ${code}`));
    });

    // Do not hang forever if the banner never arrives.
    setTimeout(() => done(), 6000);
  });
}

function stopServer() {
  if (!server) return;
  try { server.kill(); } catch { /* already gone */ }
  server = null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#05060c',
    autoHideMenuBar: true,
    title: 'HEXHOLD',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  // External links open in the real browser, never inside the game.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.on('closed', () => { win = null; });
  return win;
}

app.whenReady().then(async () => {
  // Optional, and silent when absent.
  steam.init(process.resourcesPath);
  if (steam.enabled) {
    steam.setRichPresence('steam_display', '#Status_Playing');
    setInterval(() => steam.runCallbacks(), 1000).unref?.();
  }

  try {
    serverPort = await freePort();
    await startServer(serverPort);
  } catch (err) {
    dialog.showErrorBox('HEXHOLD could not start', String(err?.message ?? err));
    app.quit();
    return;
  }

  createWindow();

  // In development the client is served by Vite so hot reload still works.
  const url = isDev
    ? (process.env.VITE_DEV_SERVER ?? 'http://localhost:5173')
    : `http://127.0.0.1:${serverPort}`;
  await win.loadURL(url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle('hexhold:port', () => serverPort);

// --- Steam ----------------------------------------------------------------
ipcMain.handle('steam:status', () => steam.status());
ipcMain.handle('steam:name', () => steam.playerName());
ipcMain.handle('steam:unlock', (_e, name) =>
  typeof name === 'string' ? steam.unlockAchievement(name) : false);
ipcMain.handle('steam:unlocked', (_e, name) =>
  typeof name === 'string' ? steam.achievementUnlocked(name) : false);
ipcMain.handle('steam:presence', (_e, key, value) => {
  if (typeof key === 'string' && typeof value === 'string') steam.setRichPresence(key, value);
  return true;
});
ipcMain.handle('steam:cloudRead', (_e, file) =>
  typeof file === 'string' ? steam.cloudRead(file) : null);
ipcMain.handle('steam:cloudWrite', (_e, file, contents) =>
  typeof file === 'string' && typeof contents === 'string'
    ? steam.cloudWrite(file, contents)
    : false);
ipcMain.handle('hexhold:version', () => app.getVersion());
ipcMain.handle('hexhold:fullscreen', (_e, on) => {
  if (!win) return false;
  win.setFullScreen(typeof on === 'boolean' ? on : !win.isFullScreen());
  return win.isFullScreen();
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => { stopServer(); steam.shutdown(); });
process.on('exit', stopServer);
