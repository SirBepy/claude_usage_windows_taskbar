"use strict";

const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, shell } = require("electron");
const path = require("path");
const http = require("http");
const { execFile } = require("child_process");

app.name = "Claude Usage Taskbar Tool";
if (process.platform === "win32") app.setAppUserModelId("Claude Usage Taskbar Tool");

// Disable hardware acceleration to save memory (prevents the GPU-process from spawning)
app.disableHardwareAcceleration();

// ── Hook server (Claude Code Stop hook → POST /refresh) ───────────────────────
const HOOK_SERVER_PORT = 27182;

function parseHookBody(req, cb) {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    try { cb(JSON.parse(Buffer.concat(chunks).toString())); }
    catch { cb(null); }
  });
}

function focusVSCodeWindow(projectName) {
  const safe = projectName.replace(/[^a-zA-Z0-9 _\-\.]/g, "");
  const script = [
    `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n); }'`,
    `$p = Get-Process -Name Code -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*${safe}*' } | Select-Object -First 1`,
    `if (-not $p) { $p = Get-Process -Name Code -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1 }`,
    `if ($p) { [W]::ShowWindow($p.MainWindowHandle, 9); [W]::SetForegroundWindow($p.MainWindowHandle) }`,
  ].join("; ");
  execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true }, () => {});
}

function showNotification(title, body, cwd) {
  try {
    const n = new Notification({ title, body });
    if (cwd) n.on("click", () => focusVSCodeWindow(path.basename(cwd)));
    n.show();
  } catch { /* app not ready */ }
}

async function recordTokenStats(payload) {
  if (!payload?.session_id || !payload?.transcript_path) return;
  const tokens = await parseTranscript(payload.transcript_path);
  const date = new Date().toISOString().slice(0, 10);
  appendSession({ sessionId: payload.session_id, cwd: payload.cwd, date, ...tokens });
  dashboardWindow?.webContents.send("token-history-updated", loadTokenHistory());
}

const hookServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/refresh") {
    res.writeHead(204).end();
    parseHookBody(req, (payload) => {
      if (payload && payload.cwd) {
        showNotification("Claude finished", path.basename(payload.cwd), payload.cwd);
      }
      recordTokenStats(payload).catch(console.error);
    });
    refreshWithAnimation(true).catch(console.error);
  } else if (req.method === "POST" && req.url === "/notify") {
    res.writeHead(204).end();
    parseHookBody(req, (payload) => {
      if (payload && payload.cwd) {
        showNotification("Claude is waiting for your input", path.basename(payload.cwd), payload.cwd);
      }
      const sfx = settings.sounds || {};
      if (sfx.questionAsked?.enabled) {
        playSound(sfx.questionAsked.file);
      }
    });
  } else if (req.method === "POST" && req.url === "/quit") {
    res.writeHead(204).end();
    app.quit();
  } else {
    res.writeHead(404).end();
  }
});
hookServer.listen(HOOK_SERVER_PORT, "127.0.0.1");

const { makeIcon, makeSpinFrame } = require("./src/core/icon");
const {
  parseSessionPct,
  parseWeeklyPct,
  buildTooltip,
} = require("./src/core/usage-parser");
const { fetchUsageFromPage } = require("./src/core/scraper");
const { recordSnapshot, loadHistory, pruneHistory } = require("./src/core/history");
const { clearClaudeCookies } = require("./src/core/session");
const { loadSettings, saveSettings } = require("./src/core/settings");
const { loadTokenHistory, appendSession, backfillAllTranscripts } = require("./src/core/token-stats");
const { parseTranscript } = require("./src/core/transcript-parser");
const {
  setupAutoUpdater,
  getUpdateState,
  quitAndInstall,
  downloadUpdate,
} = require("./src/core/updater");
const { clipboard } = require("electron");

// ── Log Buffer ────────────────────────────────────────────────────────────────
const logBuffer = [];
const MAX_LOGS = 200;
const originalLog = console.log;
const originalError = console.error;

function addToBuffer(type, args) {
  const timestamp = new Date().toISOString();
  const message = args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
    .join(" ");
  logBuffer.push(`[${timestamp}] [${type}] ${message}`);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
}

console.log = (...args) => {
  originalLog.apply(console, args);
  addToBuffer("INFO", args);
};

