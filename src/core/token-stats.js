"use strict";

const { app } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseTranscript } = require("./transcript-parser");

const TOKEN_HISTORY_PATH = path.join(app.getPath("userData"), "token-history.json");

/**
 * Read token-history.json. Returns [] on missing file, invalid JSON, or any error.
 * Validates that each record has a string sessionId.
 */
function loadTokenHistory() {
  try {
    if (!fs.existsSync(TOKEN_HISTORY_PATH)) return [];
    const raw = fs.readFileSync(TOKEN_HISTORY_PATH, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && typeof r === "object" && typeof r.sessionId === "string");
  } catch (e) {
    console.error("Failed to load token history:", e);
    return [];
  }
}

/**
 * Append a session record to token-history.json.
 * No-op if sessionId already present (idempotent on hook retry).
 *
 * @returns {object[]|null} Updated array, or null on write failure.
 */
function appendSession({ sessionId, cwd, date, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, turns }) {
  const history = loadTokenHistory();

  if (history.some((r) => r.sessionId === sessionId)) return history;

  history.push({
    sessionId,
    cwd: cwd ?? null,
    date,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    turns,
    recordedAt: new Date().toISOString(),
  });

  try {
    fs.writeFileSync(TOKEN_HISTORY_PATH, JSON.stringify(history, null, 2));
  } catch (e) {
    console.error("Failed to write token history:", e);
    return null;
  }

  return history;
}

/**
 * Best-effort decode of a Claude project dir name back to a filesystem path.
 * Claude encodes: each path separator (and colon on Windows) becomes "-".
 * Example: "c--Users-tecno-Desktop-Projects" → "c:\Users\tecno\Desktop\Projects"
 *
 * Because hyphens in folder names are also encoded as "-", we greedily walk
 * the segments and check the filesystem: if joining the next segment with a
 * hyphen produces an existing directory, prefer that over treating "-" as a
 * path separator.
 */
function decodeCwd(encoded) {
  const sep = process.platform === "win32" ? "\\" : "/";
  let root, parts;

  if (process.platform === "win32") {
    const driveSep = encoded.indexOf("--");
    if (driveSep !== -1) {
      root = encoded.slice(0, driveSep) + ":\\";
      parts = encoded.slice(driveSep + 2).split("-");
    } else {
      return encoded;
    }
  } else {
    root = "/";
    parts = encoded.split("-");
  }

  // Greedy walk: try to merge consecutive segments with "-" when the merged
  // name exists on disk, otherwise treat "-" as a path separator.
  const resolved = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const merged = resolved[resolved.length - 1] + "-" + parts[i];
    const mergedPath = root + resolved.slice(0, -1).concat(merged).join(sep);
    // Peek ahead: does mergedPath exist as a dir (or file for the last segment)?
    try {
      fs.statSync(mergedPath);
      resolved[resolved.length - 1] = merged;
    } catch {
      resolved.push(parts[i]);
    }
  }

  return root + resolved.join(sep);
}

/**
 * Recursively collect all .jsonl files under a directory.
 */
function walkJsonl(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkJsonl(full));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(full);
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results;
}

/**
 * Build a map of sessionId → decoded cwd from ~/.claude/projects/ on disk.
 * Used by both backfill and repair.
 */
function buildSessionCwdMap() {
  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  const files = walkJsonl(projectsDir);
  const map = new Map();
  for (const filePath of files) {
    const sessionId = path.basename(filePath, ".jsonl");
    const projectDirName = path.basename(path.dirname(filePath));
    map.set(sessionId, decodeCwd(projectDirName));
  }
  return map;
}

/**
 * Re-decode cwds for all existing token-history entries using the current
 * (filesystem-aware) decodeCwd. Fixes entries that were decoded with the
 * old naive approach (e.g. "zng-app" → "zng\app").
 *
 * @returns {number} Number of entries repaired.
 */
function repairTokenHistoryCwds() {
  const history = loadTokenHistory();
  if (!history.length) return 0;

  const cwdMap = buildSessionCwdMap();
  let repaired = 0;

  for (const record of history) {
    const correctCwd = cwdMap.get(record.sessionId);
    if (correctCwd && correctCwd !== record.cwd) {
      record.cwd = correctCwd;
      repaired++;
    }
  }

  if (repaired > 0) {
    try {
      fs.writeFileSync(TOKEN_HISTORY_PATH, JSON.stringify(history, null, 2));
    } catch (e) {
      console.error("Failed to write repaired token history:", e);
      return 0;
    }
  }

  return repaired;
}

/**
 * Scan all existing ~/.claude/projects/**\/*.jsonl transcripts and backfill
 * token-history.json with any sessions not already recorded.
 *
 * @returns {Promise<{processed:number, skipped:number}>}
 */
async function backfillAllTranscripts() {
  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  const files = walkJsonl(projectsDir);

  // Repair any previously mis-decoded cwds before backfilling
  repairTokenHistoryCwds();

  const existing = loadTokenHistory();
  const knownIds = new Set(existing.map((r) => r.sessionId));

  let processed = 0;
  let skipped = 0;

  for (const filePath of files) {
    const sessionId = path.basename(filePath, ".jsonl");
    if (knownIds.has(sessionId)) { skipped++; continue; }

    const projectDirName = path.basename(path.dirname(filePath));
    const cwd = decodeCwd(projectDirName);

    // Approximate date from file mtime, fallback to today
    let date;
    try {
      date = fs.statSync(filePath).mtime.toISOString().slice(0, 10);
    } catch {
      date = new Date().toISOString().slice(0, 10);
    }

    const tokens = await parseTranscript(filePath);
    appendSession({ sessionId, cwd, date, ...tokens });
    knownIds.add(sessionId);
    processed++;
  }

  return { processed, skipped };
}

module.exports = { loadTokenHistory, appendSession, backfillAllTranscripts };
