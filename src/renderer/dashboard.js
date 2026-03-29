"use strict";

// ── View navigation ────────────────────────────────────────────────────────────
const VIEWS = ["dashboard", "settings", "settings-icon", "settings-tooltip", "settings-dashboard", "settings-colors", "settings-sounds", "stats", "stats-project"];

let activeView = "dashboard";

function showView(name) {
  activeView = name;
  for (const id of VIEWS) {
    document.getElementById(`view-${id}`).classList.toggle("hidden", id !== name);
  }
}

document.getElementById("settingsBtn").onclick = () => showView("settings");
document.getElementById("backBtn").onclick = () => showView("dashboard");
document.getElementById("logoutBtn").onclick = () => window.electronAPI?.logout();

// Settings subpage nav
document.getElementById("nav-icon").onclick = () => showView("settings-icon");
document.getElementById("nav-tooltip").onclick = () => showView("settings-tooltip");
document.getElementById("nav-dashboard-page").onclick = () => showView("settings-dashboard");
document.getElementById("nav-colors").onclick = () => showView("settings-colors");
document.getElementById("nav-sounds").onclick = () => showView("settings-sounds");

// Back buttons on all subpages
document.querySelectorAll(".back-to-settings").forEach((btn) => {
  btn.onclick = () => showView("settings");
});

// Stats navigation
document.getElementById("statsBtn").onclick = () => {
  renderStats(lastTokenHistory);
  showView("stats");
};
document.getElementById("statsBackBtn").onclick = () => {
  editingProjectCwd = null;
  showView("dashboard");
};
document.getElementById("projectDetailBackBtn").onclick = () => showView("stats");

// Stats-project range + scroll buttons
document.querySelectorAll(".range-btn").forEach((btn) => {
  btn.onclick = () => {
    projectDetailState.range = btn.dataset.range;
    projectDetailState.offset = 0;
    renderProjectDetail();
  };
});
document.getElementById("chartPrevBtn").onclick = () => {
  projectDetailState.offset++;
  renderProjectDetail();
};
document.getElementById("chartNextBtn").onclick = () => {
  projectDetailState.offset = Math.max(0, projectDetailState.offset - 1);
  renderProjectDetail();
};

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

function getThresholdColor(value, thresholds) {
  if (value == null || !thresholds || thresholds.length === 0) return null;
  const sorted = [...thresholds].sort((a, b) => b.min - a.min);
  for (const t of sorted) {
    if (value >= t.min) return t.color;
  }
  return null;
}

