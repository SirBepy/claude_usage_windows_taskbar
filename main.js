"use strict";

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  screen: electronScreen,
  session: electronSession,
} = require("electron");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const { execSync } = require("child_process");

// ── Single instance ───────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on("second-instance", () => {
  (loginWindow ?? pickerWindow)?.focus();
});

// ── State ─────────────────────────────────────────────────────────────────────
let tray = null;
let loginWindow = null;
let popupWindow = null;
let pickerWindow = null;
let pollTimer = null;
let usageData = null;
let sqlLib = null; // lazy-loaded on first Chrome import

const POLL_MS = 60 * 60 * 1000;

// ── PNG icon generation (pure Node, zero npm deps) ────────────────────────────
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function makeCirclePNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // 8-bit RGBA

  const cx = size / 2,
    cy = size / 2,
    radius = size / 2 - 0.5;
  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(size * rowLen, 0);

  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5,
        dy = y - cy + 0.5;
      const a = Math.sqrt(dx * dx + dy * dy) <= radius ? 255 : 0;
      const o = y * rowLen + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function iconForPct(pct) {
  let r, g, b;
  if (pct == null) {
    r = 74;
    g = 144;
    b = 226;
  } else if (pct < 50) {
    r = 39;
    g = 174;
    b = 96;
  } else if (pct < 80) {
    r = 230;
    g = 126;
    b = 34;
  } else {
    r = 231;
    g = 76;
    b = 60;
  }
  return nativeImage.createFromBuffer(makeCirclePNG(22, r, g, b));
}

// ── Usage page scraper ────────────────────────────────────────────────────────
// Opens a hidden window, loads the settings/usage page, and intercepts the
// /api/organizations/.../usage network response via the CDP debugger.
// This avoids having to replicate the browser's auth header logic.
function fetchUsageFromPage() {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    let settled = false;
    function settle(fn) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { win.destroy(); } catch {}
      fn();
    }

    const timer = setTimeout(
      () => settle(() => reject(new Error("Timed out loading usage page"))),
      20000,
    );

    // Redirect to login = no valid session
    win.webContents.on("did-navigate", (_, url) => {
      if (/\/(login|auth|sso)/i.test(url)) {
        settle(() => reject(new Error("HTTP 401")));
      }
    });

    win.webContents.debugger.attach("1.3");
    win.webContents.debugger.sendCommand("Network.enable");

    win.webContents.debugger.on("message", async (_, method, params) => {
      if (settled) return;
      if (method !== "Network.responseReceived") return;
      const url = params.response.url;
      if (!url.includes("/api/organizations/") || !url.includes("/usage")) return;

      const s = params.response.status;
      console.log(`[page-scraper] intercepted ${s} ${url}`);
      if (s === 401 || s === 403) {
        settle(() => reject(new Error(`HTTP ${s}`)));
        return;
      }
      if (s === 200) {
        try {
          const { body } = await win.webContents.debugger.sendCommand(
            "Network.getResponseBody",
            { requestId: params.requestId },
          );
          settle(() => resolve(JSON.parse(body)));
        } catch (e) {
          settle(() => reject(e));
        }
      }
    });

    win.loadURL("https://claude.ai/settings/usage");
  });
}

async function handleAuthFailure() {
  stopPolling();
  // Don't wipe cookies if the login window is already open — we might be mid-login
  const loginInProgress = loginWindow && !loginWindow.isDestroyed();
  if (!loginInProgress) {
    await clearClaudeCookies();
  }
  showLoginWindow();
}

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

async function clearClaudeCookies() {
  const cookies = await electronSession.defaultSession.cookies.get({ url: 'https://claude.ai' });
  await Promise.all(
    cookies.map(c => electronSession.defaultSession.cookies.remove('https://claude.ai', c.name))
  );
}

// ── Chrome profile helpers ────────────────────────────────────────────────────
function getChromeDataDir() {
  if (process.platform === "win32")
    return path.join(
      process.env.LOCALAPPDATA || "",
      "Google",
      "Chrome",
      "User Data",
    );
  if (process.platform === "darwin")
    return path.join(
      process.env.HOME || "",
      "Library",
      "Application Support",
      "Google",
      "Chrome",
    );
  return path.join(process.env.HOME || "", ".config", "google-chrome");
}

