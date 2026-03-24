"use strict";

// ── View navigation ────────────────────────────────────────────────────────────
const VIEWS = ["dashboard", "settings", "settings-icon", "settings-tooltip", "settings-dashboard", "settings-colors", "settings-update"];

function showView(name) {
  for (const id of VIEWS) {
    document.getElementById(`view-${id}`).classList.toggle("hidden", id !== name);
  }
  const footer = document.getElementById("settings-footer");
  if (footer) footer.style.display = name === "settings" ? "flex" : "none";
}

document.getElementById("settingsBtn").onclick = () => showView("settings");
document.getElementById("backBtn").onclick = () => showView("dashboard");
document.getElementById("cancelBtn").onclick = () => showView("dashboard");
document.getElementById("logoutBtn").onclick = () => window.electronAPI?.logout();

// Settings subpage nav
document.getElementById("nav-icon").onclick = () => showView("settings-icon");
document.getElementById("nav-tooltip").onclick = () => showView("settings-tooltip");
document.getElementById("nav-dashboard-page").onclick = () => showView("settings-dashboard");
document.getElementById("nav-colors").onclick = () => showView("settings-colors");
document.getElementById("nav-update").onclick = () => showView("settings-update");

// Back buttons on all subpages
document.querySelectorAll(".back-to-settings").forEach((btn) => {
  btn.onclick = () => showView("settings");
});

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
let sessionPageOffset = 0;  // 0 = current session window, 1 = one window back, etc.
let weeklyPageOffset = 0;   // 0 = current week, 1 = one week back, etc.
let lastHistory = null;
let currentSettings = {};

// ── Chart rendering ───────────────────────────────────────────────────────────
function buildChart(history, weeklyStartMs, weeklyEndMs, lineKey, svgId) {
  const W = 420, H = 172;
  const ML = 30, MR = 8, MT = 8, MB = 42;
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
            <text x="${ML - 4}" y="${y + 3.5}" text-anchor="end" fill="#6b6990" font-size="10" font-family="Fira Code, monospace">${v}</text>`;
  }).join("");

  // X-axis ticks: hours for short windows (≤12h), days for longer ones
  const tickItems = [];
  const windowMs = maxT - minT;
  if (windowMs <= 12 * 3_600_000) {
    const hourMs = 3_600_000;
    const firstTick = Math.ceil(minT / hourMs) * hourMs;
    for (let t = firstTick; t <= maxT; t += hourMs) {
      const x = px(t).toFixed(1);
      const d = new Date(t);
      const hh = d.getHours().toString().padStart(2, "0");
      const mm = d.getMinutes().toString().padStart(2, "0");
      tickItems.push(
        `<line x1="${x}" x2="${x}" y1="${MT + PH}" y2="${MT + PH + 4}" stroke="#2d2c44" stroke-width="1"/>` +
        `<text x="${x}" y="${H - MB + 14}" text-anchor="middle" fill="#6b6990" font-size="10" font-family="DM Sans, system-ui">${hh}:${mm}</text>`
      );
    }
  } else {
    const cursor = new Date(minT);
    cursor.setHours(24, 0, 0, 0); // advance to first midnight after minT
    while (cursor.getTime() <= maxT) {
      const x = px(cursor.getTime()).toFixed(1);
      const dayName = cursor.toLocaleDateString("en-US", { weekday: "short" });
      const dateStr = (cursor.getMonth() + 1) + "/" + cursor.getDate();
      tickItems.push(
        `<line x1="${x}" x2="${x}" y1="${MT + PH}" y2="${MT + PH + 4}" stroke="#2d2c44" stroke-width="1"/>` +
        `<text x="${x}" y="${H - MB + 14}" text-anchor="middle" fill="#6b6990" font-size="10" font-family="DM Sans, system-ui">${dayName}</text>` +
        `<text x="${x}" y="${H - MB + 26}" text-anchor="middle" fill="#4a4870" font-size="9" font-family="DM Sans, system-ui">${dateStr}</text>`
      );
      cursor.setDate(cursor.getDate() + 1);
    }
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
    `<svg id="${svgId}" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">` +
    gridLines +
    `<line x1="${ML}" x2="${ML}" y1="${MT}" y2="${MT + PH}" stroke="#2d2c44" stroke-width="1"/>` +
    tickItems.join("") +
    (lineKey === "w" ? refLine : "") +
    (lineKey === "s" ? makeLine("s", "#9d7dfc", "line-session") : makeLine("w", "#6e8fff", "line-weekly")) +
    `</svg>`
  );
}

