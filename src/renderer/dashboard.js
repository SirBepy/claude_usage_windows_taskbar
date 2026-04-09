"use strict";

// ── View navigation ────────────────────────────────────────────────────────────
const VIEWS = ["dashboard", "settings", "settings-icon", "settings-tooltip", "settings-dashboard", "settings-colors", "settings-sounds", "stats", "stats-project", "graph-detail"];

let activeView = "dashboard";
let previousView = "dashboard";

function showView(name) {
  previousView = activeView;
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
  showView("dashboard");
};
document.getElementById("projectDetailBackBtn").onclick = () => showView(previousView === "stats-project" ? "stats" : previousView);
document.getElementById("graphDetailBackBtn").onclick = () => showView("dashboard");

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

// ── State (shared as window globals with extracted modules) ──────────────────
let lastHistory = null;
let lastTokenHistory = null;
let currentSettings = {};
let projectDetailState = { cwd: null, range: "30d", offset: 0 };

// ── Stats rendering ───────────────────────────────────────────────────────────
const statsContent = document.getElementById("stats-content");

/** Re-render the main dashboard and wire all interactive elements. */
function refreshDashboard() {
  if (!lastHistory) return;
  renderHistory(lastHistory);
  wireProjectListClicks(statsContent, refreshDashboard);
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
            <div class="stat-value" style="color:${valueColor(latest.session_pct, sessionSafePct)}">${fmtPct(latest.session_pct)}</div>
            <div class="stat-sublabel">current</div>
          </div>
          <div class="stat-col">
            <div class="stat-value" style="color:var(--text-dim)">${fmtPct(sessionSafePct)}</div>
            <div class="stat-sublabel">safe pace</div>
          </div>
        </div>` : `
        <div class="stat-value" style="color:${valueColor(latest.session_pct, sessionSafePct)}">${fmtPct(latest.session_pct)}</div>`}
        ${sessionReset ? `<div class="stat-sublabel">${sessionReset}</div>` : ""}
      </div>
      <div class="stat-card">
        <div class="stat-label">Weekly (7d)</div>
        ${showSafePace ? `
        <div class="stat-values-row">
          <div class="stat-col">
            <div class="stat-value" style="color:${valueColor(latest.weekly_pct, weeklySafePct)}">${fmtPct(latest.weekly_pct)}</div>
            <div class="stat-sublabel">current</div>
          </div>
          <div class="stat-col">
            <div class="stat-value" style="color:var(--text-dim)">${fmtPct(weeklySafePct)}</div>
            <div class="stat-sublabel">safe pace</div>
          </div>
        </div>` : `
        <div class="stat-value" style="color:${valueColor(latest.weekly_pct, weeklySafePct)}">${fmtPct(latest.weekly_pct)}</div>`}
        ${weeklyReset ? `<div class="stat-sublabel">${weeklyReset}</div>` : ""}
      </div>
    </div>
    ${buildTodaySectionHTML(lastTokenHistory)}
    ${showSessionGraph ? buildGraphCard({
      id: "session",
      history,
      startMs: shiftedSessionStartMs,
      endMs: shiftedSessionEndMs,
      lineKey: "s",
      pctKey: "s",
      pageOffset: sessionPageOffset,
      hasPrev: hasSessionPrev,
      prevId: "prev-session",
      nextId: "next-session",
      pageLabel: sessionPageOffset === 0 ? "This session" : `${sessionPageOffset} session${sessionPageOffset > 1 ? "s" : ""} ago`,
      legends: [legendItem("legend-session", "#9d7dfc", false, "Session"), legendItem("legend-expected", "#6b6990", true, "Expected")],
      maxItems: 5,
    }) : ""}
    ${showWeeklyGraph ? buildGraphCard({
      id: "weekly",
      history,
      startMs: shiftedWeeklyStartMs,
      endMs: shiftedWeeklyEndMs,
      lineKey: "w",
      pctKey: "w",
      pageOffset: weeklyPageOffset,
      hasPrev: hasWeeklyPrev,
      prevId: "prev-weekly",
      nextId: "next-weekly",
      pageLabel: weeklyPageOffset === 0 ? "This week" : `${weeklyPageOffset}w ago`,
      legends: [legendItem("legend-weekly", "#6e8fff", false, "Weekly"), legendItem("legend-expected", "#6b6990", true, "Expected")],
      maxItems: 5,
    }) : ""}
  `;

  setupLegendToggles();
  applyLineVisibility();
  setupPaginationButtons();
  wireChartModeToggles(statsContent);
}