function valueColor(pct) {
  if (currentSettings.dashboardUseColors === false) return "var(--text)";
  const c = getThresholdColor(pct, currentSettings.colorThresholds);
  return c || pctColor(pct);
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
let lastTokenHistory = null;
let currentSettings = {};
let statsSortCol = "totalTokens";
let statsSortDir = -1;
let editingProjectCwd = null;
let projectDetailState = { cwd: null, range: "30d", offset: 0 };

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

  const showSafePace = currentSettings.dashboardShowSafePace !== false;
  const showSessionGraph = currentSettings.dashboardShowSession !== false;
  const showWeeklyGraph = currentSettings.dashboardShowWeekly !== false;

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
        ${showSafePace ? `
        <div class="stat-values-row">
          <div class="stat-col">
            <div class="stat-value" style="color:${valueColor(latest.session_pct)}">${fmtPct(latest.session_pct)}</div>
            <div class="stat-sublabel">current</div>
          </div>
          <div class="stat-col">
            <div class="stat-value" style="color:var(--text-dim)">${fmtPct(sessionSafePct)}</div>
            <div class="stat-sublabel">safe pace</div>
          </div>
        </div>` : `
        <div class="stat-value" style="color:${valueColor(latest.session_pct)}">${fmtPct(latest.session_pct)}</div>`}
        ${sessionReset ? `<div class="stat-sublabel">${sessionReset}</div>` : ""}
      </div>
      <div class="stat-card">
        <div class="stat-label">Weekly (7d)</div>
        ${showSafePace ? `
        <div class="stat-values-row">
          <div class="stat-col">
            <div class="stat-value" style="color:${valueColor(latest.weekly_pct)}">${fmtPct(latest.weekly_pct)}</div>
            <div class="stat-sublabel">current</div>
          </div>
          <div class="stat-col">
            <div class="stat-value" style="color:var(--text-dim)">${fmtPct(weeklySafePct)}</div>
            <div class="stat-sublabel">safe pace</div>
          </div>
        </div>` : `
        <div class="stat-value" style="color:${valueColor(latest.weekly_pct)}">${fmtPct(latest.weekly_pct)}</div>`}
        ${weeklyReset ? `<div class="stat-sublabel">${weeklyReset}</div>` : ""}
      </div>
    </div>
    ${buildTodaySectionHTML(lastTokenHistory)}
    ${showSessionGraph ? `
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
    </div>` : ""}
    ${showWeeklyGraph ? `
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
    </div>` : ""}
  `;

  setupLegendToggles();
  applyLineVisibility();
  setupPaginationButtons();
}

window.electronAPI?.getUsageHistory().then(renderHistory);
window.electronAPI?.onHistoryUpdated((h) => {
  renderHistory(h);
  if (activeView === "stats") renderStats(lastTokenHistory);
});

window.electronAPI?.getTokenHistory().then((th) => { lastTokenHistory = th; });
window.electronAPI?.onTokenHistoryUpdated((th) => {
  lastTokenHistory = th;
  if (lastHistory) renderHistory(lastHistory);
  if (activeView === "stats") renderStats(th);
  if (activeView === "stats-project") renderProjectDetail();
});

// ── Token stats helpers ────────────────────────────────────────────────────────
function fmtK(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return Math.round(n / 1000) + "K";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function totalTok(r) {
  return (r.inputTokens || 0) + (r.outputTokens || 0) + (r.cacheReadTokens || 0) + (r.cacheCreationTokens || 0);
}

function cacheEffPct(r) {
  const denom = (r.inputTokens || 0) + (r.cacheReadTokens || 0) + (r.cacheCreationTokens || 0);
  if (!denom) return 0;
  return Math.round((r.cacheReadTokens || 0) / denom * 100);
}

function projectLabel(cwd) {
  const alias = currentSettings.projectAliases?.[cwd];
  const name = alias?.name || (cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() || cwd : "(unknown)");
  const emoji = alias?.emoji || "";
  return emoji ? `${emoji} ${name}` : name;
}

function aggregateByProject(tokenHistory) {
  const map = new Map();
  for (const r of tokenHistory) {
    const key = r.cwd || "(unknown)";
    if (!map.has(key)) map.set(key, { cwd: key, sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, turns: 0, lastDate: "" });
    const p = map.get(key);
    p.sessions++;
    p.inputTokens += r.inputTokens || 0;
    p.outputTokens += r.outputTokens || 0;
    p.cacheReadTokens += r.cacheReadTokens || 0;
    p.cacheCreationTokens += r.cacheCreationTokens || 0;
    p.turns += r.turns || 0;
    if ((r.date || "") > p.lastDate) p.lastDate = r.date || "";
  }
  return Array.from(map.values());
}

// ── Today summary ──────────────────────────────────────────────────────────────
function buildTodaySectionHTML(tokenHistory) {
  if (!tokenHistory || !tokenHistory.length) return "";
  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = tokenHistory.filter((r) => r.date === today);
  if (!todayRecords.length) return "";

  const byProject = new Map();
  for (const r of todayRecords) {
    const key = r.cwd || "(unknown)";
    if (!byProject.has(key)) byProject.set(key, { cwd: key, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
    const p = byProject.get(key);
    p.inputTokens += r.inputTokens || 0;
    p.outputTokens += r.outputTokens || 0;
    p.cacheReadTokens += r.cacheReadTokens || 0;
    p.cacheCreationTokens += r.cacheCreationTokens || 0;
  }

  const rows = Array.from(byProject.values()).map((p) => {
    const tot = totalTok(p);
    const eff = cacheEffPct(p);
    return `<div class="today-row">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%">${projectLabel(p.cwd)}</span>
      <span style="font-family:'Fira Code',monospace;font-size:0.78rem;color:var(--text-dim)">${fmtK(tot)} tok${eff > 0 ? ` · ${eff}% cache` : ""}</span>
    </div>`;
  }).join("");

  return `<div class="today-section">
    <div class="stat-label" style="margin-bottom:8px">Today</div>
    ${rows}
  </div>`;
}

// ── Stats view ─────────────────────────────────────────────────────────────────
function renderStats(tokenHistory) {
  const container = document.getElementById("stats-table-container");
  if (!container) return;

  if (!tokenHistory || !tokenHistory.length) {
    container.innerHTML = `<div class="no-data">No sessions recorded yet.<br><small style="font-size:0.8rem">Use ↺ Rebuild History to import past sessions.</small></div>`;
    setupBackfillBtn();
    return;
  }

  const projects = aggregateByProject(tokenHistory);
  const grandTotal = projects.reduce((s, p) => s + totalTok(p), 0);

  const colDefs = [
    { key: "project", label: "Project", sortable: false },
    { key: "sessions", label: "Sess", sortable: true },
    { key: "avg", label: "Avg/sess", sortable: true },
    { key: "totalTokens", label: "Total", sortable: true },
    { key: "pct", label: "% of all", sortable: true },
    { key: "lastDate", label: "Last active", sortable: true },
  ];

  function sortVal(p, col) {
    if (col === "sessions") return p.sessions;
    if (col === "avg") return p.sessions ? Math.round(totalTok(p) / p.sessions) : 0;
    if (col === "totalTokens") return totalTok(p);
    if (col === "pct") return grandTotal ? totalTok(p) / grandTotal : 0;
    if (col === "lastDate") return p.lastDate;
    return 0;
  }

  const sorted = [...projects].sort((a, b) => {
    const av = sortVal(a, statsSortCol);
    const bv = sortVal(b, statsSortCol);
    return (av < bv ? -1 : av > bv ? 1 : 0) * statsSortDir;
  });

  const headers = colDefs.map((c) => {
    if (!c.sortable) return `<th>${c.label}</th>`;
    const arrow = statsSortCol === c.key ? (statsSortDir === -1 ? " ↓" : " ↑") : "";
    const cls = statsSortCol === c.key ? " sort-active" : "";
    return `<th class="${cls}" data-sort="${c.key}">${c.label}${arrow}</th>`;
  }).join("");

  const rows = sorted.map((p) => {
    const tot = totalTok(p);
    const avg = p.sessions ? Math.round(tot / p.sessions) : 0;
    const pct = grandTotal ? Math.round(tot / grandTotal * 100) : 0;

    if (editingProjectCwd === p.cwd) {
      const alias = currentSettings.projectAliases?.[p.cwd] || {};
      const defaultName = p.cwd.split(/[/\\]/).filter(Boolean).pop() || p.cwd;
      return `<tr>
        <td colspan="6">
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
            <input id="edit-emoji" value="${alias.emoji || ""}" placeholder="😀" maxlength="2"
              style="width:40px;text-align:center;background:var(--surface-alt);color:var(--text);border:1px solid var(--border);padding:4px;border-radius:6px;font-size:1rem">
            <input id="edit-name" value="${alias.name || defaultName}"
              style="flex:1;background:var(--surface-alt);color:var(--text);border:1px solid var(--border);padding:5px 8px;border-radius:6px;font-family:'DM Sans',system-ui,sans-serif;font-size:0.88rem">
            <button class="btn-primary" id="save-alias-btn" data-cwd="${p.cwd}" style="padding:4px 10px;font-size:0.8rem">Save</button>
            <button class="btn-secondary" id="cancel-alias-btn" style="padding:4px 10px;font-size:0.8rem">✕</button>
          </div>
        </td>
      </tr>`;
    }

    return `<tr class="proj-row" data-cwd="${p.cwd}">
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${projectLabel(p.cwd)}
        <button class="btn-secondary edit-alias-btn" data-cwd="${p.cwd}" style="padding:1px 5px;font-size:0.65rem;margin-left:4px">✏</button>
      </td>
      <td class="mono">${p.sessions}</td>
      <td class="mono">${fmtK(avg)}</td>
      <td class="mono">${fmtK(tot)}</td>
      <td class="mono">${pct}%</td>
      <td class="mono">${p.lastDate || "—"}</td>
    </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="section" style="padding:12px 14px;overflow-x:auto">
      <table class="stats-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  container.querySelectorAll("th[data-sort]").forEach((th) => {
    th.onclick = () => {
      const col = th.dataset.sort;
      statsSortCol === col ? (statsSortDir *= -1) : (statsSortCol = col, statsSortDir = -1);
      renderStats(lastTokenHistory);
    };
  });

  container.querySelectorAll(".proj-row").forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest(".edit-alias-btn")) return;
      openProjectDetail(row.dataset.cwd);
    };
  });

  container.querySelectorAll(".edit-alias-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      editingProjectCwd = btn.dataset.cwd;
      renderStats(lastTokenHistory);
    };
  });

  const saveAliasBtn = container.querySelector("#save-alias-btn");
  if (saveAliasBtn) {
    saveAliasBtn.onclick = () => {
      const cwd = saveAliasBtn.dataset.cwd;
      const emoji = document.getElementById("edit-emoji").value.trim();
      const name = document.getElementById("edit-name").value.trim();
      if (!currentSettings.projectAliases) currentSettings.projectAliases = {};
      currentSettings.projectAliases[cwd] = { emoji, name };
      editingProjectCwd = null;
      saveSettings();
      renderStats(lastTokenHistory);
    };
  }

  const cancelAliasBtn = container.querySelector("#cancel-alias-btn");
  if (cancelAliasBtn) {
    cancelAliasBtn.onclick = () => { editingProjectCwd = null; renderStats(lastTokenHistory); };
  }

  setupBackfillBtn();
}