console.error = (...args) => {
  originalError.apply(console, args);
  addToBuffer("ERROR", args);
};

// ── Single instance ───────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on("second-instance", () => {
  loginWindow?.focus();
});

// ── State ─────────────────────────────────────────────────────────────────────
let tray = null;
let loginWindow = null;
let pollTimer = null;
let spinTimer = null;
let usageData = null;
let loggedIn = false;
let dashboardWindow = null;
let settings = loadSettings();

// ── Audio ─────────────────────────────────────────────────────────────────────
let audioWindow = null;
let audioQueue = [];

function createAudioWindow() {
  audioWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "src", "renderer", "audio-preload.js"),
      nodeIntegration: false,
      contextIsolation: false,
      sandbox: false,
    },
  });
  audioWindow.loadFile(path.join(__dirname, "src", "renderer", "audio-player.html"));
  audioWindow.webContents.once("did-finish-load", () => {
    for (const f of audioQueue) audioWindow.webContents.send("play-sound", f);
    audioQueue = [];
  });
  audioWindow.on("closed", () => { audioWindow = null; });
}

function playSound(soundFile) {
  if (!soundFile) return;
  const soundPath = "file:///" + path.join(__dirname, "src", "assets", "sounds", soundFile).replace(/\\/g, "/");
  if (!audioWindow || audioWindow.isDestroyed()) {
    createAudioWindow();
    audioQueue.push(soundPath);
  } else if (audioWindow.webContents.isLoading()) {
    audioQueue.push(soundPath);
  } else {
    audioWindow.webContents.send("play-sound", soundPath);
  }
}

function hasThresholdCrossed(prevPct, newPct, thresholds) {
  if (prevPct == null || newPct == null || !thresholds) return false;
  return thresholds.some((t) => prevPct < t.min && newPct >= t.min);
}

// ── Temp display cycling (left click) ─────────────────────────────────────────
let tempDisplay = null;       // { displayMode, overlayDisplay } or null
let tempDisplayCycle = null;  // array of display states
let tempDisplayIndex = 0;
let tempDisplayTimer = null;

function getActiveSettings() {
  return tempDisplay ? { ...settings, ...tempDisplay } : settings;
}

function buildDisplayCycle() {
  const { displayMode, overlayDisplay } = settings;
  if (displayMode === "number") {
    const other = overlayDisplay === "session" ? "weekly" : "session";
    return [
      { displayMode: "number", overlayDisplay },
      { displayMode: "number", overlayDisplay: other },
      { displayMode: "icon" },
    ];
  }
  return [
    { displayMode, overlayDisplay },
    { displayMode: "number", overlayDisplay: "session" },
    { displayMode: "number", overlayDisplay: "weekly" },
  ];
}

function cycleDisplayMode() {
  if (!tempDisplayCycle) {
    tempDisplayCycle = buildDisplayCycle();
    tempDisplayIndex = 0;
  }

  tempDisplayIndex = (tempDisplayIndex + 1) % tempDisplayCycle.length;
  tempDisplay = tempDisplayCycle[tempDisplayIndex];
  updateTray();

  if (tempDisplayTimer) clearTimeout(tempDisplayTimer);

  if (tempDisplayIndex === 0) {
    // Wrapped back to saved state — end temp mode
    tempDisplay = null;
    tempDisplayCycle = null;
    tempDisplayTimer = null;
    return;
  }

  tempDisplayTimer = setTimeout(resetDisplayMode, 60 * 1000);
}

function resetDisplayMode() {
  tempDisplay = null;
  tempDisplayCycle = null;
  tempDisplayIndex = 0;
  tempDisplayTimer = null;
  updateTray();
}

const POLL_MS = 30 * 60 * 1000;

// ── Usage fetching ────────────────────────────────────────────────────────────
async function fetchUsage() {
  try {
    return await fetchUsageFromPage();
  } catch (e) {
    if (/HTTP 40[13]/.test(e.message)) {
      await handleAuthFailure();
      throw new Error("Session expired — showing login");
    }
    throw e;
  }
}

async function handleAuthFailure() {
  loggedIn = false;
  stopPolling();
  const loginInProgress = loginWindow && !loginWindow.isDestroyed();
  if (!loginInProgress) await clearClaudeCookies();
  showLoginWindow();
}