// Merge active (live) sessions into token history so project lists show ongoing work.
async function fetchTokenHistoryWithLive() {
  const history = await window.electronAPI?.getTokenHistory() || [];
  try {
    const active = await window.electronAPI?.getActiveSessions() || [];
    if (active.length) return [...history, ...active];
  } catch { /* handler may not be registered yet */ }
  return history;
}

// Gate initial render: only render once usage history, token history, AND settings are loaded.
let _initUsage = null;
let _initTokens = null;
let _initSettings = false;
function tryInitialRender() {
  if (_initUsage && _initTokens && _initSettings) refreshDashboard();
}
window.electronAPI?.getUsageHistory().then((h) => { _initUsage = h; lastHistory = h; tryInitialRender(); });
fetchTokenHistoryWithLive().then((th) => { _initTokens = th; lastTokenHistory = th; tryInitialRender(); });
window.electronAPI?.getSettings().then((s) => { if (s) currentSettings = s; _initSettings = true; tryInitialRender(); });

window.electronAPI?.onHistoryUpdated((h) => {
  lastHistory = h;
  refreshDashboard();
  if (activeView === "stats") renderStats(lastTokenHistory);
});
window.electronAPI?.onTokenHistoryUpdated(async (th) => {
  let active = [];
  try { active = await window.electronAPI?.getActiveSessions() || []; } catch { /* ignore */ }
  lastTokenHistory = active.length ? [...(th || []), ...active] : (th || []);
  refreshDashboard();
  if (activeView === "stats") renderStats(lastTokenHistory);
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
  const fallback = cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() || cwd : "(unknown)";
  if (!alias) return fallback;
  const name = alias.name || fallback;
  // backward compat: old saves stored emoji separately
  const emoji = alias.emoji || "";
  return emoji && !name.startsWith(emoji) ? `${emoji} ${name}` : name;
}

function isSubagentCwd(cwd) {
  return cwd && /[/\\]\.claude[/\\]subagents[/\\]/i.test(cwd);
}

function aggregateByProject(tokenHistory) {
  const map = new Map();
  for (const r of tokenHistory) {
    if (isSubagentCwd(r.cwd)) continue;
    const key = r.cwd || "(unknown)";
    if (!map.has(key)) map.set(key, { cwd: key, sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, turns: 0, lastDate: "" });
    const p = map.get(key);
    p.sessions++;
    p.inputTokens += r.inputTokens || 0;
    p.outputTokens += r.outputTokens || 0;
    p.cacheReadTokens += r.cacheReadTokens || 0;
    p.cacheCreationTokens += r.cacheCreationTokens || 0;
    p.turns += r.turns || 0;
    const ts = r.lastActiveAt || r.recordedAt || r.date || "";
    if (ts > p.lastDate) p.lastDate = ts;
  }
  return Array.from(map.values());
}

// ── Reusable project list component ────────────────────────────────────────────

// Per-list sort state, keyed by list id
const listSortState = {};

/**
 * Renders a project list as a stats-table (same look as Token Stats page).
 *
 * @param {object}   opts
 * @param {string}   opts.title       - Section heading
 * @param {object[]} opts.projects    - Array of { cwd, tokens, lastActiveAt, sessionPct? }
 * @param {number}  [opts.maxItems]   - Cap visible rows; shows "Show all" button if exceeded
 * @param {boolean} [opts.showTime]   - Show the "Last active" column (default true)
 * @param {boolean} [opts.showPct]    - Show the "Session %" column (default false)
 * @param {boolean} [opts.sortable]   - Show sortable column headers (default false)
 * @param {string}  [opts.defaultSort] - Default sort column key (default "lastActiveAt")
 * @param {string}  [opts.id]         - Unique id for the list (required if sortable)
 * @param {string}  [opts.style]      - Extra inline style on wrapper div
 * @returns {string} HTML string
 */
function buildProjectListHTML({ title, projects, maxItems, showTime = true, showPct = false, sortable = false, defaultSort = "lastActiveAt", id, style }) {
  if (!projects || !projects.length) return "";

  const containerId = id || `plist-${Math.random().toString(36).slice(2, 8)}`;

  // Init sort state for this list if needed
  if (!listSortState[containerId]) {
    listSortState[containerId] = { col: defaultSort, dir: -1 };
  }
  const ss = listSortState[containerId];

  // Build column definitions based on flags
  const cols = [{ key: "project", label: "Project" }];
  cols.push({ key: "tokens", label: "Total" });
  if (showPct) cols.push({ key: "sessionPct", label: "Session %" });
  if (showTime) cols.push({ key: "lastActiveAt", label: "Last active" });

  // Sort
  function sortVal(p, col) {
    if (col === "project") return projectLabel(p.cwd).toLowerCase();
    if (col === "tokens") return p.tokens || 0;
    if (col === "sessionPct") return p.sessionPct ?? -1;
    if (col === "lastActiveAt") return p.lastActiveAt || "";
    return 0;
  }
  const sorted = [...projects].sort((a, b) => {
    const av = sortVal(a, ss.col);
    const bv = sortVal(b, ss.col);
    return (av < bv ? -1 : av > bv ? 1 : 0) * ss.dir;
  });

  const capped = maxItems && sorted.length > maxItems;
  const visible = capped ? sorted.slice(0, maxItems) : sorted;

  // Headers
  let headerRow = "";
  if (sortable) {
    headerRow = "<thead><tr>" + cols.map((c) => {
      const arrow = ss.col === c.key ? (ss.dir === -1 ? " ↓" : " ↑") : "";
      const cls = ss.col === c.key ? " sort-active" : "";
      return `<th class="${cls}" data-sort="${c.key}" data-list="${containerId}">${c.label}${arrow}</th>`;
    }).join("") + "</tr></thead>";
  }

  const renderRow = (p) => `<tr class="proj-row" data-cwd="${p.cwd}">
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${projectLabel(p.cwd)}</td>
      <td class="mono">${fmtK(p.tokens)}</td>
      ${showPct ? `<td class="mono">${p.sessionPct != null ? p.sessionPct + "%" : "—"}</td>` : ""}
      ${showTime ? `<td class="mono">${timeAgo(p.lastActiveAt)}</td>` : ""}
    </tr>`;

  const visibleRows = visible.map(renderRow).join("");
  const hiddenRows = capped ? sorted.slice(maxItems).map(renderRow).join("") : "";

  const remaining = sorted.length - visible.length;
  const showMoreBtn = capped
    ? `<tfoot><tr><td colspan="${cols.length}" style="text-align:center;padding-top:6px;border-bottom:none">
         <button class="btn-secondary show-more-btn" data-list-id="${containerId}" style="font-size:0.72rem;padding:2px 10px">Show ${remaining} more</button>
       </td></tr></tfoot>`
    : "";

  return `<div class="today-section" ${style ? `style="${style}"` : ""}>
    ${title ? `<div style="font-size:0.92rem;font-weight:700;margin-bottom:10px">${title}</div>` : ""}
    <table class="stats-table">
      ${headerRow}
      <tbody>${visibleRows}</tbody>
      ${showMoreBtn}
    </table>
  </div>`;
}

/** Wire click handlers for project list rows, show-all buttons, and sort headers. */
function wireProjectListClicks(container, onSort) {
  if (!container) return;
  container.querySelectorAll(".proj-row").forEach((row) => {
    if (row.dataset.cwd && !row._wired) {
      row._wired = true;
      row.onclick = () => openProjectDetail(row.dataset.cwd);
    }
  });
  container.querySelectorAll(".show-more-btn").forEach((btn) => {
    if (btn._wired) return;
    btn._wired = true;
    btn.onclick = () => {
      const listId = btn.dataset.listId;
      if (listId && graphDetailConfigs[listId]) {
        openGraphDetail(listId);
      }
    };
  });
  container.querySelectorAll("th[data-sort][data-list]").forEach((th) => {
    if (th._wired) return;
    th._wired = true;
    th.onclick = () => {
      const listId = th.dataset.list;
      const col = th.dataset.sort;
      const ss = listSortState[listId];
      if (!ss) return;
      ss.col === col ? (ss.dir *= -1) : (ss.col = col, ss.dir = -1);
      if (onSort) onSort(listId);
    };
  });
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
    if (!byProject.has(key)) byProject.set(key, { cwd: key, tokens: 0, lastActiveAt: "" });
    const p = byProject.get(key);
    p.tokens += totalTok(r);
    const ts = r.lastActiveAt || r.recordedAt || r.date || "";
    if (ts > p.lastActiveAt) p.lastActiveAt = ts;
  }

  return buildProjectListHTML({
    title: "Today",
    projects: Array.from(byProject.values()),
    sortable: true,
    defaultSort: "lastActiveAt",
    id: "today-projects",
  });
}

