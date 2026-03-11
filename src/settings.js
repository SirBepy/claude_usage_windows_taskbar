"use strict";

const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");

const DEFAULT_SETTINGS = {
  iconStyle: "rings", // "rings" | "bars"
  timeStyle: "absolute", // "absolute" | "countdown"
  launchAtLogin: false,
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

    // Sycn with Electron's login item settings
    if (typeof settings.launchAtLogin === "boolean") {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
    }
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

module.exports = { loadSettings, saveSettings };
