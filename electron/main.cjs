/**
 * Desktop shell.
 *
 * Steam ships binaries, not URLs, so the desktop build runs the game server in
 * a child process on a free port and points a chromeless window at it. The
 * same build therefore plays single-player-with-bots offline, and can host a
 * table for friends on the same network, with no separate server to deploy.
 */
const { app, BrowserWindow, Menu, shell, ipcMain, dialog, session } = require('electron');
const path = require('node:path');
const { fork } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const steam = require('./steam.cjs');
const display = require('./display.cjs');

const isDev = !app.isPackaged;

// Test harnesses point the game at a throwaway profile so a run never touches
// a real player's save (test/packaged.mjs). Must happen before anything reads
// userData.
if (process.env.HEXHOLD_USER_DATA) app.setPath('userData', process.env.HEXHOLD_USER_DATA);

// Test harnesses only (test/packaged.mjs): run silent and out of sight, so a
// test can play the real exe while someone is using the machine. The window
// sits off every display, never takes focus and keeps rendering.
const OFFSCREEN = process.env.HEXHOLD_TEST_OFFSCREEN === '1';
if (OFFSCREEN) {
  app.commandLine.appendSwitch('mute-audio');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
}

/**
 * Display settings the renderer cannot apply itself.
 *
 * VSync is a Chromium switch, so it has to be read before the app is ready and
 * only takes effect on the next launch. Kept in its own small file in the
 * per-user data folder (%APPDATA%/HEXHOLD on Windows, ~/.config/HEXHOLD on
 * Linux and the Deck) next to window-state.json.
 */
function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}
function readSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return { vsync: raw.vsync !== false };
  } catch {
    return { vsync: true };
  }
}
function writeSettings(next) {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(next));
  } catch { /* a settings write must never crash the game */ }
}
// A desktop game plays its title music when it opens. Chromium's default
// policy holds every AudioContext until the first click or key, so the title
// screen was silent until the player touched something. The renderer starts
// the music at once when it sees the desktop bridge (App.tsx).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const launchSettings = readSettings();
if (!launchSettings.vsync) {
  app.commandLine.appendSwitch('disable-gpu-vsync');
  app.commandLine.appendSwitch('disable-frame-rate-limit');
}

/**
 * The page's saved state, kept somewhere that does not move.
 *
 * The packaged game loads from http://127.0.0.1:<a free port>, and the port is
 * different every launch. localStorage is keyed by origin, port included, so
 * without this every launch would start with empty storage: settings, profile,
 * achievements and the seen-the-intro flag all forgotten. The preload seeds
 * localStorage from this file before the page runs and flushes it back here.
 */
function storageFile() {
  return path.join(app.getPath('userData'), 'hexhold-storage.json');
}
function readStorage() {
  let text;
  try {
    text = fs.readFileSync(storageFile(), 'utf8');
  } catch {
    return {}; // first launch: no save yet
  }
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not an object');
    const out = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
    return out;
  } catch (err) {
    // A save that exists but cannot be read is about to be overwritten by the
    // first flush. Keep a copy, so a damaged file is a support question with
    // an answer rather than lost progress.
    try { fs.copyFileSync(storageFile(), `${storageFile()}.unreadable-${Date.now()}`); } catch { /* best effort */ }
    recordCrash('save file unreadable, starting fresh', err);
    return {};
  }
}
function writeStorage(json) {
  if (typeof json !== 'string' || json.length > 4 * 1024 * 1024) return false;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const file = storageFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write then rename, so a crash mid-write cannot leave half a save.
    fs.writeFileSync(`${file}.tmp`, json);
    fs.renameSync(`${file}.tmp`, file);
    return true;
  } catch (err) {
    recordCrash('save write failed', err);
    return false;
  }
}

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
        // Never write into the install folder: under Steam that is
        // steamapps/common, which a "verify files" can wipe.
        PERSIST_FILE: process.env.PERSIST_FILE
          ?? path.join(app.getPath('userData'), 'tables.db'),
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

/** The minimum window, shrunk to fit the smallest attached display. */
function minWindow() {
  try {
    const { screen } = require('electron');
    return display.minWindowSize(screen.getAllDisplays().map((d) => d.workAreaSize));
  } catch {
    return display.minWindowSize([]);
  }
}

