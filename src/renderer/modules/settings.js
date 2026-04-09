"use strict";

// ── Settings ───────────────────────────────────────────────────────────────────
const displayMode = document.getElementById("displayMode");
const iconStyle = document.getElementById("iconStyle");
const timeStyle = document.getElementById("timeStyle");
const iconStyleSection = document.getElementById("iconStyleSection");
const overlayDisplay = document.getElementById("overlayDisplay");
const overlayDisplaySection = document.getElementById("overlayDisplaySection");
const overlayStyle = document.getElementById("overlayStyle");
const overlayStyleSection = document.getElementById("overlayStyleSection");
const colorOverlayMode = document.getElementById("colorOverlayMode");
const colorOverlayModeSection = document.getElementById("colorOverlayModeSection");
const launchAtLogin = document.getElementById("launchAtLogin");
const tooltipLayout = document.getElementById("tooltipLayout");
const tooltipShowSafePace = document.getElementById("tooltipShowSafePace");
const tooltipEstimateTokens = document.getElementById("tooltipEstimateTokens");
const tooltipUseColors = document.getElementById("tooltipUseColors");
const dashboardShowSession = document.getElementById("dashboardShowSession");
const dashboardShowWeekly = document.getElementById("dashboardShowWeekly");
const dashboardShowSafePace = document.getElementById("dashboardShowSafePace");
const dashboardUseColors = document.getElementById("dashboardUseColors");
const sessionPlan = document.getElementById("sessionPlan");
const weeklyPlan = document.getElementById("weeklyPlan");
const colorContainer = document.getElementById("colorContainer");
const colorMode = document.getElementById("colorMode");
const thresholdSection = document.getElementById("thresholdSection");
const paceSection = document.getElementById("paceSection");
const paceBand = document.getElementById("paceBand");
const paceColorUnder = document.getElementById("paceColorUnder");
const paceColorNearSafe = document.getElementById("paceColorNearSafe");
const paceColorNearOver = document.getElementById("paceColorNearOver");
const paceColorOver = document.getElementById("paceColorOver");
const addColorBtn = document.getElementById("addColorBtn");
const soundWorkFinishedEnabled = document.getElementById("soundWorkFinishedEnabled");
const soundWorkFinishedFile = document.getElementById("soundWorkFinishedFile");
const soundWorkFinishedPicker = document.getElementById("soundWorkFinishedPicker");
const soundQuestionAskedEnabled = document.getElementById("soundQuestionAskedEnabled");
const soundQuestionAskedFile = document.getElementById("soundQuestionAskedFile");
const soundQuestionAskedPicker = document.getElementById("soundQuestionAskedPicker");
const soundThresholdEnabled = document.getElementById("soundThresholdEnabled");
const soundThresholdFile = document.getElementById("soundThresholdFile");
const soundThresholdPicker = document.getElementById("soundThresholdPicker");
const refreshUpdateBtn = document.getElementById("refreshUpdateBtn");
const copyLogsBtn = document.getElementById("copyLogsBtn");
const appVersionLabel = document.getElementById("appVersionLabel");
const updateBtn = document.getElementById("updateBtn");
const updateStateLabel = document.getElementById("updateStateLabel");

function saveSettings() {
  const settings = {
    displayMode: displayMode.value,
    iconStyle: iconStyle.value,
    overlayDisplay: overlayDisplay.value,
    overlayStyle: overlayStyle.value,
    colorOverlayMode: colorOverlayMode.value,
    timeStyle: timeStyle.value,
    tooltipLayout: tooltipLayout.value,
    tooltipShowSafePace: tooltipShowSafePace.checked,
    tooltipEstimateTokens: tooltipEstimateTokens.checked,
    tooltipUseColors: tooltipUseColors.checked,
    launchAtLogin: launchAtLogin.checked,
    dashboardShowSession: dashboardShowSession.checked,
    dashboardShowWeekly: dashboardShowWeekly.checked,
    dashboardShowSafePace: dashboardShowSafePace.checked,
    dashboardUseColors: dashboardUseColors.checked,
    sessionPlan: parseInt(sessionPlan.value, 10) || 44000,
    weeklyPlan: parseInt(weeklyPlan.value, 10) || 200000,
    colorMode: colorMode.value,
    paceBand: parseInt(paceBand.value, 10) || 10,
    paceColors: {
      under: paceColorUnder.value,
      nearSafe: paceColorNearSafe.value,
      nearOver: paceColorNearOver.value,
      over: paceColorOver.value,
    },
    colorThresholds: Array.from(colorContainer.querySelectorAll(".color-row"))
      .map((row) => ({
        min: parseInt(row.querySelector(".color-min").value, 10),
        color: row.querySelector(".color-val").value,
      }))
      .sort((a, b) => a.min - b.min),
    sounds: {
      workFinished: { enabled: soundWorkFinishedEnabled.checked, file: soundWorkFinishedFile.value },
      questionAsked: { enabled: soundQuestionAskedEnabled.checked, file: soundQuestionAskedFile.value },
      thresholdCrossed: { enabled: soundThresholdEnabled.checked, file: soundThresholdFile.value },
    },
    projectAliases: currentSettings.projectAliases || {},
  };
  currentSettings = settings;
  window.electronAPI?.saveSettings(settings);
  renderHistory(lastHistory);
}