function chromeCookiesPath(dataDir, profileDir) {
  // Chrome 96+ moved cookies to a Network subfolder
  const network = path.join(dataDir, profileDir, "Network", "Cookies");
  if (fs.existsSync(network)) return network;
  const legacy = path.join(dataDir, profileDir, "Cookies");
  if (fs.existsSync(legacy)) return legacy;
  return null;
}

function listChromeProfiles() {
  const dataDir = getChromeDataDir();
  try {
    const state = JSON.parse(
      fs.readFileSync(path.join(dataDir, "Local State"), "utf8"),
    );
    const cache = state?.profile?.info_cache ?? {};
    return Object.entries(cache)
      .map(([dir, info]) => ({
        dir,
        name: info.name || dir,
        email: info.user_name || "",
      }))
      .filter((p) => !!chromeCookiesPath(dataDir, p.dir));
  } catch {
    return [];
  }
}

// Returns the AES key Chrome uses to encrypt cookies (platform-specific)
function getChromeAesKey() {
  const dataDir = getChromeDataDir();

  if (process.platform === "win32") {
    const state = JSON.parse(
      fs.readFileSync(path.join(dataDir, "Local State"), "utf8"),
    );
    const encB64 = state?.os_crypt?.encrypted_key;
    if (!encB64)
      throw new Error("No os_crypt.encrypted_key in Chrome Local State");

    // Strip the literal 'DPAPI' prefix (5 bytes), then decrypt the rest with Windows DPAPI
    const encrypted = Buffer.from(encB64, "base64").slice(5);
    const scriptFile = path.join(app.getPath("temp"), "_claude_dpapi.ps1");
    try {
      fs.writeFileSync(
        scriptFile,
        [
          "Add-Type -AssemblyName System.Security",
          `$enc = [System.Convert]::FromBase64String('${encrypted.toString("base64")}')`,
          "$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
          "[System.Console]::WriteLine([System.Convert]::ToBase64String($dec))",
        ].join("\r\n"),
        "utf8",
      );
      const out = execSync(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptFile}"`,
        { encoding: "utf8" },
      ).trim();
      return Buffer.from(out, "base64");
    } finally {
      try {
        fs.unlinkSync(scriptFile);
      } catch {}
    }
  }

  if (process.platform === "darwin") {
    const pw = execSync(
      'security find-generic-password -a "Chrome" -s "Chrome Safe Storage" -w',
      { encoding: "utf8" },
    ).trim();
    return crypto.pbkdf2Sync(pw, "saltysalt", 1003, 16, "sha1");
  }

  throw new Error(
    `Chrome cookie import not yet supported on ${process.platform}`,
  );
}

function decryptChromeValue(buf, aesKey) {
  if (!buf || buf.length < 4) return "";
  const prefix = buf.slice(0, 3).toString();
  if (prefix !== "v10" && prefix !== "v11") return ""; // pre-v80 DPAPI-only, skip

  try {
    if (process.platform === "win32") {
      // AES-256-GCM: [3 prefix][12 nonce][ciphertext][16 tag]
      const nonce = buf.slice(3, 15);
      const tag = buf.slice(buf.length - 16);
      const ct = buf.slice(15, buf.length - 16);
      const dec = crypto.createDecipheriv("aes-256-gcm", aesKey, nonce);
      dec.setAuthTag(tag);
      return Buffer.concat([dec.update(ct), dec.final()]).toString("utf8");
    }
    if (process.platform === "darwin") {
      // AES-128-CBC: [3 prefix][ciphertext], IV = 16 space chars
      const dec = crypto.createDecipheriv(
        "aes-128-cbc",
        aesKey,
        Buffer.alloc(16, 0x20),
      );
      return Buffer.concat([dec.update(buf.slice(3)), dec.final()]).toString(
        "utf8",
      );
    }
  } catch {}
  return "";
}

