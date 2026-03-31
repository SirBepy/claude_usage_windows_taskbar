"use strict";

const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");

const DEFAULT_SETTINGS = {
  iconStyle: "rings", // "rings" | "bars"
  timeStyle: "absolute", // "absolute" | "countdown"
  launchAtLogin: false,
  estimateTokens: false,
  showSafePace: true,
  sessionPlan: 44000,
  weeklyPlan: 200000,
  displayMode: "both", // "icon" | "number" | "both"
  overlayDisplay: "none",
  overlayStyle: "classic",
  colorOverlayMode: "number", // "number" | "background" | "none"
  colorMode: "threshold", // "threshold" | "pace"
  paceBand: 10,
  paceColors: {
    under: "#27ae60",
    nearSafe: "#f1c40f",
    nearOver: "#e67e22",
    over: "#e74c3c",
  },
  colorThresholds: [
    { min: 0, color: "#27ae60" },
    { min: 50, color: "#e67e22" },
    { min: 80, color: "#e74c3c" },
  ],
  sounds: {
    workFinished: { enabled: false, file: "sound1.mp3" },
    questionAsked: { enabled: false, file: "sound3.mp3" },
    thresholdCrossed: { enabled: false, file: "sound6.mp3" },
  },
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = fs.readFileSync(SETTINGS_PATH, "utf8");
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));

    // Sync with Electron's login item settings
    if (app.isPackaged && typeof settings.launchAtLogin === "boolean") {
      app.setLoginItemSettings({
        openAtLogin: settings.launchAtLogin,
        args: ["--hidden"],
      });
    }
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

module.exports = { loadSettings, saveSettings };
