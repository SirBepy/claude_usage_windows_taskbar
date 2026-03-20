"use strict";

// ── View navigation ────────────────────────────────────────────────────────────
const viewDashboard = document.getElementById("view-dashboard");
const viewSettings = document.getElementById("view-settings");

function showView(name) {
  viewDashboard.classList.toggle("hidden", name !== "dashboard");
  viewSettings.classList.toggle("hidden", name !== "settings");
}

document.getElementById("settingsBtn").onclick = () => showView("settings");
document.getElementById("backBtn").onclick = () => showView("dashboard");
document.getElementById("cancelBtn").onclick = () => showView("dashboard");

document.getElementById("logoutBtn").onclick = () => {
  window.electronAPI?.logout();
};

// ── Stats / History ────────────────────────────────────────────────────────────
const statsContent = document.getElementById("stats-content");

function renderHistory(history) {
  statsContent.innerText =
    history.length > 0
      ? `Logged ${history.length} snapshots.`
      : "No history recorded yet.";
}

window.electronAPI?.getUsageHistory().then(renderHistory);
window.electronAPI?.onHistoryUpdated(renderHistory);

// ── Settings ───────────────────────────────────────────────────────────────────
const displayMode = document.getElementById("displayMode");
const iconStyle = document.getElementById("iconStyle");
const timeStyle = document.getElementById("timeStyle");
const iconStyleSection = document.getElementById("iconStyleSection");
const timeStyleSection = document.getElementById("timeStyleSection");
const overlayDisplay = document.getElementById("overlayDisplay");
const overlayDisplaySection = document.getElementById("overlayDisplaySection");
const overlayStyle = document.getElementById("overlayStyle");
const overlayStyleSection = document.getElementById("overlayStyleSection");
const colorOverlayNumber = document.getElementById("colorOverlayNumber");
const colorOverlayNumberSection = document.getElementById("colorOverlayNumberSection");
const launchAtLogin = document.getElementById("launchAtLogin");
const estimateTokens = document.getElementById("estimateTokens");
const sessionPlan = document.getElementById("sessionPlan");
const weeklyPlan = document.getElementById("weeklyPlan");
const colorContainer = document.getElementById("colorContainer");
const addColorBtn = document.getElementById("addColorBtn");
const saveBtn = document.getElementById("saveBtn");
const refreshUpdateBtn = document.getElementById("refreshUpdateBtn");
const copyLogsBtn = document.getElementById("copyLogsBtn");
const appVersionLabel = document.getElementById("appVersionLabel");
const updateBtn = document.getElementById("updateBtn");
const updateStateLabel = document.getElementById("updateStateLabel");

