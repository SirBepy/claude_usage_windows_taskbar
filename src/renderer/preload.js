"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // History & Stats
  getUsageHistory: () => ipcRenderer.invoke("get-usage-history"),

  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.send("save-settings", settings),
  logout: () => ipcRenderer.send("logout"),

  // Updates & Version
  getUpdateState: () => ipcRenderer.invoke("get-update-state"),
  downloadUpdate: () => ipcRenderer.send("download-update"),
  installUpdate: () => ipcRenderer.send("install-update"),
  checkForUpdates: () => ipcRenderer.send("check-for-updates"),
  copyLogs: () => ipcRenderer.send("copy-logs"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),

  onUpdateStateChange: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on("update-state-changed", handler);
    return () => ipcRenderer.removeListener("update-state-changed", handler);
  },
  onHistoryUpdated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on("history-updated", handler);
    return () => ipcRenderer.removeListener("history-updated", handler);
  },
});
