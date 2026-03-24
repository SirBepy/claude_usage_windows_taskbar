"use strict";

function formatResetAt(iso, style = "absolute") {
  if (!iso) return null;
  const resetDate = new Date(iso);
  const diff = resetDate - Date.now();
  if (diff <= 0) return "soon";

  if (style === "countdown") {
    const hours = Math.floor(diff / 3600000);
    const mins = Math.round((diff % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  const hh = resetDate.getHours().toString().padStart(2, "0");
  const mm = resetDate.getMinutes().toString().padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  const hoursUntil = diff / 3600000;
  if (hoursUntil > 20) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${days[resetDate.getDay()]} ${timeStr}`;
  }

  return timeStr;
}

/** 0–100 session (5-hour window) utilization, or null if unknown. */
function parseSessionPct(data) {
  return data?.five_hour?.utilization ?? null;
}

/** 0–100 weekly (7-day window) utilization, or null if unknown. */
function parseWeeklyPct(data) {
  return data?.seven_day?.utilization ?? null;
}

function formatTokens(num) {
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return num.toString();
}

function calcSafePct(resetAt, windowMs) {
  if (!resetAt) return null;
  const diff = new Date(resetAt) - Date.now();
  if (diff < 0) return 100;
  return Math.max(0, Math.min(100, Math.round((windowMs - diff) / windowMs * 100)));
}

/** Builds the tray tooltip string from usage API data. */
function buildTooltip(data, settings = {}) {
  if (!data) return "Claude Usage — Loading...";

  const timeStyle = settings.timeStyle || "absolute";
  const layout = settings.tooltipLayout || "rows";
  const showSafePace = settings.tooltipShowSafePace !== false;
  // support old key name for backward compat
  const estimateTokens = settings.tooltipEstimateTokens ?? settings.estimateTokens ?? false;

  const session = data.five_hour;
  const weekly = data.seven_day;

  const hasSession = session?.utilization != null;
  const hasWeekly = weekly?.utilization != null;

  if (!hasSession && !hasWeekly) return "Claude Usage";

  const sessionSafe = hasSession ? calcSafePct(session.resets_at, 5 * 3600000) : null;
  const weeklySafe = hasWeekly ? calcSafePct(weekly.resets_at, 7 * 24 * 3600000) : null;

  const sTime = hasSession && session.resets_at ? formatResetAt(session.resets_at, timeStyle) : null;
  const wTime = hasWeekly && weekly.resets_at ? formatResetAt(weekly.resets_at, timeStyle) : null;

  function tokensLeft(utilization, plan) {
    if (!plan) return null;
    return `${formatTokens(Math.round((Math.max(0, 100 - utilization) / 100) * plan))} left`;
  }
  const sessionTokens = estimateTokens && hasSession ? tokensLeft(session.utilization, settings.sessionPlan) : null;
  const weeklyTokens = estimateTokens && hasWeekly ? tokensLeft(weekly.utilization, settings.weeklyPlan) : null;

  if (layout === "columns") {
    const lines = [];

    if (hasSession && hasWeekly) lines.push("Session\tWeekly");

    lines.push(
      [hasSession ? `${session.utilization}%` : null, hasWeekly ? `${weekly.utilization}%` : null]
        .filter(Boolean).join("\t")
    );

    if (showSafePace && (sessionSafe !== null || weeklySafe !== null)) {
      lines.push(
        [sessionSafe !== null ? `pace ${sessionSafe}%` : "", weeklySafe !== null ? `pace ${weeklySafe}%` : ""]
          .join("\t").trimEnd()
      );
    }

    if (sTime || wTime) {
      lines.push([sTime || "", wTime || ""].join("\t").trimEnd());
    }

    if (sessionTokens || weeklyTokens) {
      lines.push([sessionTokens || "", weeklyTokens || ""].join("\t").trimEnd());
    }

    return lines.join("\n");
  }

  // rows layout
  const lines = [];

  if (hasSession) {
    const parts = [`Session  ${session.utilization}%`];
    if (showSafePace && sessionSafe !== null) parts.push(`pace ${sessionSafe}%`);
    if (sTime) parts.push(sTime);
    if (sessionTokens) parts.push(sessionTokens);
    lines.push(parts.join("  "));
  }

  if (hasWeekly) {
    const parts = [`Weekly   ${weekly.utilization}%`];
    if (showSafePace && weeklySafe !== null) parts.push(`pace ${weeklySafe}%`);
    if (wTime) parts.push(wTime);
    if (weeklyTokens) parts.push(weeklyTokens);
    lines.push(parts.join("  "));
  }

  return lines.join("\n");
}

module.exports = { parseSessionPct, parseWeeklyPct, buildTooltip };