/**
 * Build HTML listing projects active during a given time window.
 * Uses overlap check: session overlaps [startMs, endMs] if it started before the
 * window ends AND was last active after the window starts.
 *
 * @param {number}   startMs        - Window start (epoch ms)
 * @param {number}   endMs          - Window end (epoch ms)
 * @param {object[]} [usageHistory] - Usage history records
 * @param {string}   [pctKey="s"]   - "s" for session_pct, "w" for weekly_pct
 */
function buildWindowProjectsHTML(startMs, endMs, usageHistory, pctKey = "s", maxItems = 5, listId = null) {
  if (!lastTokenHistory || !lastTokenHistory.length) return "";

  const byProject = new Map();
  for (const r of lastTokenHistory) {
    const endTs = r.lastActiveAt || "";
    const startTs = r.startedAt || "";
    if (!endTs) continue;

    const sessionEndMs = new Date(endTs).getTime();
    if (isNaN(sessionEndMs)) continue;

    if (startTs) {
      const sessionStartMs = new Date(startTs).getTime();
      if (isNaN(sessionStartMs)) continue;
      if (sessionStartMs >= endMs || sessionEndMs <= startMs) continue;
    } else {
      if (sessionEndMs < startMs || sessionEndMs > endMs) continue;
    }

    const key = r.cwd || "(unknown)";
    if (!byProject.has(key)) byProject.set(key, { cwd: key, tokens: 0, lastActiveAt: "" });
    const p = byProject.get(key);
    p.tokens += totalTok(r);
    if (endTs > p.lastActiveAt) p.lastActiveAt = endTs;
  }

  // Compute session % attribution from usage history delta
  const projects = Array.from(byProject.values());
  let hasPct = false;
  if (usageHistory && usageHistory.length && projects.length) {
    const pctField = pctKey === "w" ? "weekly_pct" : "session_pct";
    const windowPts = usageHistory
      .filter((r) => r[pctField] != null)
      .map((r) => ({ t: hourToMs(r.hour), pct: r[pctField] }))
      .filter((p) => p.t >= startMs && p.t <= endMs)
      .sort((a, b) => a.t - b.t);

    if (windowPts.length >= 2) {
      const delta = windowPts[windowPts.length - 1].pct - windowPts[0].pct;
      if (delta > 0) {
        const totalTokens = projects.reduce((s, p) => s + p.tokens, 0);
        if (totalTokens > 0) {
          hasPct = true;
          for (const p of projects) {
            p.sessionPct = Math.round((p.tokens / totalTokens) * delta);
          }
        }
      }
    }
  }

  return buildProjectListHTML({
    title: "Worked on",
    projects,
    maxItems: maxItems,
    showTime: false,
    showPct: hasPct,
    sortable: true,
    defaultSort: hasPct ? "sessionPct" : "tokens",
    id: listId || `window-${startMs}`,
    style: "margin-top:2px;margin-bottom:8px",
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const now = Date.now();
  // Support "YYYY-MM-DDTHH" or "YYYY-MM-DDTHH:MM" by converting to local time
  let then;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}(:\d{2})?$/.test(dateStr)) {
    then = hourToMs(dateStr);
  } else {
    then = new Date(dateStr).getTime();
  }
  if (isNaN(then)) return "—";
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
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

  const projects = aggregateByProject(tokenHistory).map((p) => ({
    cwd: p.cwd,
    tokens: totalTok(p),
    lastActiveAt: p.lastDate,
  }));

  container.innerHTML = buildProjectListHTML({
    title: "",
    projects,
    sortable: true,
    defaultSort: "lastActiveAt",
    id: "stats-main",
  });

  wireProjectListClicks(container, () => renderStats(lastTokenHistory));
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
  const titleInput = document.getElementById("projectDetailTitleInput");
  if (title) title.textContent = projectLabel(cwd);
  const pathEl = document.getElementById("projectDetailPath");
  if (pathEl) pathEl.textContent = cwd || "";

  // Inline rename: click title to edit
  if (title && titleInput) {
    title.onclick = () => {
      titleInput.value = projectLabel(cwd);
      title.style.display = "none";
      titleInput.style.display = "";
      titleInput.focus();
      titleInput.select();
    };
    const commitRename = () => {
      const name = titleInput.value.trim();
      titleInput.style.display = "none";
      title.style.display = "";
      if (name) {
        if (!currentSettings.projectAliases) currentSettings.projectAliases = {};
        currentSettings.projectAliases[cwd] = { name };
        saveSettings();
        title.textContent = projectLabel(cwd);
        renderStats(lastTokenHistory);
      }
    };
    titleInput.onblur = commitRename;
    titleInput.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); titleInput.blur(); }
      if (e.key === "Escape") { titleInput.value = projectLabel(cwd); titleInput.blur(); }
    };
  }

  // Open project buttons
  const explorerBtn = document.getElementById("openExplorerBtn");
  const vscodeBtn = document.getElementById("openVSCodeBtn");
  if (explorerBtn) explorerBtn.onclick = () => window.electronAPI.openInExplorer(cwd);
  if (vscodeBtn) vscodeBtn.onclick = () => window.electronAPI.openInVSCode(cwd);

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

