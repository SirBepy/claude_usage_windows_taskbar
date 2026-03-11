"use strict";

function formatTimeUntil(iso) {
  if (!iso) return null;
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return "soon";
  const h = Math.floor(diff / 3600000),
    m = Math.floor((diff % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** 0–100 session (5-hour window) utilization, or null if unknown. */
function parseSessionPct(data) {
  return data?.five_hour?.utilization ?? null;
}

/** 0–100 weekly (7-day window) utilization, or null if unknown. */
function parseWeeklyPct(data) {
  return data?.seven_day?.utilization ?? null;
}

/** Builds the tray tooltip string from usage API data. */
function buildTooltip(data) {
  if (!data) return "Claude Usage — Loading...";

  const lines = [];

  const session = data.five_hour;
  if (session?.utilization != null) {
    const reset = session.resets_at ? ` — resets ${formatTimeUntil(session.resets_at)}` : "";
    lines.push(`Session: ${session.utilization}%${reset}`);
  }

  const weekly = data.seven_day;
  if (weekly?.utilization != null) {
    const reset = weekly.resets_at ? ` — resets ${formatTimeUntil(weekly.resets_at)}` : "";
    lines.push(`Weekly:  ${weekly.utilization}%${reset}`);
  }

  return lines.length ? lines.join("\n") : "Claude Usage";
}

module.exports = { parseSessionPct, parseWeeklyPct, buildTooltip };
