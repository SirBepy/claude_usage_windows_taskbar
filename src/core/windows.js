"use strict";

const { BrowserWindow } = require("electron");
const path = require("path");
const { fetchUsageFromPage } = require("./scraper");

const APP_ROOT = path.join(__dirname, "..", "..");

function showLoginWindow(callbacks) {
  const { getLoginWindow, setLoginWindow, onLoginSuccess, onClosed } = callbacks;

  const existing = getLoginWindow();
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    title: "Sign in to Claude",
    icon: path.join(APP_ROOT, "src", "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  setLoginWindow(win);

  win.loadURL("https://claude.ai/login");

  // Allow Google OAuth popups to open inside Electron.
  win.webContents.setWindowOpenHandler(({ url }) => ({
    action: "allow",
    overrideBrowserWindowOptions: {
      parent: win,
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

    verifying = true;
    win.hide();

    setTimeout(async () => {
      try {
        const usageData = await fetchUsageFromPage();
        onLoginSuccess(usageData);
        win.close();
      } catch {
        verifying = false;
        if (win && !win.isDestroyed()) {
          win.loadURL("https://claude.ai/login");
          win.show();
        }
      }
    }, 1500);
  }

  win.webContents.on("did-navigate", (_, url) => onNavigate(url));
  win.webContents.on("did-navigate-in-page", (_, url) => onNavigate(url));

  win.on("closed", () => {
    setLoginWindow(null);
    onClosed();
  });
}

function showDashboardWindow(callbacks) {
  const { getDashboardWindow, setDashboardWindow, onClosed } = callbacks;

  const existing = getDashboardWindow();
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 480,
    height: 700,
    title: "Claude Usage",
    icon: path.join(APP_ROOT, "src", "assets", "icon.png"),
    resizable: true,
    backgroundColor: "#121212",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(APP_ROOT, "src", "renderer", "preload.js"),
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(APP_ROOT, "src", "renderer", "dashboard.html"));
  setDashboardWindow(win);

  win.on("closed", () => {
    setDashboardWindow(null);
    onClosed();
  });
}

module.exports = { showLoginWindow, showDashboardWindow };
