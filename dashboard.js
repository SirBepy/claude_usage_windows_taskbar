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
document.getElementById("logoutBtn").onclick = () => window.electronAPI?.logout();

// ── Helpers ───────────────────────────────────────────────────────────────────
function hourToMs(h) {
  // "YYYY-MM-DDTHH" → local-time epoch ms
  const [date, hour] = h.split("T");
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, Number(hour)).getTime();
}

function pctColor(v) {
  if (v === null || v === undefined) return "var(--text-dim)";
  if (v >= 80) return "#e74c3c";
  if (v >= 50) return "#e67e22";
  return "#27ae60";
}

function fmtPct(v) {
  return v !== null && v !== undefined ? v + "%" : "--";
}

function fmtResetTime(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d)) return null;
  const now = Date.now();
  const diffMs = d - now;
  if (diffMs <= 0) return "now";
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  if (h > 0) return `resets in ${h}h ${m}m`;
  return `resets in ${m}m`;
}

// ── Chart rendering ───────────────────────────────────────────────────────────
function buildChart(history) {
  // Chart dimensions
  const W = 420, H = 160;
  const ML = 30, MR = 8, MT = 8, MB = 28;
  const PW = W - ML - MR;
  const PH = H - MT - MB;

  const pts = history.map((r) => ({
    t: hourToMs(r.hour),
    s: r.session_pct,
    w: r.weekly_pct,
  }));

  const minT = pts[0].t;
  const maxT = pts.length > 1 ? pts[pts.length - 1].t : minT + 3_600_000;
  const tRange = maxT - minT || 1;

  function px(t) { return ML + ((t - minT) / tRange) * PW; }
  function py(v) { return MT + (1 - v / 100) * PH; }

  // Grid lines + y-axis labels
  const gridLines = [0, 25, 50, 75, 100].map((v) => {
    const y = py(v);
    return `<line x1="${ML}" x2="${W - MR}" y1="${y}" y2="${y}" stroke="#252525" stroke-width="1"/>
            <text x="${ML - 4}" y="${y + 3.5}" text-anchor="end" fill="#555" font-size="8">${v}</text>`;
  }).join("");

  // X-axis day labels — one per unique date at the midpoint of that day's points
  const byDay = {};
  pts.forEach((p) => {
    const day = new Date(p.t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    (byDay[day] = byDay[day] || []).push(p.t);
  });
  const dayLabels = Object.entries(byDay).map(([label, ts]) => {
    const midT = ts.reduce((a, b) => a + b, 0) / ts.length;
    const x = px(midT);
    return `<text x="${x}" y="${H - MB + 13}" text-anchor="middle" fill="#555" font-size="8">${label}</text>`;
  }).join("");

  // Polylines
  function polyline(series, color) {
    const filtered = pts.filter((p) => p[series] !== null && p[series] !== undefined);
    if (filtered.length === 0) return "";
    if (filtered.length === 1) {
      const x = px(filtered[0].t), y = py(filtered[0][series]);
      return `<circle cx="${x}" cy="${y}" r="2.5" fill="${color}"/>`;
    }
    const d = filtered.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.t).toFixed(1)},${py(p[series]).toFixed(1)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">
    ${gridLines}
    <line x1="${ML}" x2="${ML}" y1="${MT}" y2="${MT + PH}" stroke="#252525" stroke-width="1"/>
    ${polyline("s", "#4a90e2")}
    ${polyline("w", "#9b59b6")}
    ${dayLabels}
  </svg>`;
}

// ── Stats rendering ───────────────────────────────────────────────────────────
const statsContent = document.getElementById("stats-content");

function renderHistory(history) {
  if (!history || history.length === 0) {
    statsContent.innerHTML = `<div class="no-data">No history recorded yet.<br><small style="font-size:0.8rem">Data appears after the first successful refresh.</small></div>`;
    return;
  }

  const latest = history[history.length - 1];
  const sessionReset = fmtResetTime(latest.session_resets_at);
  const weeklyReset = fmtResetTime(latest.weekly_resets_at);

  const chartSvg = buildChart(history);

  statsContent.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-label">Session (5h)</div>
        <div class="stat-value" style="color:${pctColor(latest.session_pct)}">${fmtPct(latest.session_pct)}</div>
        ${sessionReset ? `<div class="stat-sublabel">${sessionReset}</div>` : ""}
      </div>
      <div class="stat-card">
        <div class="stat-label">Weekly (7d)</div>
        <div class="stat-value" style="color:${pctColor(latest.weekly_pct)}">${fmtPct(latest.weekly_pct)}</div>
        ${weeklyReset ? `<div class="stat-sublabel">${weeklyReset}</div>` : ""}
      </div>
    </div>
    <div class="chart-container">
      <div class="chart-legend">
        <span><span class="legend-dot" style="background:#4a90e2"></span>Session</span>
        <span><span class="legend-dot" style="background:#9b59b6"></span>Weekly</span>
      </div>
      ${chartSvg}
    </div>
  `;
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

  window.electronAPI?.onUpdateStateChange(renderUpdateState);
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
