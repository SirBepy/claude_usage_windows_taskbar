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

// ── Chart state (persists across re-renders) ──────────────────────────────────
const lineVisible = { session: true, weekly: true, expected: true };

// ── Chart rendering ───────────────────────────────────────────────────────────
function buildChart(history, weeklyStartMs, weeklyEndMs) {
  const W = 420, H = 172;
  const ML = 30, MR = 8, MT = 8, MB = 38;
  const PW = W - ML - MR;
  const PH = H - MT - MB;

  const minT = weeklyStartMs;
  const maxT = weeklyEndMs;
  const tRange = maxT - minT || 1;

  function px(t) { return ML + ((t - minT) / tRange) * PW; }
  function py(v) { return MT + (1 - v / 100) * PH; }

  // Grid lines + y labels
  const gridLines = [0, 25, 50, 75, 100].map((v) => {
    const y = py(v);
    return `<line x1="${ML}" x2="${W - MR}" y1="${y}" y2="${y}" stroke="#2d2c44" stroke-width="1"/>
            <text x="${ML - 4}" y="${y + 3.5}" text-anchor="end" fill="#6b6990" font-size="8" font-family="Fira Code, monospace">${v}</text>`;
  }).join("");

  // X-axis: tick + two-row label at each midnight within the window
  const dayTicks = [];
  const cursor = new Date(weeklyStartMs);
  cursor.setHours(24, 0, 0, 0); // advance to first midnight after weeklyStart
  while (cursor.getTime() <= weeklyEndMs) {
    const x = px(cursor.getTime()).toFixed(1);
    const dayName = cursor.toLocaleDateString("en-US", { weekday: "short" });
    const dateStr = (cursor.getMonth() + 1) + "/" + cursor.getDate();
    dayTicks.push(
      `<line x1="${x}" x2="${x}" y1="${MT + PH}" y2="${MT + PH + 4}" stroke="#2d2c44" stroke-width="1"/>` +
      `<text x="${x}" y="${H - MB + 14}" text-anchor="middle" fill="#6b6990" font-size="8" font-family="DM Sans, system-ui">${dayName}</text>` +
      `<text x="${x}" y="${H - MB + 24}" text-anchor="middle" fill="#4a4870" font-size="7" font-family="DM Sans, system-ui">${dateStr}</text>`
    );
    cursor.setDate(cursor.getDate() + 1);
  }

  // Reference diagonal: (weeklyStart, 0%) → (weeklyEnd, 100%)
  const refLine =
    `<line id="line-expected"` +
    ` x1="${px(minT).toFixed(1)}" y1="${py(0).toFixed(1)}"` +
    ` x2="${px(maxT).toFixed(1)}" y2="${py(100).toFixed(1)}"` +
    ` stroke="#6b6990" stroke-width="1.5" stroke-dasharray="5,4"/>`;

  // Data polylines — clamp to window bounds to prevent old records leaking outside the SVG
  const pts = history
    .map((r) => ({ t: hourToMs(r.hour), s: r.session_pct, w: r.weekly_pct }))
    .filter((p) => p.t >= minT && p.t <= maxT);

  function makeLine(key, color, id) {
    const f = pts.filter((p) => p[key] !== null && p[key] !== undefined);
    if (f.length === 0) return `<g id="${id}"></g>`;
    if (f.length === 1) {
      return `<circle id="${id}" cx="${px(f[0].t).toFixed(1)}" cy="${py(f[0][key]).toFixed(1)}" r="2.5" fill="${color}"/>`;
    }
    const d = f.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.t).toFixed(1)},${py(p[key]).toFixed(1)}`).join(" ");
    return `<path id="${id}" d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  return (
    `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">` +
    gridLines +
    `<line x1="${ML}" x2="${ML}" y1="${MT}" y2="${MT + PH}" stroke="#2d2c44" stroke-width="1"/>` +
    dayTicks.join("") +
    refLine +
    makeLine("s", "#9d7dfc", "line-session") +
    makeLine("w", "#6e8fff", "line-weekly") +
    `</svg>`
  );
}

// ── Line visibility ───────────────────────────────────────────────────────────
function applyLineVisibility() {
  const svg = statsContent.querySelector("svg");
  if (!svg) return;
  for (const key of ["session", "weekly", "expected"]) {
    const el = svg.querySelector(`#line-${key}`);
    if (el) el.style.display = lineVisible[key] ? "" : "none";
    const leg = document.getElementById(`legend-${key}`);
    if (leg) leg.style.opacity = lineVisible[key] ? "1" : "0.35";
  }
}

function setupLegendToggles() {
  for (const key of ["session", "weekly", "expected"]) {
    const el = document.getElementById(`legend-${key}`);
    if (!el) continue;
    el.onclick = () => {
      lineVisible[key] = !lineVisible[key];
      applyLineVisibility();
    };
  }
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

  // Weekly window bounds
  const weeklyEndMs = latest.weekly_resets_at
    ? new Date(latest.weekly_resets_at).getTime()
    : Date.now() + 3_600_000;
  const weeklyStartMs = weeklyEndMs - 7 * 24 * 3_600_000;

  const chartSvg = buildChart(history, weeklyStartMs, weeklyEndMs);

  const legendItem = (id, color, isDashed, label) => {
    const dot = isDashed
      ? `<span style="display:inline-block;width:14px;height:2px;background:${color};vertical-align:middle;margin-right:4px;border-radius:1px;border-top:2px dashed ${color};"></span>`
      : `<span class="legend-dot" style="background:${color}"></span>`;
    return `<span id="${id}" style="cursor:pointer">${dot}${label}</span>`;
  };

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
        ${legendItem("legend-session",  "#9d7dfc", false, "Session")}
        ${legendItem("legend-weekly",   "#6e8fff", false, "Weekly")}
        ${legendItem("legend-expected", "#6b6990", true,  "Expected")}
      </div>
      ${chartSvg}
    </div>
  `;

  setupLegendToggles();
  applyLineVisibility();
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
const colorOverlayMode = document.getElementById("colorOverlayMode");
const colorOverlayModeSection = document.getElementById("colorOverlayModeSection");
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
        style="width: 50px; background:var(--surface-alt); color:var(--text); border:1px solid var(--border); padding:4px 6px; border-radius:6px; font-family:'DM Sans',system-ui,sans-serif;">
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
    colorOverlayModeSection.style.display = "none";
  } else {
    overlayDisplaySection.style.display = "flex";
    overlayStyleSection.style.display = "flex";
    colorOverlayModeSection.style.display = "flex";
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
    colorOverlayMode.value = settings.colorOverlayMode || "number";
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
    colorContainer.appendChild(createColorRow(0, "#9d7dfc"));

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
    colorOverlayMode: colorOverlayMode.value,
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