// Chrome holds its Cookies SQLite file open with a lock that blocks fs.copyFileSync.
// We use Win32 CreateFile directly (via inline C# in PowerShell) with
// FILE_SHARE_READ|WRITE|DELETE (7) which allows us to open and read the file
// even while Chrome has it open. $ErrorActionPreference=Stop ensures any failure
// exits with a non-zero code so execSync throws rather than silently producing
// an empty destination file.
function safeCopyLockedFile(src, dst) {
  if (process.platform !== "win32") {
    fs.copyFileSync(src, dst); // advisory locks on macOS/Linux — plain copy works
    return;
  }

  const safeSrc = src.replace(/'/g, "''");
  const safeDst = dst.replace(/'/g, "''");
  const scriptFile = path.join(app.getPath("temp"), "_claude_copy.ps1");

  try {
    fs.writeFileSync(
      scriptFile,
      [
        '$ErrorActionPreference = "Stop"',
        "Add-Type -TypeDefinition @'",
        "using System;",
        "using System.IO;",
        "using System.Runtime.InteropServices;",
        "using Microsoft.Win32.SafeHandles;",
        "public class ChromeCopier {",
        '    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]',
        "    static extern IntPtr CreateFile(",
        "        string lpFileName, uint dwDesiredAccess, uint dwShareMode,",
        "        IntPtr lpSecurityAttributes, uint dwCreationDisposition,",
        "        uint dwFlagsAndAttributes, IntPtr hTemplateFile);",
        "    public static void Copy(string src, string dst) {",
        "        // GENERIC_READ | FILE_SHARE_READ|WRITE|DELETE | OPEN_EXISTING | FILE_FLAG_BACKUP_SEMANTICS",
        "        IntPtr h = CreateFile(src, 0x80000000u, 7u, IntPtr.Zero, 3u, 0x02000000u, IntPtr.Zero);",
        "        if (h == new IntPtr(-1))",
        '            throw new Exception("Win32 error " + Marshal.GetLastWin32Error() + " opening Cookies file.");',
        "        using (var fs = new FileStream(new SafeFileHandle(h, true), FileAccess.Read))",
        "        using (var fd = File.Create(dst)) { fs.CopyTo(fd); }",
        "    }",
        "}",
        "'@",
        `[ChromeCopier]::Copy('${safeSrc}', '${safeDst}')`,
      ].join("\r\n"),
      "utf8",
    );

    execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptFile}"`,
      { encoding: "utf8" },
    );
  } catch (e) {
    const detail = ((e.stderr || "") + (e.stdout || "") + e.message)
      .toString()
      .trim();
    // Surface a clear, actionable message in the picker UI
    throw new Error(
      detail.includes("Win32") ||
        detail.includes("being used") ||
        detail.includes("error 32")
        ? 'Chrome has the Cookies file locked. Close Chrome and try again, or use "Sign in Fresh".'
        : `Failed to copy Chrome cookies: ${detail.slice(0, 300)}`,
    );
  } finally {
    try {
      fs.unlinkSync(scriptFile);
    } catch {}
  }
}

async function importChromeProfile(profileDir) {
  const dataDir = getChromeDataDir();
  const cookiesFile = chromeCookiesPath(dataDir, profileDir);
  if (!cookiesFile) throw new Error("No Cookies file found for this profile");

  const tmpFile = path.join(app.getPath("temp"), "_claude_cookies_tmp.db");
  const tmpWal = tmpFile + "-wal";
  const tmpShm = tmpFile + "-shm";

  safeCopyLockedFile(cookiesFile, tmpFile);

  // Also copy WAL/SHM if present so sql.js sees uncheckpointed writes
  // (Chrome flushes the refreshed sessionKey to WAL before checkpointing to main DB)
  const walSrc = cookiesFile + "-wal";
  const shmSrc = cookiesFile + "-shm";
  try { if (fs.existsSync(walSrc)) safeCopyLockedFile(walSrc, tmpWal); } catch {}
  try { if (fs.existsSync(shmSrc)) safeCopyLockedFile(shmSrc, tmpShm); } catch {}

  let imported = 0;
  try {
    if (!sqlLib) {
      const initSql = require("sql.js");
      sqlLib = await initSql({
        locateFile: (f) =>
          path.join(__dirname, "node_modules", "sql.js", "dist", f),
      });
    }

    const aesKey = getChromeAesKey();

    // Load DB + WAL into sql.js virtual FS so SQLite applies WAL automatically
    sqlLib.FS.mkdir("/ck");
    sqlLib.FS.writeFile("/ck/c.db", fs.readFileSync(tmpFile));
    if (fs.existsSync(tmpWal)) sqlLib.FS.writeFile("/ck/c.db-wal", fs.readFileSync(tmpWal));
    if (fs.existsSync(tmpShm)) sqlLib.FS.writeFile("/ck/c.db-shm", fs.readFileSync(tmpShm));
    const db = new sqlLib.Database("/ck/c.db");
    const res = db.exec(
      `SELECT name, value, encrypted_value, host_key, path, is_secure, is_httponly, expires_utc
       FROM cookies WHERE host_key LIKE '%claude.ai%'`,
    );
    db.close();

    if (!res.length) return 0;

    const cols = res[0].columns;
    for (const row of res[0].values) {
      const c = Object.fromEntries(cols.map((k, i) => [k, row[i]]));
      const val = c.value || decryptChromeValue(c.encrypted_value, aesKey);
      if (!val) continue;
      if (c.name === "sessionKey") console.log(`[import] sessionKey: ${val.slice(0, 30)}…`);

      // Chrome stores expiry as µs since 1601-01-01 (Windows FILETIME epoch)
      const exp = c.expires_utc ? c.expires_utc / 1e6 - 11644473600 : undefined;
      try {
        await electronSession.defaultSession.cookies.set({
          url: "https://claude.ai",
          name: c.name,
          value: val,
          domain: c.host_key,
          path: c.path || "/",
          secure: !!c.is_secure,
          httpOnly: !!c.is_httponly,
          ...(exp && exp > 0 ? { expirationDate: exp } : {}),
        });
        imported++;
      } catch (e) {
        console.warn(`Cookie ${c.name}: ${e.message}`);
      }
    }
  } finally {
    for (const f of [tmpFile, tmpWal, tmpShm]) {
      try { fs.unlinkSync(f); } catch {}
    }
    try { sqlLib.FS.unlink("/ck/c.db"); } catch {}
    try { sqlLib.FS.unlink("/ck/c.db-wal"); } catch {}
    try { sqlLib.FS.unlink("/ck/c.db-shm"); } catch {}
    try { sqlLib.FS.rmdir("/ck"); } catch {}
  }
  return imported;
}

