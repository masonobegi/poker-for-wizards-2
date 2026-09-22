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
const fs = require('node:fs');
const steam = require('./steam.cjs');

const isDev = !app.isPackaged;

/**
 * Crash reporting, the version that does not need a service.
 *
 * A player whose game died can be asked for one file. Without this, a crash on
 * someone else's machine is a forum post saying "it closed" and nothing to act
 * on. Kept local and plain text on purpose — nothing leaves the machine unless
 * the person chooses to send it.
 */
function crashLogPath() {
  return path.join(app.getPath('userData'), 'crash.log');
}

function recordCrash(kind, detail) {
  try {
    const line = [
      '',
      `--- ${new Date().toISOString()} — ${kind} ---`,
      `version ${app.getVersion()}  ${process.platform} ${process.arch}  electron ${process.versions.electron}`,
      String(detail && detail.stack ? detail.stack : detail),
    ].join('\n');
    fs.appendFileSync(crashLogPath(), line);
  } catch { /* if we cannot even log, there is nothing further to do */ }
}

process.on('uncaughtException', (err) => {
  recordCrash('uncaught exception in the shell', err);
  console.error(err);
});
process.on('unhandledRejection', (reason) => {
  recordCrash('unhandled rejection in the shell', reason);
});

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
    server.stderr?.on('data', (b) => {
      process.stderr.write(`[server] ${b}`);
      recordCrash('game server stderr', String(b).slice(0, 2000));
    });
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

/**
 * Remember where the window was.
 *
 * A desktop game that opens in the middle of the wrong monitor at the wrong
 * size every launch feels unfinished, and on a two-screen setup it is a real
 * irritation. Stored next to the app's other settings, and validated on the
 * way back in so a display that has since been unplugged cannot strand the
 * window off-screen.
 */
function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  const fallback = { width: 1440, height: 900, maximized: false, fullscreen: false };
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const { screen } = require('electron');
    const bounds = {
      width: Math.max(1024, Math.min(7680, raw.width | 0 || fallback.width)),
      height: Math.max(680, Math.min(4320, raw.height | 0 || fallback.height)),
      x: Number.isInteger(raw.x) ? raw.x : undefined,
      y: Number.isInteger(raw.y) ? raw.y : undefined,
      maximized: !!raw.maximized,
      fullscreen: !!raw.fullscreen,
    };
    // Only keep a position that still lands on a display that exists.
    if (bounds.x !== undefined && bounds.y !== undefined) {
      const visible = screen.getAllDisplays().some((d) => {
        const a = d.workArea;
        return bounds.x < a.x + a.width && bounds.x + 200 > a.x
          && bounds.y < a.y + a.height && bounds.y + 100 > a.y;
      });
      if (!visible) { delete bounds.x; delete bounds.y; }
    }
    return bounds;
  } catch {
    return fallback;
  }
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
    const normal = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({
      width: normal.width,
      height: normal.height,
      x: normal.x,
      y: normal.y,
      maximized: win.isMaximized(),
      fullscreen: win.isFullScreen(),
    }));
  } catch { /* a settings write must never block quitting */ }
}

function createWindow() {
  const state = loadWindowState();
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
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

  if (state.maximized) win.maximize();
  if (state.fullscreen) win.setFullScreen(true);

  let saveTimer = null;
  const rememberSoon = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveWindowState, 500);
  };
  win.on('resize', rememberSoon);
  win.on('move', rememberSoon);
  win.on('maximize', rememberSoon);
  win.on('unmaximize', rememberSoon);
  win.on('enter-full-screen', rememberSoon);
  win.on('leave-full-screen', rememberSoon);
  win.on('close', saveWindowState);

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

  // A renderer that dies takes the game with it; say so rather than showing a
  // white rectangle, and leave a record behind.
  win.webContents.on('render-process-gone', (_e, details) => {
    recordCrash('renderer gone', `${details.reason} (exit ${details.exitCode})`);
    if (details.reason === 'clean-exit') return;
    dialog.showMessageBox({
      type: 'error',
      title: 'HEXHOLD stopped',
      message: 'The game window stopped unexpectedly.',
      detail: `A record was written to:\n${crashLogPath()}\n\nReason: ${details.reason}`,
      buttons: ['Reload', 'Quit'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0 && win && !win.isDestroyed()) win.reload();
      else app.quit();
    }).catch(() => app.quit());
  });

  win.webContents.on('unresponsive', () => recordCrash('window unresponsive', 'no detail'));

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
ipcMain.handle('hexhold:crashLog', () => crashLogPath());
ipcMain.handle('hexhold:reportCrash', (_e, detail) => {
  recordCrash('reported by the game', detail);
  return crashLogPath();
});

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
