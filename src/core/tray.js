"use strict";

const { Tray, Menu } = require("electron");
const { makeIcon, makeSpinFrame } = require("./icon");
const {
  parseSessionPct,
  parseWeeklyPct,
  buildTooltip,
  calcSafePct,
} = require("./usage-parser");

// ── State ────────────────────────────────────────────────────────────────────
let tray = null;
let tempDisplay = null;
let tempDisplayCycle = null;
let tempDisplayIndex = 0;
let tempDisplayTimer = null;

// Callbacks set during createTray
let _settings = null;
let _getSettings = null;

function hasThresholdCrossed(prevPct, newPct, thresholds) {
  if (prevPct == null || newPct == null || !thresholds) return false;
  return thresholds.some((t) => prevPct < t.min && newPct >= t.min);
}

function getActiveSettings() {
  const s = _getSettings();
  return tempDisplay ? { ...s, ...tempDisplay } : s;
}

function buildDisplayCycle(settings) {
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
  const settings = _getSettings();
  if (!tempDisplayCycle) {
    tempDisplayCycle = buildDisplayCycle(settings);
    tempDisplayIndex = 0;
  }

  tempDisplayIndex = (tempDisplayIndex + 1) % tempDisplayCycle.length;
  tempDisplay = tempDisplayCycle[tempDisplayIndex];
  updateTray(null);

  if (tempDisplayTimer) clearTimeout(tempDisplayTimer);

  if (tempDisplayIndex === 0) {
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
  updateTray(null);
}

function clearTempDisplay() {
  if (tempDisplayTimer) clearTimeout(tempDisplayTimer);
  tempDisplay = null;
  tempDisplayCycle = null;
  tempDisplayIndex = 0;
  tempDisplayTimer = null;
}

function updateTray(usageData) {
  if (!tray) return;
  const s = getActiveSettings();
  const iconSettings = {
    ...s,
    _sessionSafe: calcSafePct(usageData?.five_hour?.resets_at, 5 * 3600000),
    _weeklySafe: calcSafePct(usageData?.seven_day?.resets_at, 7 * 24 * 3600000),
  };
  tray.setImage(makeIcon(parseSessionPct(usageData), parseWeeklyPct(usageData), iconSettings));
  tray.setToolTip(buildTooltip(usageData, s));
}

function buildContextMenu(callbacks) {
  const { loggedIn, getUpdateState, showLoginWindow, showDashboardWindow, refreshWithAnimation, quitAndInstall, downloadUpdate, quit } = callbacks;
  const { state, version } = getUpdateState();

  const template = [
    { label: "Refresh", click: () => refreshWithAnimation() },
    { label: "Dashboard", click: showDashboardWindow },
    { type: "separator" },
    ...(!loggedIn
      ? [{ label: "Log In", click: showLoginWindow }, { type: "separator" }]
      : []),
    { label: "Quit", click: quit },
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

function createTray(callbacks) {
  const { getSettings, isLoggedIn, onLeftClick, onRightClick } = callbacks;
  _getSettings = getSettings;

  tray = new Tray(makeIcon(null, null, getSettings()));
  tray.setToolTip("Claude Usage — Initializing...");

  tray.on("click", () => {
    if (isLoggedIn()) {
      cycleDisplayMode();
    } else {
      onLeftClick();
    }
  });

  tray.on("right-click", () => {
    onRightClick();
  });

  return tray;
}

function getTray() {
  return tray;
}

function setSpinImage(frame, weeklyPct) {
  tray?.setImage(makeSpinFrame(frame, weeklyPct, getActiveSettings()));
}

module.exports = {
  createTray,
  updateTray,
  buildContextMenu,
  cycleDisplayMode,
  resetDisplayMode,
  clearTempDisplay,
  getActiveSettings,
  hasThresholdCrossed,
  getTray,
  setSpinImage,
};
