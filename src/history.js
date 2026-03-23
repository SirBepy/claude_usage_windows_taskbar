"use strict";

const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const HISTORY_PATH = path.join(app.getPath("userData"), "usage-history.json");

/**
 * Returns the local-time hour bucket key for the current moment: "YYYY-MM-DDTHH"
 */
function currentHourKey() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hour = pad(now.getHours());
  return `${year}-${month}-${day}T${hour}`;
}

/**
 * Returns a "YYYY-MM-DD" string for a Date in local time.
 */
function localDateStr(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Returns the set of local date strings for today + previous 6 days.
 */
function retainedDays() {
  const days = new Set();
  const now = new Date();
  for (let i = 0; i < 35; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.add(localDateStr(d));
  }
  return days;
}

/**
 * Read and parse usage-history.json. Returns [] on missing file, empty file,
 * or invalid JSON — never throws.
 *
 * Hardens records: keeps only objects with a string `hour` matching "YYYY-MM-DDTHH".
 */
function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return [];
    const raw = fs.readFileSync(HISTORY_PATH, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Filter out malformed entries to ensure downstream logic (like .slice() or sort) never throws.
    return parsed.filter((r) => {
      return (
        r &&
        typeof r === "object" &&
        typeof r.hour === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(r.hour)
      );
    });
  } catch (e) {
    console.error("Failed to load usage history:", e);
    return [];
  }
}

/**
 * Record a usage snapshot for the current clock-hour.
 * - Upserts the record for the current hour bucket.
 * - Prunes records outside the fixed 7 local calendar-day window.
 * - Writes the file sorted ascending by `hour`.
 *
 * @param {object} usageData  The parsed API response containing five_hour / seven_day fields.
 * @returns {object[]|null}   The updated and persisted history array, or null on write failure.
 */
function recordSnapshot(usageData) {
  const hour = currentHourKey();
  const record = {
    hour,
    session_pct: usageData?.five_hour?.utilization ?? null,
    weekly_pct: usageData?.seven_day?.utilization ?? null,
    session_resets_at: usageData?.five_hour?.resets_at ?? null,
    weekly_resets_at: usageData?.seven_day?.resets_at ?? null,
    recorded_at: new Date().toISOString(),
  };

  let history = loadHistory();

  // Upsert: replace existing record for this hour, or append
  const idx = history.findIndex((r) => r.hour === hour);
  if (idx !== -1) {
    history[idx] = record;
  } else {
    history.push(record);
  }

  // Prune to the fixed 35 local calendar-day window (5 weeks for pagination)
  const keep = retainedDays();
  history = history.filter((r) => {
    // Extract date portion from "YYYY-MM-DDTHH"
    const datePart = r.hour ? r.hour.slice(0, 10) : null;
    return datePart && keep.has(datePart);
  });

  // Sort ascending by hour key
  history.sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0));

  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  } catch (e) {
    console.error("Failed to write usage history:", e);
    return null; // Return sentinel to prevent downstream UI state divergence
  }

  return history;
}

module.exports = { recordSnapshot, loadHistory };