function setupBackfillBtn() {
  const btn = document.getElementById("backfillBtn");
  const status = document.getElementById("backfill-status");
  if (!btn || btn._hooked) return;
  btn._hooked = true;
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "Scanning...";
    if (status) { status.style.display = "block"; status.textContent = "This may take a while…"; }
    try {
      const result = await window.electronAPI?.backfillTranscripts();
      const msg = result ? `Done — ${result.processed} new, ${result.skipped} skipped` : "Done";
      if (status) status.textContent = msg;
      lastTokenHistory = await window.electronAPI?.getTokenHistory();
      renderStats(lastTokenHistory);
    } catch (e) {
      if (status) status.textContent = "Error: " + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "↺ Rebuild History";
    }
  };
}

// ── Project detail ─────────────────────────────────────────────────────────────
function openProjectDetail(cwd) {
  projectDetailState.cwd = cwd;
  projectDetailState.offset = 0;
  const title = document.getElementById("projectDetailTitle");
  if (title) title.textContent = projectLabel(cwd);
  const pathEl = document.getElementById("projectDetailPath");
  if (pathEl) pathEl.textContent = cwd || "";
  renderProjectDetail();
  showView("stats-project");
}

function renderProjectDetail() {
  const { cwd, range, offset } = projectDetailState;
  const chartContainer = document.getElementById("project-chart-container");
  if (!chartContainer || !lastTokenHistory) return;

  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === range);
  });

  let records = lastTokenHistory.filter((r) => r.cwd === cwd);
  if (range !== "all") {
    const days = range === "7d" ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    records = records.filter((r) => r.date >= cutoffStr);
  }

  const byDate = new Map();
  for (const r of records) {
    const d = r.date || "unknown";
    byDate.set(d, (byDate.get(d) || 0) + totalTok(r));
  }

  const sortedDays = Array.from(byDate.entries())
    .map(([date, tokens]) => ({ date, tokens }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const prevBtn = document.getElementById("chartPrevBtn");
  const nextBtn = document.getElementById("chartNextBtn");

  if (!sortedDays.length) {
    chartContainer.innerHTML = `<div class="no-data">No activity in this period</div>`;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    renderSessionsList(cwd, range);
    return;
  }

  const BARS = 10;
  const endIdx = sortedDays.length - offset * BARS;
  const startIdx = Math.max(0, endIdx - BARS);
  const visible = sortedDays.slice(startIdx, endIdx);

  if (prevBtn) prevBtn.disabled = startIdx === 0;
  if (nextBtn) nextBtn.disabled = offset === 0;

  chartContainer.innerHTML = buildBarChartSVG(visible);
  renderSessionsList(cwd, range);
}

function buildBarChartSVG(days) {
  if (!days.length) return `<div class="no-data">No data</div>`;

  const W = 420, H = 160;
  const ML = 40, MR = 8, MT = 8, MB = 36;
  const PW = W - ML - MR;
  const PH = H - MT - MB;

  const maxTok = Math.max(...days.map((d) => d.tokens), 1);
  const spacing = PW / days.length;
  const barW = Math.max(4, spacing - 3);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
    const val = frac * maxTok;
    const y = MT + (1 - frac) * PH;
    return `<line x1="${ML}" x2="${W - MR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#2d2c44" stroke-width="1"/>
      <text x="${ML - 4}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="#6b6990" font-size="9" font-family="Fira Code,monospace">${fmtK(Math.round(val))}</text>`;
  }).join("");

  const bars = days.map((d, i) => {
    const x = ML + i * spacing + (spacing - barW) / 2;
    const barH = Math.max(1, (d.tokens / maxTok) * PH);
    const y = MT + PH - barH;
    const label = d.date.slice(5); // MM-DD
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="2" fill="#9d7dfc" opacity="0.85"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(H - MB + 14).toFixed(1)}" text-anchor="middle" fill="#6b6990" font-size="9" font-family="DM Sans,system-ui">${label}</text>`;
  }).join("");

  return `<div class="chart-container"><svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">
    ${yTicks}
    <line x1="${ML}" x2="${ML}" y1="${MT}" y2="${MT + PH}" stroke="#2d2c44" stroke-width="1"/>
    ${bars}
  </svg></div>`;
}