// ── Login window ──────────────────────────────────────────────────────────────
function showLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: "Sign in to Claude",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  loginWindow.loadURL("https://claude.ai/login");

  // Allow Google OAuth popups (window.open calls) to open inside Electron
  loginWindow.webContents.setWindowOpenHandler(({ url }) => ({
    action: "allow",
    overrideBrowserWindowOptions: {
      parent: loginWindow,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    },
  }));

  loginWindow.webContents.on("did-navigate", (_, url) => {
    const isAuthPage = /\/(login|auth|sso|sign-?in)/i.test(url);
    if (url.includes("claude.ai") && !isAuthPage) {
      setTimeout(tryAutoDetectLogin, 1500);
    }
  });

  loginWindow.on("closed", () => {
    loginWindow = null;
  });
}

async function tryAutoDetectLogin() {
  try {
    usageData = await fetchUsageFromPage();
    updateTray();
    loginWindow?.close();
    broadcastUsage();
    startPolling();
  } catch {
    // keep waiting — user may still be completing login
  }
}

// ── Profile picker window ─────────────────────────────────────────────────────
function showProfilePicker() {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.focus();
    return;
  }

  pickerWindow = new BrowserWindow({
    width: 400,
    height: 460,
    resizable: false,
    title: "Sign in to Claude",
    webPreferences: {
      preload: path.join(__dirname, "profile-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  pickerWindow.loadFile("profile-picker.html");
  pickerWindow.on("closed", () => {
    pickerWindow = null;
  });
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

async function refresh() {
  try {
    usageData = await fetchUsage();
    updateTray();
    broadcastUsage();
  } catch (e) {
    console.error("Refresh failed:", e.message);
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout() {
  stopPolling();
  usageData = null;
  popupWindow?.close();
  await clearClaudeCookies();
  updateTray();
  showLoginWindow();
}

// ── Usage parsing ─────────────────────────────────────────────────────────────
function deepFind(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  for (const v of Object.values(obj)) {
    const f = deepFind(v, keys);
    if (f !== undefined) return f;
  }
}

function parseSessionPct(data) {
  let pct = deepFind(data, [
    "current_session_percentage",
    "sessionPercentage",
    "session_percentage",
    "session_pct",
  ]);
  if (pct == null) {
    const u = deepFind(data, [
      "messages_used",
      "session_messages_used",
      "current_messages_used",
    ]);
    const l = deepFind(data, [
      "messages_allowed",
      "session_messages_limit",
      "session_limit",
      "message_limit",
    ]);
    if (u != null && l) pct = (u / l) * 100;
  }
  return pct != null ? Math.round(pct) : null;
}

function formatTimeUntil(iso) {
  if (!iso) return null;
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return "soon";
  const h = Math.floor(diff / 3600000),
    m = Math.floor((diff % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function buildTooltip() {
  if (!usageData) return "Claude Usage — Loading...";

  const sessionPct = parseSessionPct(usageData);
  let weeklyPct = deepFind(usageData, [
    "weekly_percentage",
    "weeklyPercentage",
    "weekly_pct",
  ]);
  if (weeklyPct == null) {
    const u = deepFind(usageData, ["weekly_messages_used", "weekly_used"]);
    const l = deepFind(usageData, [
      "weekly_messages_limit",
      "weekly_limit",
      "weekly_allowed",
    ]);
    if (u != null && l) weeklyPct = Math.round((u / l) * 100);
  }
  const sR = deepFind(usageData, [
    "session_resets_at",
    "session_reset_at",
    "current_session_reset_at",
    "resets_at",
  ]);
  const wR = deepFind(usageData, [
    "weekly_resets_at",
    "weekly_reset_at",
    "next_weekly_reset",
  ]);

  const lines = [];
  if (sessionPct != null)
    lines.push(
      `Session: ${sessionPct}%${sR ? ` (resets ${formatTimeUntil(sR)})` : ""}`,
    );
  if (weeklyPct != null)
    lines.push(
      `Weekly: ${Math.round(weeklyPct)}%${wR ? ` (resets ${formatTimeUntil(wR)})` : ""}`,
    );
  return lines.length ? lines.join("\n") : "Claude Usage";
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function updateTray() {
  if (!tray) return;
  tray.setImage(iconForPct(parseSessionPct(usageData)));
  tray.setToolTip(buildTooltip());
}

function createTray() {
  tray = new Tray(iconForPct(null));
  tray.setToolTip("Claude Usage — Initializing...");

  tray.on("click", async () => {
    await refresh();
    openPopup();
  });

  tray.on("right-click", () => {
    tray.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: "Show Usage", click: openPopup },
        { label: "Refresh", click: () => refresh() },
        { type: "separator" },
        { label: "Log Out", click: logout },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
  });
}

// ── Popup window ──────────────────────────────────────────────────────────────
function getPopupPosition() {
  const { x: tx, y: ty, width: tw } = tray.getBounds();
  const W = 320,
    H = 240;
  const display = electronScreen.getDisplayNearestPoint({ x: tx, y: ty });
  const { x: wx, y: wy, width: ww, height: wh } = display.workArea;

  let x = Math.round(tx + tw / 2 - W / 2);
  let y = Math.round(ty - H - 8);
  x = Math.max(wx, Math.min(x, wx + ww - W));
  y = Math.max(wy, Math.min(y, wy + wh - H));
  return { x, y, width: W, height: H };
}

function openPopup() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.focus();
    return;
  }

  const bounds = getPopupPosition();
  popupWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  popupWindow.loadFile("popup.html");
  popupWindow.on("blur", () => {
    popupWindow?.close();
  });
  popupWindow.on("closed", () => {
    popupWindow = null;
  });
}

function broadcastUsage() {
  if (popupWindow && !popupWindow.isDestroyed())
    popupWindow.webContents.send("usage-update", usageData);
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle("get-usage", () => usageData);
ipcMain.handle("refresh", async () => {
  await refresh();
  return usageData;
});
ipcMain.on("close-popup", () => popupWindow?.close());

ipcMain.handle("get-chrome-profiles", () => listChromeProfiles());

ipcMain.handle("import-chrome-profile", async (_, dir) => {
  try {
    const count = await importChromeProfile(dir);
    if (count === 0)
      return {
        success: false,
        message:
          "No Claude session found in this profile. Try signing in fresh.",
      };

    pickerWindow?.close();
    await refresh();
    startPolling();
    return { success: true, count };
  } catch (e) {
    return { success: false, message: e.message };
  }
});

ipcMain.on("profile-picker:fresh-login", () => {
  pickerWindow?.close();
  showLoginWindow();
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (process.platform === "darwin") app.dock.hide();
  app.setAppUserModelId("com.aiusage.toolbar");

  createTray();

  // Try to resume an existing session from a previous run
  try {
    usageData = await fetchUsageFromPage();
    updateTray();
    startPolling();
    return;
  } catch {
    // No valid session — fall through
  }

  // Clear stale cookies, offer Chrome import or fresh login
  await clearClaudeCookies();
  const profiles = listChromeProfiles();
  if (profiles.length > 0) {
    showProfilePicker();
  } else {
    showLoginWindow();
  }
});

app.on("window-all-closed", () => {
  /* keep running in tray */
});
app.on("before-quit", () => {
  stopPolling();
  tray?.destroy();
});