function createColorRow(min = 0, color = "#ffffff") {
  const row = document.createElement("div");
  row.className = "option";
  row.style.marginBottom = "8px";
  row.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
      <input type="number" class="color-min" value="${min}" min="0" max="100"
        style="width: 50px; background:#2a2a2a; color:var(--text); border:1px solid var(--border); padding:4px; border-radius:4px;">
      <span style="font-size: 0.8rem; color: var(--text-dim);">%</span>
      <input type="color" class="color-val" value="${color}"
        style="width: 30px; height: 24px; border: none; background: none; cursor: pointer;">
    </div>
    <button class="btn-secondary remove-color-btn" style="padding: 2px 8px; font-size: 0.7rem;">Remove</button>
  `;
  row.querySelector(".remove-color-btn").onclick = () => row.remove();
  return row;
}

function updateVisibilities() {
  const mode = displayMode.value;
  if (mode === "number") {
    iconStyleSection.style.display = "none";
    timeStyleSection.style.display = "none";
  } else {
    iconStyleSection.style.display = "flex";
    timeStyleSection.style.display = "flex";
  }
  if (mode === "icon") {
    overlayDisplaySection.style.display = "none";
    overlayStyleSection.style.display = "none";
    colorOverlayNumberSection.style.display = "none";
  } else {
    overlayDisplaySection.style.display = "flex";
    overlayStyleSection.style.display = "flex";
    colorOverlayNumberSection.style.display = "flex";
  }
}

displayMode.addEventListener("change", updateVisibilities);

function renderUpdateState(updateState) {
  if (updateState.state === "downloaded") {
    updateStateLabel.innerText = "Update ready to install";
    updateStateLabel.style.color = "var(--primary)";
    updateBtn.style.display = "block";
    updateBtn.disabled = false;
    updateBtn.innerText = `Install v${updateState.version}`;
    updateBtn.onclick = () => window.electronAPI?.installUpdate();
  } else if (updateState.state === "available") {
    updateStateLabel.innerText = `New version available: v${updateState.version}`;
    updateStateLabel.style.color = "var(--text)";
    updateBtn.style.display = "block";
    updateBtn.disabled = false;
    updateBtn.innerText = "Download & Update";
    updateBtn.onclick = () => {
      updateBtn.disabled = true;
      updateBtn.innerText = "Downloading...";
      window.electronAPI?.downloadUpdate();
    };
  } else if (updateState.state === "downloading") {
    updateStateLabel.innerText = "Downloading update...";
    updateStateLabel.style.color = "var(--text-dim)";
    updateBtn.style.display = "none";
  } else if (updateState.state === "error") {
    updateStateLabel.innerText = `Update error: ${updateState.version}`;
    updateStateLabel.style.color = "#ff4444";
    updateBtn.style.display = "block";
    updateBtn.disabled = false;
    updateBtn.innerText = "Retry Check";
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
    timeStyle.value = settings.timeStyle || "absolute";
    overlayDisplay.value = settings.overlayDisplay || "none";
    overlayStyle.value = settings.overlayStyle || "classic";
    colorOverlayNumber.checked = settings.colorOverlayNumber !== false;
    launchAtLogin.checked = settings.launchAtLogin || false;
    estimateTokens.checked = settings.estimateTokens || false;
    sessionPlan.value = settings.sessionPlan || 44000;
    weeklyPlan.value = settings.weeklyPlan || 200000;
    (settings.colorThresholds || []).forEach((t) =>
      colorContainer.appendChild(createColorRow(t.min, t.color))
    );
  }

  updateVisibilities();

  const toggleInputs = () => {
    sessionPlan.disabled = !estimateTokens.checked;
    weeklyPlan.disabled = !estimateTokens.checked;
  };
  estimateTokens.addEventListener("change", toggleInputs);
  toggleInputs();

  addColorBtn.onclick = () =>
    colorContainer.appendChild(createColorRow(0, "#4a90e2"));

  const version = await window.electronAPI?.getAppVersion();
  if (version) appVersionLabel.innerText = `Version: ${version}`;

  const initialState = await window.electronAPI?.getUpdateState();
  if (initialState) renderUpdateState(initialState);

  window.electronAPI?.onUpdateStateChange((state) => {
    renderUpdateState(state);
  });
};

saveBtn.onclick = () => {
  const settings = {
    iconStyle: iconStyle.value,
    timeStyle: timeStyle.value,
    displayMode: displayMode.value,
    overlayDisplay: overlayDisplay.value,
    overlayStyle: overlayStyle.value,
    colorOverlayNumber: colorOverlayNumber.checked,
    launchAtLogin: launchAtLogin.checked,
    estimateTokens: estimateTokens.checked,
    sessionPlan: parseInt(sessionPlan.value, 10),
    weeklyPlan: parseInt(weeklyPlan.value, 10),
    colorThresholds: Array.from(colorContainer.querySelectorAll(".option"))
      .map((row) => ({
        min: parseInt(row.querySelector(".color-min").value, 10),
        color: row.querySelector(".color-val").value,
      }))
      .sort((a, b) => a.min - b.min),
  };
  window.electronAPI?.saveSettings(settings);
  showView("dashboard");
};

refreshUpdateBtn.addEventListener("click", () => {
  window.electronAPI?.checkForUpdates();
  updateStateLabel.innerText = "Checking for updates...";
  updateStateLabel.style.color = "var(--text-dim)";
  updateBtn.style.display = "none";

  const updateInfo = document.getElementById("updateInfo");
  const updateStatus = document.getElementById("updateStatus");
  if (updateStatus) updateStatus.textContent = "Checking for updates...";
  if (updateInfo) updateInfo.style.display = "block";

  setTimeout(() => {
    if (updateInfo) updateInfo.style.display = "none";
  }, 5000);
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