function createColorRow(min = 0, color = "#ffffff") {
  const row = document.createElement("div");
  row.className = "option color-row";
  row.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
      <input type="number" class="color-min" value="${min}" min="0" max="100"
        style="width: 50px; background:var(--surface-alt); color:var(--text); border:1px solid var(--border); padding:4px 6px; border-radius:6px; font-family:'DM Sans',system-ui,sans-serif;">
      <span style="font-size: 0.8rem; color: var(--text-dim);">%</span>
      <input type="color" class="color-val" value="${color}"
        style="width: 30px; height: 24px; border: none; background: none; cursor: pointer;">
    </div>
    <button class="btn-secondary remove-color-btn" style="padding: 2px 8px; font-size: 0.7rem;">Remove</button>
  `;
  row.querySelector(".remove-color-btn").onclick = () => { row.remove(); saveSettings(); };
  row.querySelector(".color-min").addEventListener("change", saveSettings);
  row.querySelector(".color-val").addEventListener("change", saveSettings);
  return row;
}

function updateVisibilities() {
  const mode = displayMode.value;
  iconStyleSection.style.display = mode === "number" ? "none" : "flex";
  overlayDisplaySection.style.display = mode === "icon" ? "none" : "flex";
  overlayStyleSection.style.display = mode === "icon" ? "none" : "flex";
  colorOverlayModeSection.style.display = mode === "icon" ? "none" : "flex";
}

function updateColorModeVisibility() {
  const isPace = colorMode.value === "pace";
  thresholdSection.style.display = isPace ? "none" : "block";
  paceSection.style.display = isPace ? "block" : "none";
}

displayMode.addEventListener("change", () => { updateVisibilities(); saveSettings(); });
colorMode.addEventListener("change", () => { updateColorModeVisibility(); saveSettings(); });
paceBand.addEventListener("change", saveSettings);
paceColorUnder.addEventListener("change", saveSettings);
paceColorNearSafe.addEventListener("change", saveSettings);
paceColorNearOver.addEventListener("change", saveSettings);
paceColorOver.addEventListener("change", saveSettings);

function renderUpdateState(updateState) {
  if (updateState.state === "downloaded") {
    updateStateLabel.innerText = "Ready to install";
    updateStateLabel.style.color = "var(--primary)";
    updateBtn.style.display = "block";
    updateBtn.disabled = false;
    updateBtn.innerText = `Install v${updateState.version}`;
    updateBtn.onclick = () => window.electronAPI?.installUpdate();
  } else if (updateState.state === "available") {
    updateStateLabel.innerText = `v${updateState.version} available`;
    updateStateLabel.style.color = "var(--text)";
    updateBtn.style.display = "block";
    updateBtn.disabled = false;
    updateBtn.innerText = "Download";
    updateBtn.onclick = () => {
      updateBtn.disabled = true;
      updateBtn.innerText = "Downloading...";
      window.electronAPI?.downloadUpdate();
    };
  } else if (updateState.state === "downloading") {
    updateStateLabel.innerText = "Downloading...";
    updateStateLabel.style.color = "var(--text-dim)";
    updateBtn.style.display = "none";
  } else if (updateState.state === "error") {
    updateStateLabel.innerText = `Error`;
    updateStateLabel.style.color = "#ff4444";
    updateBtn.style.display = "block";
    updateBtn.disabled = false;
    updateBtn.innerText = "Retry";
    updateBtn.onclick = () => window.electronAPI?.checkForUpdates();
  } else {
    updateStateLabel.innerText = "Up to date";
    updateStateLabel.style.color = "var(--text-dim)";
    updateBtn.style.display = "none";
  }
}

window.onload = async () => {
  const settings = await window.electronAPI?.getSettings();
  if (settings) {
    displayMode.value = settings.displayMode || "both";
    iconStyle.value = settings.iconStyle || "rings";
    overlayDisplay.value = settings.overlayDisplay || "none";
    overlayStyle.value = settings.overlayStyle || "classic";
    colorOverlayMode.value = settings.colorOverlayMode || "number";
    timeStyle.value = settings.timeStyle || "absolute";
    tooltipLayout.value = settings.tooltipLayout || "rows";
    tooltipShowSafePace.checked = settings.tooltipShowSafePace !== false;
    tooltipEstimateTokens.checked = settings.tooltipEstimateTokens ?? settings.estimateTokens ?? false;
    tooltipUseColors.checked = settings.tooltipUseColors !== false;
    launchAtLogin.checked = settings.launchAtLogin || false;
    dashboardShowSession.checked = settings.dashboardShowSession !== false;
    dashboardShowWeekly.checked = settings.dashboardShowWeekly !== false;
    dashboardShowSafePace.checked = settings.dashboardShowSafePace ?? settings.showSafePace ?? true;
    dashboardUseColors.checked = settings.dashboardUseColors !== false;
    sessionPlan.value = settings.sessionPlan || 44000;
    weeklyPlan.value = settings.weeklyPlan || 200000;
    colorMode.value = settings.colorMode || "threshold";
    paceBand.value = settings.paceBand ?? 10;
    const pc = settings.paceColors || {};
    paceColorUnder.value = pc.under || "#27ae60";
    paceColorNearSafe.value = pc.nearSafe || "#f1c40f";
    paceColorNearOver.value = pc.nearOver || "#e67e22";
    paceColorOver.value = pc.over || "#e74c3c";
    updateColorModeVisibility();
    currentSettings = settings;
    if (settings.projectAliases) currentSettings.projectAliases = settings.projectAliases;
    (settings.colorThresholds || []).forEach((t) =>
      colorContainer.appendChild(createColorRow(t.min, t.color))
    );

    const sfx = settings.sounds || {};
    const wf = sfx.workFinished || {};
    const tc = sfx.thresholdCrossed || {};
    soundWorkFinishedEnabled.checked = wf.enabled || false;
    soundWorkFinishedFile.value = wf.file || "sound1.mp3";
    const qa = sfx.questionAsked || {};
    soundQuestionAskedEnabled.checked = qa.enabled || false;
    soundQuestionAskedFile.value = qa.file || "sound3.mp3";
    soundThresholdEnabled.checked = tc.enabled || false;
    soundThresholdFile.value = tc.file || "sound6.mp3";
    soundWorkFinishedPicker.style.display = soundWorkFinishedEnabled.checked ? "flex" : "none";
    soundQuestionAskedPicker.style.display = soundQuestionAskedEnabled.checked ? "flex" : "none";
    soundThresholdPicker.style.display = soundThresholdEnabled.checked ? "flex" : "none";
  }

  updateVisibilities();

  // Auto-save on any input change
  for (const el of [iconStyle, overlayDisplay, overlayStyle, colorOverlayMode, timeStyle, tooltipLayout, sessionPlan, weeklyPlan]) {
    el.addEventListener("change", saveSettings);
  }
  for (const el of [launchAtLogin, tooltipShowSafePace, tooltipEstimateTokens, tooltipUseColors, dashboardShowSession, dashboardShowWeekly, dashboardShowSafePace, dashboardUseColors]) {
    el.addEventListener("change", saveSettings);
  }

  addColorBtn.onclick = () => {
    colorContainer.appendChild(createColorRow(0, "#9d7dfc"));
    saveSettings();
  };

  soundWorkFinishedEnabled.addEventListener("change", () => {
    soundWorkFinishedPicker.style.display = soundWorkFinishedEnabled.checked ? "flex" : "none";
    saveSettings();
  });
  soundQuestionAskedEnabled.addEventListener("change", () => {
    soundQuestionAskedPicker.style.display = soundQuestionAskedEnabled.checked ? "flex" : "none";
    saveSettings();
  });
  soundThresholdEnabled.addEventListener("change", () => {
    soundThresholdPicker.style.display = soundThresholdEnabled.checked ? "flex" : "none";
    saveSettings();
  });
  soundWorkFinishedFile.addEventListener("change", saveSettings);
  soundQuestionAskedFile.addEventListener("change", saveSettings);
  soundThresholdFile.addEventListener("change", saveSettings);

  document.getElementById("previewWorkFinished").onclick = () => {
    new Audio(`../assets/sounds/${soundWorkFinishedFile.value}`).play().catch(() => {});
  };
  document.getElementById("previewQuestionAsked").onclick = () => {
    new Audio(`../assets/sounds/${soundQuestionAskedFile.value}`).play().catch(() => {});
  };
  document.getElementById("previewThreshold").onclick = () => {
    new Audio(`../assets/sounds/${soundThresholdFile.value}`).play().catch(() => {});
  };

  const version = await window.electronAPI?.getAppVersion();
  if (version) appVersionLabel.innerText = `Version: ${version}`;

  const initialState = await window.electronAPI?.getUpdateState();
  if (initialState) renderUpdateState(initialState);

  window.electronAPI?.onUpdateStateChange(renderUpdateState);
};

refreshUpdateBtn.addEventListener("click", () => {
  window.electronAPI?.checkForUpdates();
  updateStateLabel.innerText = "Checking...";
  updateStateLabel.style.color = "var(--text-dim)";
  updateBtn.style.display = "none";
});

copyLogsBtn.addEventListener("click", () => {
  window.electronAPI?.copyLogs();
  const originalText = copyLogsBtn.textContent;
  copyLogsBtn.textContent = "Copied to Clipboard!";
  copyLogsBtn.classList.replace("btn-secondary", "btn-primary");
  setTimeout(() => {
    copyLogsBtn.textContent = originalText;
    copyLogsBtn.classList.replace("btn-primary", "btn-secondary");
  }, 2000);
});