// ── Polling ───────────────────────────────────────────────────────────────────
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => refresh().catch(console.error), POLL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function refresh(fromHook = false) {
  const prevSession = parseSessionPct(usageData);
  const prevWeekly = parseWeeklyPct(usageData);
  try {
    usageData = await fetchUsage();
    loggedIn = true;

    const newSession = parseSessionPct(usageData);
    const newWeekly = parseWeeklyPct(usageData);
    const sfx = settings.sounds || {};

    if (fromHook && sfx.workFinished?.enabled) {
      playSound(sfx.workFinished.file);
    }
    if (sfx.thresholdCrossed?.enabled) {
      const thresholds = settings.colorThresholds;
      if (
        hasThresholdCrossed(prevSession, newSession, thresholds) ||
        hasThresholdCrossed(prevWeekly, newWeekly, thresholds)
      ) {
        playSound(sfx.thresholdCrossed.file);
      }
    }

    updateTray();
    recordSnapshot(usageData);
    dashboardWindow?.webContents.send("history-updated", loadHistory());
  } catch (e) {
    console.error("Refresh failed:", e.message);
  }
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function updateTray() {
  if (!tray) return;
  const s = getActiveSettings();
  tray.setImage(makeIcon(parseSessionPct(usageData), parseWeeklyPct(usageData), s));
  tray.setToolTip(buildTooltip(usageData, s));
}

/**
 * Animates the outer ring as a spinning blue arc while a refresh is in flight.
 * The inner ring stays at the last known weekly value.
 * Stops automatically once the refresh promise settles.
 */
async function refreshWithAnimation(fromHook = false) {
  if (spinTimer) return; // already refreshing

  let frame = 0;
  const weeklyPct = parseWeeklyPct(usageData);

  spinTimer = setInterval(() => {
    tray?.setImage(makeSpinFrame(frame++, weeklyPct, getActiveSettings()));
  }, 50);

  try {
    await refresh(fromHook);
  } finally {
    clearInterval(spinTimer);
    spinTimer = null;
    updateTray(); // snap to real data
  }
}

function buildContextMenu() {
  const { state, version } = getUpdateState();

  const template = [
    { label: "Refresh", click: () => refreshWithAnimation() },
    { label: "Dashboard", click: showDashboardWindow },
    { type: "separator" },
    ...(!loggedIn
      ? [{ label: "Log In", click: showLoginWindow }, { type: "separator" }]
      : []),
    { label: "Quit", click: () => app.quit() },
  ];

  if (state === "downloaded") {
    template.unshift(
      { label: `Restart to update to v${version}`, click: quitAndInstall },
      { type: "separator" },
    );
  } else if (state === "downloading") {
    template.unshift(
      { label: `Downloading v${version}…`, enabled: false },
      { type: "separator" },
    );
  } else if (state === "available") {
    template.unshift(
      { label: `Update available: v${version}`, click: downloadUpdate },
      { type: "separator" },
    );
  }

  return Menu.buildFromTemplate(template);
}

function createTray() {
  tray = new Tray(makeIcon(null, null, settings));
  tray.setToolTip("Claude Usage — Initializing...");

  tray.on("click", () =>
    loggedIn ? cycleDisplayMode() : showLoginWindow(),
  );

  tray.on("right-click", () => {
    tray.popUpContextMenu(buildContextMenu());
  });
}

// ── Login window ──────────────────────────────────────────────────────────────
function showLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.show();
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: "Sign in to Claude",
    icon: path.join(__dirname, "src", "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  loginWindow.setMenuBarVisibility(false);

  loginWindow.loadURL("https://claude.ai/login");

  // Allow Google OAuth popups to open inside Electron.
  loginWindow.webContents.setWindowOpenHandler(({ url }) => ({
    action: "allow",
    overrideBrowserWindowOptions: {
      parent: loginWindow,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    },
  }));

  // Detect login via both full navigations (did-navigate) and SPA route changes
  // (did-navigate-in-page / pushState). Claude.ai uses client-side routing, so
  // after Google OAuth the page pushes to /new without a full reload.
  let verifying = false;

  function onNavigate(url) {
    if (verifying) return;
    const isAuthPage = /\/(login|auth|sso|sign-?in)/i.test(url);
    if (!url.includes("claude.ai") || isAuthPage) return;

    // Claude navigated to a real page — user is logged in.
    // Hide immediately so they never see Claude's UI here.
    verifying = true;
    loginWindow?.hide();

    setTimeout(async () => {
      try {
        usageData = await fetchUsageFromPage();
        loggedIn = true;
        updateTray();
        loginWindow?.close();
        startPolling();
      } catch {
        // Session not ready — show login again.
        verifying = false;
        if (loginWindow && !loginWindow.isDestroyed()) {
          loginWindow.loadURL("https://claude.ai/login");
          loginWindow.show();
        }
      }
    }, 1500);
  }

  loginWindow.webContents.on("did-navigate", (_, url) => onNavigate(url));
  loginWindow.webContents.on("did-navigate-in-page", (_, url) =>
    onNavigate(url),
  );

  loginWindow.on("closed", () => {
    loginWindow = null;
  });
}

// ── Dashboard window ──────────────────────────────────────────────────────────
function showDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.show();
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 480,
    height: 700,
    title: "Claude Usage",
    icon: path.join(__dirname, "src", "assets", "icon.png"),
    resizable: true,
    backgroundColor: "#121212",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "src", "renderer", "preload.js"),
    },
  });

  dashboardWindow.setMenuBarVisibility(false);
  dashboardWindow.loadFile(path.join(__dirname, "src", "renderer", "dashboard.html"));

  dashboardWindow.on("closed", () => {
    dashboardWindow = null;
  });
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle("get-usage-history", () => loadHistory());
ipcMain.handle("get-settings", () => settings);
ipcMain.on("save-settings", (_, newSettings) => {
  settings = newSettings;
  saveSettings(settings);
  // Drop any active temp cycle — saved state has changed
  if (tempDisplayTimer) clearTimeout(tempDisplayTimer);
  tempDisplay = null;
  tempDisplayCycle = null;
  tempDisplayIndex = 0;
  tempDisplayTimer = null;
  updateTray();
});
ipcMain.on("logout", async () => {
  await logout();
});
ipcMain.handle("get-update-state", () => getUpdateState());
ipcMain.on("install-update", () => quitAndInstall());
ipcMain.on("download-update", () => downloadUpdate());
ipcMain.on("check-for-updates", () => {
  setupAutoUpdater();
});
ipcMain.on("copy-logs", () => {
  clipboard.writeText(logBuffer.join("\n"));
});
ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("get-token-history", () => loadTokenHistory());
ipcMain.handle("backfill-transcripts", () => backfillAllTranscripts());
ipcMain.on("open-in-explorer", (_, folderPath) => shell.openPath(folderPath));
ipcMain.on("open-in-vscode", (_, folderPath) => {
  const cmd = process.platform === "win32" ? "code.cmd" : "code";
  execFile(cmd, [folderPath], { windowsHide: true }, () => {});
});

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout() {
  loggedIn = false;
  stopPolling();
  usageData = null;
  await clearClaudeCookies();
  updateTray();
  showLoginWindow();
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (process.platform === "darwin") app.dock.hide();
  pruneHistory();

  createTray();
  createAudioWindow();
  setupAutoUpdater(() => {
    const state = getUpdateState();
    console.log("Updater state changed via callback:", state);
    dashboardWindow?.webContents.send("update-state-changed", state);
  });

  // Try to resume an existing session from a previous run.
  try {
    usageData = await fetchUsageFromPage();
    loggedIn = true;
    updateTray();
    recordSnapshot(usageData);
    dashboardWindow?.webContents.send("history-updated", loadHistory());
    startPolling();
    return;
  } catch {
    // No valid session — fall through to login.
  }

  // If started with --hidden (e.g. via Login Items), don't pop up the login window.
  // The user can still log in by clicking the tray icon later.
  if (process.argv.includes("--hidden")) {
    console.log("Started in hidden mode. Skipping initial login window.");
    updateTray(); // Ensure tray is initialized even if not logged in
    return;
  }

  await clearClaudeCookies();
  showLoginWindow();
});

app.on("window-all-closed", () => {
  /* keep running in tray */
});
app.on("before-quit", () => {
  stopPolling();
  tray?.destroy();
  hookServer.close();
  audioWindow?.destroy();
});