// ── Line visibility ───────────────────────────────────────────────────────────
function applyLineVisibility() {
  for (const key of ["session", "weekly", "expected"]) {
    const el = document.getElementById(`line-${key}`);
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

function setupPaginationButtons() {
  const prevSession = document.getElementById("prev-session");
  const nextSession = document.getElementById("next-session");
  const prevWeekly = document.getElementById("prev-weekly");
  const nextWeekly = document.getElementById("next-weekly");
  if (prevSession) prevSession.onclick = () => { sessionPageOffset++; renderHistory(lastHistory); };
  if (nextSession) nextSession.onclick = () => { sessionPageOffset = Math.max(0, sessionPageOffset - 1); renderHistory(lastHistory); };
  if (prevWeekly) prevWeekly.onclick = () => { weeklyPageOffset++; renderHistory(lastHistory); };
  if (nextWeekly) nextWeekly.onclick = () => { weeklyPageOffset = Math.max(0, weeklyPageOffset - 1); renderHistory(lastHistory); };
}

function renderHistory(history) {
  lastHistory = history;
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

  // Session window bounds (5-hour)
  const SESSION_MS = 5 * 3_600_000;
  const sessionEndMs = latest.session_resets_at
    ? new Date(latest.session_resets_at).getTime()
    : Date.now() + 3_600_000;
  const sessionBaseStartMs = sessionEndMs - SESSION_MS;

  // Per-chart pagination offsets
  const WEEK_MS = 7 * 24 * 3_600_000;

  const sessionShiftMs = sessionPageOffset * SESSION_MS;
  const shiftedSessionEndMs = sessionEndMs - sessionShiftMs;
  const shiftedSessionStartMs = sessionBaseStartMs - sessionShiftMs;
  const hasSessionPrev = history.some((r) => { const t = hourToMs(r.hour); return t >= shiftedSessionStartMs - SESSION_MS && t < shiftedSessionStartMs; });

  const weeklyShiftMs = weeklyPageOffset * WEEK_MS;
  const shiftedWeeklyEndMs = weeklyEndMs - weeklyShiftMs;
  const shiftedWeeklyStartMs = weeklyStartMs - weeklyShiftMs;
  const hasWeeklyPrev = history.some((r) => { const t = hourToMs(r.hour); return t >= shiftedWeeklyStartMs - WEEK_MS && t < shiftedWeeklyStartMs; });

  // Safe pace: % of window time elapsed, clamped 0-100
  const sessionResetMs = latest.session_resets_at ? new Date(latest.session_resets_at).getTime() : null;
  const sessionSafePct = sessionResetMs !== null
    ? Math.max(0, Math.min(100, Math.round((5 * 3_600_000 - (sessionResetMs - Date.now())) / (5 * 3_600_000) * 100)))
    : null;
  const weeklySafePct = Math.max(0, Math.min(100, Math.round((7 * 24 * 3_600_000 - (weeklyEndMs - Date.now())) / (7 * 24 * 3_600_000) * 100)));

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
        ${currentSettings.showSafePace !== false ? `
        <div class="stat-values-row">
          <div class="stat-col">
            <div class="stat-value" style="color:${pctColor(latest.session_pct)}">${fmtPct(latest.session_pct)}</div>
            <div class="stat-sublabel">current</div>
          </div>
          <div class="stat-col">
            <div class="stat-value" style="color:var(--text-dim)">${fmtPct(sessionSafePct)}</div>
            <div class="stat-sublabel">safe pace</div>
          </div>
        </div>` : `
        <div class="stat-value" style="color:${pctColor(latest.session_pct)}">${fmtPct(latest.session_pct)}</div>`}
        ${sessionReset ? `<div class="stat-sublabel">${sessionReset}</div>` : ""}
      </div>
      <div class="stat-card">
        <div class="stat-label">Weekly (7d)</div>
        ${currentSettings.showSafePace !== false ? `
        <div class="stat-values-row">
          <div class="stat-col">
            <div class="stat-value" style="color:${pctColor(latest.weekly_pct)}">${fmtPct(latest.weekly_pct)}</div>
            <div class="stat-sublabel">current</div>
          </div>
          <div class="stat-col">
            <div class="stat-value" style="color:var(--text-dim)">${fmtPct(weeklySafePct)}</div>
            <div class="stat-sublabel">safe pace</div>
          </div>
        </div>` : `
        <div class="stat-value" style="color:${pctColor(latest.weekly_pct)}">${fmtPct(latest.weekly_pct)}</div>`}
        ${weeklyReset ? `<div class="stat-sublabel">${weeklyReset}</div>` : ""}
      </div>
    </div>
    <div class="chart-container" style="margin-bottom: 12px;">
      <div class="chart-pagination">
        <button id="prev-session" class="btn-secondary" ${hasSessionPrev ? "" : "disabled"}>◀</button>
        <span class="chart-pagination-label">${sessionPageOffset === 0 ? "This session" : `${sessionPageOffset} session${sessionPageOffset > 1 ? "s" : ""} ago`}</span>
        <button id="next-session" class="btn-secondary" ${sessionPageOffset === 0 ? "disabled" : ""}>▶</button>
      </div>
      <div class="chart-legend">
        ${legendItem("legend-session", "#9d7dfc", false, "Session")}
      </div>
      ${buildChart(history, shiftedSessionStartMs, shiftedSessionEndMs, "s", "chart-session")}
    </div>
    <div class="chart-container">
      <div class="chart-pagination">
        <button id="prev-weekly" class="btn-secondary" ${hasWeeklyPrev ? "" : "disabled"}>◀</button>
        <span class="chart-pagination-label">${weeklyPageOffset === 0 ? "This week" : `${weeklyPageOffset}w ago`}</span>
        <button id="next-weekly" class="btn-secondary" ${weeklyPageOffset === 0 ? "disabled" : ""}>▶</button>
      </div>
      <div class="chart-legend">
        ${legendItem("legend-weekly",   "#6e8fff", false, "Weekly")}
        ${legendItem("legend-expected", "#6b6990", true,  "Expected")}
      </div>
      ${buildChart(history, shiftedWeeklyStartMs, shiftedWeeklyEndMs, "w", "chart-weekly")}
    </div>
  `;

  setupLegendToggles();
  applyLineVisibility();
  setupPaginationButtons();
}

window.electronAPI?.getUsageHistory().then(renderHistory);
window.electronAPI?.onHistoryUpdated(renderHistory);

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
const showSafePace = document.getElementById("showSafePace");
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
  iconStyleSection.style.display = mode === "number" ? "none" : "flex";
  overlayDisplaySection.style.display = mode === "icon" ? "none" : "flex";
  overlayStyleSection.style.display = mode === "icon" ? "none" : "flex";
  colorOverlayModeSection.style.display = mode === "icon" ? "none" : "flex";
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
    showSafePace.checked = settings.showSafePace !== false;
    estimateTokens.checked = settings.estimateTokens || false;
    currentSettings = settings;
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
    showSafePace: showSafePace.checked,
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
  currentSettings = settings;
  window.electronAPI?.saveSettings(settings);
  renderHistory(lastHistory);
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
