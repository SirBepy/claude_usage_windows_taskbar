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
 */
function decodeCwd(encoded) {
  if (process.platform === "win32") {
    const driveSep = encoded.indexOf("--");
    if (driveSep !== -1) {
      const drive = encoded.slice(0, driveSep);
      const rest = encoded.slice(driveSep + 2).replace(/-/g, "\\");
      return `${drive}:\\${rest}`;
    }
  }
  return "/" + encoded.replace(/-/g, "/");
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
 * Scan all existing ~/.claude/projects/**\/*.jsonl transcripts and backfill
 * token-history.json with any sessions not already recorded.
 *
 * @returns {Promise<{processed:number, skipped:number}>}
 */
async function backfillAllTranscripts() {
  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  const files = walkJsonl(projectsDir);

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