function renderSessionsList(cwd, range) {
  const list = document.getElementById("project-sessions-list");
  if (!list || !lastTokenHistory) return;

  let records = lastTokenHistory.filter((r) => r.cwd === cwd);
  if (range !== "all") {
    const days = range === "7d" ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    records = records.filter((r) => r.date >= cutoff.toISOString().slice(0, 10));
  }

  if (!records.length) { list.innerHTML = ""; return; }

  const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));
  const top = sorted.slice(0, 10);
  const rowsHTML = top.map((r) => {
    const tot = totalTok(r);
    const eff = cacheEffPct(r);
    return `<div class="today-row">
      <span style="font-family:'Fira Code',monospace;font-size:0.75rem;color:var(--text-dim)">${r.date}</span>
      <span style="font-family:'Fira Code',monospace;font-size:0.75rem">${fmtK(tot)} tok · ${r.turns || 0} turns${eff > 0 ? ` · ${eff}% cache` : ""}</span>
    </div>`;
  }).join("");

  list.innerHTML = `<div class="section" style="padding:10px 14px">
    <div class="section-title" style="margin-bottom:8px">Recent Sessions</div>
    ${rowsHTML}
    ${records.length > 10 ? `<div style="font-size:0.72rem;color:var(--text-dim);text-align:center;margin-top:6px">…and ${records.length - 10} more</div>` : ""}
  </div>`;
}

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
const addColorBtn = document.getElementById("addColorBtn");
const soundWorkFinishedEnabled = document.getElementById("soundWorkFinishedEnabled");
const soundWorkFinishedFile = document.getElementById("soundWorkFinishedFile");
const soundWorkFinishedPicker = document.getElementById("soundWorkFinishedPicker");
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
    colorThresholds: Array.from(colorContainer.querySelectorAll(".color-row"))
      .map((row) => ({
        min: parseInt(row.querySelector(".color-min").value, 10),
        color: row.querySelector(".color-val").value,
      }))
      .sort((a, b) => a.min - b.min),
    sounds: {
      workFinished: { enabled: soundWorkFinishedEnabled.checked, file: soundWorkFinishedFile.value },
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

displayMode.addEventListener("change", () => { updateVisibilities(); saveSettings(); });

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
    soundThresholdEnabled.checked = tc.enabled || false;
    soundThresholdFile.value = tc.file || "sound6.mp3";
    soundWorkFinishedPicker.style.display = soundWorkFinishedEnabled.checked ? "flex" : "none";
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
  soundThresholdEnabled.addEventListener("change", () => {
    soundThresholdPicker.style.display = soundThresholdEnabled.checked ? "flex" : "none";
    saveSettings();
  });
  soundWorkFinishedFile.addEventListener("change", saveSettings);
  soundThresholdFile.addEventListener("change", saveSettings);

  document.getElementById("previewWorkFinished").onclick = () => {
    new Audio(`../assets/sounds/${soundWorkFinishedFile.value}`).play().catch(() => {});
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
