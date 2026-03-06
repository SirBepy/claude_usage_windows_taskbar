'use strict';

const {
  app, BrowserWindow, Tray, Menu, nativeImage,
  ipcMain, net, screen: electronScreen, session: electronSession,
} = require('electron');
const path = require('path');
const fs   = require('fs');
const zlib = require('zlib');

// ── Single instance ───────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { loginWindow?.focus(); });

// ── State ─────────────────────────────────────────────────────────────────────
let tray        = null;
let loginWindow = null;
let popupWindow = null;
let pollTimer   = null;
let orgId       = null;
let usageData   = null;

const POLL_MS    = 60 * 60 * 1000; // 1 hour
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

// ── Config ────────────────────────────────────────────────────────────────────
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function writeConfig(patch) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...readConfig(), ...patch }, null, 2));
}

// ── PNG icon generation (pure Node, zero npm deps) ────────────────────────────
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

// Generates a solid-colour circle PNG with alpha (RGBA, colour type 6)
function makeCirclePNG(size, r, g, b) {
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const cx = size / 2, cy = size / 2, radius = size / 2 - 0.5;
  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(size * rowLen, 0);

  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const a  = Math.sqrt(dx * dx + dy * dy) <= radius ? 255 : 0;
      const o  = y * rowLen + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function iconForPct(pct) {
  let r, g, b;
  if      (pct == null) { r = 74;  g = 144; b = 226; } // blue  — unknown
  else if (pct  <  50)  { r = 39;  g = 174; b = 96;  } // green
  else if (pct  <  80)  { r = 230; g = 126; b = 34;  } // orange
  else                  { r = 231; g = 76;  b = 60;  } // red
  return nativeImage.createFromBuffer(makeCirclePNG(22, r, g, b));
}

// ── Claude API (uses the login session's cookies automatically) ───────────────
function claudeGet(url) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url, session: electronSession.defaultSession });
    req.setHeader('Accept', 'application/json');
    req.setHeader('Referer', 'https://claude.ai/');
    req.setHeader('User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    let body = '';
    req.on('response', (res) => {
      res.on('data',  (c) => { body += c; });
      res.on('end',   ()  => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function resolveOrgId() {
  if (orgId) return orgId;
  const cfg = readConfig();
  if (cfg.orgId) { orgId = cfg.orgId; return orgId; }

  const { status, body } = await claudeGet('https://claude.ai/api/organizations');
  if (status !== 200) throw new Error(`HTTP ${status}`);

  const orgs = JSON.parse(body);
  if (!Array.isArray(orgs) || !orgs.length) throw new Error('No organizations found');
  orgId = orgs[0].uuid || orgs[0].id;
  writeConfig({ orgId });
  return orgId;
}

async function fetchUsage() {
  const id = await resolveOrgId();
  const { status, body } = await claudeGet(`https://claude.ai/api/organizations/${id}/usage`);

  if (status === 401 || status === 403) {
    orgId = null;
    writeConfig({ orgId: null });
    stopPolling();
    showLoginWindow();
    throw new Error('Session expired — showing login');
  }
  if (status !== 200) throw new Error(`HTTP ${status}`);
  return JSON.parse(body);
}

// ── Login window ──────────────────────────────────────────────────────────────
function showLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.focus(); return; }

  loginWindow = new BrowserWindow({
    width: 1024, height: 768,
    title: 'Sign in to Claude',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  loginWindow.loadURL('https://claude.ai/login');

  // Watch for navigation away from auth pages — that signals a successful login
  loginWindow.webContents.on('did-navigate', (_, url) => {
    const isAuthPage = /\/(login|auth|sso|sign-?in)/i.test(url);
    if (url.includes('claude.ai') && !isAuthPage) {
      setTimeout(tryAutoDetectLogin, 1500); // give cookies time to settle
    }
  });

  loginWindow.on('closed', () => { loginWindow = null; });
}

async function tryAutoDetectLogin() {
  try {
    orgId = null;               // force fresh org lookup with the new session
    writeConfig({ orgId: null });
    await resolveOrgId();       // throws if not actually logged in yet
    loginWindow?.close();
    await refresh();
    startPolling();
  } catch {
    // Not fully logged in yet — keep waiting for the next navigation event
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => refresh().catch(console.error), POLL_MS);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function refresh() {
  try {
    usageData = await fetchUsage();
    updateTray();
    broadcastUsage();
  } catch (e) {
    console.error('Refresh failed:', e.message);
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout() {
  stopPolling();
  orgId     = null;
  usageData = null;
  writeConfig({ orgId: null });
  popupWindow?.close();

  const cookies = await electronSession.defaultSession.cookies.get({ url: 'https://claude.ai' });
  await Promise.all(cookies.map(c =>
    electronSession.defaultSession.cookies.remove('https://claude.ai', c.name)
  ));

  updateTray();
  showLoginWindow();
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function deepFind(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  for (const v of Object.values(obj)) {
    const f = deepFind(v, keys);
    if (f !== undefined) return f;
  }
}

function parseSessionPct(data) {
  let pct = deepFind(data, [
    'current_session_percentage', 'sessionPercentage', 'session_percentage', 'session_pct',
  ]);
  if (pct == null) {
    const u = deepFind(data, ['messages_used', 'session_messages_used', 'current_messages_used']);
    const l = deepFind(data, ['messages_allowed', 'session_messages_limit', 'session_limit', 'message_limit']);
    if (u != null && l) pct = u / l * 100;
  }
  return pct != null ? Math.round(pct) : null;
}

function formatTimeUntil(iso) {
  if (!iso) return null;
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return 'soon';
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0)   return `${h}h ${m}m`;
  return `${m}m`;
}

function buildTooltip() {
  if (!usageData) return 'Claude Usage — Loading...';

  const sessionPct = parseSessionPct(usageData);
  let weeklyPct = deepFind(usageData, ['weekly_percentage', 'weeklyPercentage', 'weekly_pct']);
  if (weeklyPct == null) {
    const u = deepFind(usageData, ['weekly_messages_used', 'weekly_used']);
    const l = deepFind(usageData, ['weekly_messages_limit', 'weekly_limit', 'weekly_allowed']);
    if (u != null && l) weeklyPct = Math.round(u / l * 100);
  }
  const sReset = deepFind(usageData, ['session_resets_at', 'session_reset_at', 'current_session_reset_at', 'resets_at']);
  const wReset = deepFind(usageData, ['weekly_resets_at', 'weekly_reset_at', 'next_weekly_reset']);

  const lines = [];
  if (sessionPct != null) {
    const r = sReset ? ` (resets ${formatTimeUntil(sReset)})` : '';
    lines.push(`Session: ${sessionPct}%${r}`);
  }
  if (weeklyPct != null) {
    const r = wReset ? ` (resets ${formatTimeUntil(wReset)})` : '';
    lines.push(`Weekly: ${Math.round(weeklyPct)}%${r}`);
  }
  return lines.length ? lines.join('\n') : 'Claude Usage';
}

function updateTray() {
  if (!tray) return;
  tray.setImage(iconForPct(parseSessionPct(usageData)));
  tray.setToolTip(buildTooltip());
}

function createTray() {
  tray = new Tray(iconForPct(null));
  tray.setToolTip('Claude Usage — Initializing...');

  // Left-click: refresh immediately, then open popup
  tray.on('click', async () => {
    await refresh();
    openPopup();
  });

  // Right-click: context menu
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Show Usage',  click: openPopup },
      { label: 'Refresh',     click: () => refresh() },
      { type: 'separator' },
      { label: 'Log Out',     click: logout },
      { type: 'separator' },
      { label: 'Quit',        click: () => app.quit() },
    ]);
    tray.popUpContextMenu(menu);
  });
}

// ── Popup window ──────────────────────────────────────────────────────────────
function getPopupPosition() {
  const { x: tx, y: ty, width: tw, height: th } = tray.getBounds();
  const W = 320, H = 240;
  const display = electronScreen.getDisplayNearestPoint({ x: tx, y: ty });
  const { x: wx, y: wy, width: ww, height: wh } = display.workArea;

  let x = Math.round(tx + tw / 2 - W / 2);
  let y = Math.round(ty - H - 8);

  // Clamp to work area (handles taskbars on any side)
  x = Math.max(wx, Math.min(x, wx + ww - W));
  y = Math.max(wy, Math.min(y, wy + wh - H));
  return { x, y, width: W, height: H };
}

function openPopup() {
  if (popupWindow && !popupWindow.isDestroyed()) { popupWindow.focus(); return; }

  const bounds = getPopupPosition();
  popupWindow = new BrowserWindow({
    ...bounds,
    frame:     false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  popupWindow.loadFile('popup.html');
  popupWindow.on('blur',   () => { popupWindow?.close(); });
  popupWindow.on('closed', () => { popupWindow = null; });
}

function broadcastUsage() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('usage-update', usageData);
  }
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('get-usage', () => usageData);
ipcMain.handle('refresh',   async () => { await refresh(); return usageData; });
ipcMain.on('close-popup',   () => popupWindow?.close());

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide();
  app.setAppUserModelId('com.aiusage.toolbar');

  createTray();

  // Try to resume an existing session from a previous run
  try {
    await resolveOrgId();
    await refresh();
    startPolling();
  } catch {
    showLoginWindow();
  }
});

// Keep running in tray after all windows are closed
app.on('window-all-closed', () => { /* intentionally empty */ });
app.on('before-quit', () => { stopPolling(); tray?.destroy(); });