function loadWindowState() {
  const fallback = { width: 1440, height: 900, maximized: false, fullscreen: false };
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const { screen } = require('electron');
    const min = minWindow();
    const bounds = {
      width: Math.max(min.width, Math.min(7680, raw.width | 0 || fallback.width)),
      height: Math.max(min.height, Math.min(4320, raw.height | 0 || fallback.height)),
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
  const min = minWindow();
  if (OFFSCREEN) Object.assign(state, { x: 10000, y: 0, maximized: false, fullscreen: false });
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: min.width,
    minHeight: min.height,
    show: false,
    ...(OFFSCREEN ? { skipTaskbar: true, focusable: false } : {}),
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
      ...(OFFSCREEN ? { backgroundThrottling: false } : {}),
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
    if (OFFSCREEN) { win.showInactive(); return; }
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  // No developer tools in a shipped build, however they are asked for.
  if (!isDev) {
    win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());
  }

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
  // A shipped build has no menu on Windows and Linux. Electron's default one
  // is hidden by autoHideMenuBar but still live, and its accelerators include
  // Reload (Ctrl+R) and Toggle Developer Tools (Ctrl+Shift+I). macOS keeps the
  // app and Edit menus, or Cmd+C/V/X/A and Cmd+Q stop working (display.cjs).
  if (!isDev) {
    const template = display.releaseMenuTemplate(process.platform);
    Menu.setApplicationMenu(template ? Menu.buildFromTemplate(template) : null);
  }

  // Optional, and silent when absent.
  steam.init(process.resourcesPath, { dev: isDev, root: path.join(__dirname, '..') });
  if (steam.enabled) {
    steam.setRichPresence('steam_display', '#Status_Playing');
    setInterval(() => steam.runCallbacks(), 1000).unref?.();
  }

  try {
    // HEXHOLD_PORT is for test/packaged.mjs, which needs an old port to come
    // back on purpose. A player never sets it.
    const forced = Number.parseInt(process.env.HEXHOLD_PORT ?? '', 10);
    serverPort = forced > 0 && forced < 65536 ? forced : await freePort();
    await startServer(serverPort);
  } catch (err) {
    dialog.showErrorBox('HEXHOLD could not start', String(err?.message ?? err));
    app.quit();
    return;
  }

  // hexhold-storage.json is the only source of truth for the page's storage.
  // Every launch is a new 127.0.0.1:<port> origin, and Chromium keeps each
  // origin's localStorage forever. Without this, a launch that lands on a port
  // used before would seed on top of that origin's stale keys and flush them
  // back into the save: a reset profile or a deleted reconnect seat returns.
  // It also stops one dead copy of the save piling up per launch.
  try {
    await session.defaultSession.clearStorageData({ storages: ['localstorage'] });
  } catch (err) {
    recordCrash('could not clear stale page storage', err);
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

// --- Saved state (see storageFile) -----------------------------------------
ipcMain.on('hexhold:storage:load', (e) => { e.returnValue = readStorage(); });
ipcMain.on('hexhold:storage:save', (e, json) => { e.returnValue = writeStorage(json); });

// --- Display ----------------------------------------------------------------
// Sizes cross this bridge in real pixels; Electron works in DIPs. See
// display.cjs for the conversion and why it matters on a scaled display.
function displayState() {
  if (!win || win.isDestroyed()) return null;
  const { screen } = require('electron');
  const where = screen.getDisplayMatching(win.getBounds());
  const [cw, ch] = win.getContentSize();
  const [ow, oh] = win.getSize();
  const current = display.toPixels({ width: cw, height: ch }, where.scaleFactor);
  return {
    mode: win.isFullScreen() ? 'fullscreen' : win.isMaximized() ? 'maximized' : 'windowed',
    width: current.width,
    height: current.height,
    vsync: readSettings().vsync,
    vsyncActive: launchSettings.vsync,
    sizes: display.fittingSizes({
      workArea: where.workAreaSize,
      scaleFactor: where.scaleFactor,
      frame: display.frameOf({ width: ow, height: oh }, { width: cw, height: ch }),
      min: minWindow(),
    }),
  };
}
ipcMain.handle('hexhold:display', () => displayState());
ipcMain.handle('hexhold:setDisplay', (_e, req) => {
  if (!win || win.isDestroyed() || !req || typeof req !== 'object') return displayState();
  if (req.mode === 'fullscreen') win.setFullScreen(true);
  else if (req.mode === 'maximized') { win.setFullScreen(false); win.maximize(); }
  else if (req.mode === 'windowed') { win.setFullScreen(false); win.unmaximize(); }
  if (Number.isInteger(req.width) && Number.isInteger(req.height)
      && display.WINDOW_SIZES.some(([w, h]) => w === req.width && h === req.height)) {
    if (win.isFullScreen()) win.setFullScreen(false);
    if (win.isMaximized()) win.unmaximize();
    const { screen } = require('electron');
    const { scaleFactor } = screen.getDisplayMatching(win.getBounds());
    const dip = display.toDip({ width: req.width, height: req.height }, scaleFactor);
    win.setContentSize(dip.width, dip.height);
    if (!OFFSCREEN) win.center();
  }
  if (typeof req.vsync === 'boolean') writeSettings({ ...readSettings(), vsync: req.vsync });
  return displayState();
});
// A packaged game needs a way out that is not the window chrome — the shell
// runs frameless in fullscreen, where there is none.
ipcMain.handle('hexhold:quit', () => { app.quit(); });
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
