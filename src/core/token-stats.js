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
function appendSession({ sessionId, cwd, date, startedAt, lastActiveAt, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, turns }) {
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
    startedAt: startedAt || new Date().toISOString(),
    lastActiveAt: lastActiveAt || new Date().toISOString(),
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
 * Claude encodes path separators, spaces, and colons (Windows) all as "-".
 * Example: "c--Users-tecno-My-Project" → "c:\Users\tecno\My Project"
 *
 * We greedily walk the segments and check the filesystem. At each step we try
 * merging the next segment with "-" (hyphen in name) or " " (space in name)
 * before falling back to treating it as a path separator.
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

  // Collapse empty segments caused by "--" in the middle of the path.
  // Claude encodes "." (dot prefix) as "-", so ".claude" → "--claude" which
  // after splitting on "-" gives ["", "claude"]. Collapse these into ".claude".
  const collapsed = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "" && i + 1 < parts.length) {
      collapsed.push("." + parts[i + 1]);
      i++;
    } else {
      collapsed.push(parts[i]);
    }
  }

  // Greedy walk: at each "-" boundary, prefer merging with "-" or " " when the
  // merged path exists on disk, falling back to treating it as a path separator.
  const resolved = [collapsed[0]];
  for (let i = 1; i < collapsed.length; i++) {
    const prefix = resolved.slice(0, -1);
    const last = resolved[resolved.length - 1];
    let merged = null;

    for (const joiner of ["-", " "]) {
      const candidate = last + joiner + collapsed[i];
      const candidatePath = root + prefix.concat(candidate).join(sep);
      try {
        fs.statSync(candidatePath);
        merged = candidate;
        break;
      } catch { /* try next joiner */ }
    }

    if (merged !== null) {
      resolved[resolved.length - 1] = merged;
    } else {
      resolved.push(collapsed[i]);
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
 * Build a map of sessionId → filePath from ~/.claude/projects/ on disk.
 */
function buildSessionFileMap() {
  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  const files = walkJsonl(projectsDir);
  const map = new Map();
  for (const filePath of files) {
    const sessionId = path.basename(filePath, ".jsonl");
    map.set(sessionId, filePath);
  }
  return map;
}

/**
 * Populate missing startedAt / lastActiveAt on existing token-history records
 * by reading file stats (birthtime, mtime) from the corresponding .jsonl files.
 * Runs on startup, only touches records that need repair.
 *
 * @returns {number} Number of entries repaired.
 */
function repairTimestamps() {
  const history = loadTokenHistory();
  if (!history.length) return 0;

  const needsRepair = history.some((r) => !r.startedAt || !r.lastActiveAt);
  if (!needsRepair) return 0;

  const fileMap = buildSessionFileMap();
  let repaired = 0;

  for (const record of history) {
    if (record.startedAt && record.lastActiveAt) continue;
    const filePath = fileMap.get(record.sessionId);
    if (!filePath) continue;
    try {
      const stat = fs.statSync(filePath);
      if (!record.startedAt) { record.startedAt = stat.birthtime.toISOString(); repaired++; }
      if (!record.lastActiveAt) { record.lastActiveAt = stat.mtime.toISOString(); repaired++; }
    } catch { /* skip unreadable files */ }
  }

  if (repaired > 0) {
    try {
      fs.writeFileSync(TOKEN_HISTORY_PATH, JSON.stringify(history, null, 2));
    } catch (e) {
      console.error("Failed to write timestamp-repaired token history:", e);
      return 0;
    }
  }

  return repaired;
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
 * Subagent sessions are merged into their parent session record (or a new record
 * keyed by the parent session ID is created if the parent isn't recorded yet).
 *
 * @returns {Promise<{processed:number, skipped:number, subProcessed:number, subSkipped:number}>}
 */
async function backfillAllTranscripts() {
  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  const files = walkJsonl(projectsDir);

  // Repair any previously mis-decoded cwds before backfilling
  repairTokenHistoryCwds();

  // Separate regular session files from subagent files
  const regularFiles = [];
  const subagentFiles = [];
  for (const filePath of files) {
    if (path.basename(path.dirname(filePath)) === "subagents") {
      subagentFiles.push(filePath);
    } else {
      regularFiles.push(filePath);
    }
  }

  // ── Regular sessions ─────────────────────────────────────────────────────
  const existing = loadTokenHistory();
  const knownIds = new Set(existing.map((r) => r.sessionId));

  let processed = 0;
  let skipped = 0;

  for (const filePath of regularFiles) {
    const sessionId = path.basename(filePath, ".jsonl");
    if (knownIds.has(sessionId)) { skipped++; continue; }

    const projectDirName = path.basename(path.dirname(filePath));
    const cwd = decodeCwd(projectDirName);

    let date, startedAt, lastActiveAt;
    try {
      const stat = fs.statSync(filePath);
      date = stat.mtime.toISOString().slice(0, 10);
      startedAt = stat.birthtime.toISOString();
      lastActiveAt = stat.mtime.toISOString();
    } catch {
      const now = new Date().toISOString();
      date = now.slice(0, 10);
      startedAt = now;
      lastActiveAt = now;
    }

    const tokens = await parseTranscript(filePath);
    appendSession({ sessionId, cwd, date, startedAt, lastActiveAt, ...tokens });
    knownIds.add(sessionId);
    processed++;
  }

  // ── Subagent sessions ─────────────────────────────────────────────────────
  // Re-load after regular processing so we can find any newly added parent records.
  const history = loadTokenHistory();
  const historyMap = new Map(history.map((r) => [r.sessionId, r]));

  // Collect all agent IDs already merged into any record (for idempotency).
  const mergedAgentIds = new Set();
  for (const r of history) {
    if (Array.isArray(r.mergedSubagents)) r.mergedSubagents.forEach((id) => mergedAgentIds.add(id));
  }

  let subProcessed = 0;
  let subSkipped = 0;
  let dirty = false;

  for (const filePath of subagentFiles) {
    const agentId = path.basename(filePath, ".jsonl");
    if (mergedAgentIds.has(agentId)) { subSkipped++; continue; }

    // Path: <projectsDir>/<encodedProject>/<parentSessionId>/subagents/<agentId>.jsonl
    const parentSessionId = path.basename(path.dirname(path.dirname(filePath)));
    const encodedProjectDir = path.basename(path.dirname(path.dirname(path.dirname(filePath))));
    const cwd = decodeCwd(encodedProjectDir);

    let date, startedAt, lastActiveAt;
    try {
      const stat = fs.statSync(filePath);
      date = stat.mtime.toISOString().slice(0, 10);
      startedAt = stat.birthtime.toISOString();
      lastActiveAt = stat.mtime.toISOString();
    } catch {
      const now = new Date().toISOString();
      date = now.slice(0, 10);
      startedAt = now;
      lastActiveAt = now;
    }

    const tokens = await parseTranscript(filePath);

    let parentRecord = historyMap.get(parentSessionId);
    if (!parentRecord) {
      // Create a new record for this parent session, seeded with subagent tokens.
      parentRecord = {
        sessionId: parentSessionId,
        cwd,
        date,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        turns: 0,
        startedAt,
        lastActiveAt,
        recordedAt: new Date().toISOString(),
        mergedSubagents: [],
      };
      historyMap.set(parentSessionId, parentRecord);
      history.push(parentRecord);
    }

    parentRecord.inputTokens = (parentRecord.inputTokens || 0) + tokens.inputTokens;
    parentRecord.outputTokens = (parentRecord.outputTokens || 0) + tokens.outputTokens;
    parentRecord.cacheReadTokens = (parentRecord.cacheReadTokens || 0) + tokens.cacheReadTokens;
    parentRecord.cacheCreationTokens = (parentRecord.cacheCreationTokens || 0) + tokens.cacheCreationTokens;
    parentRecord.turns = (parentRecord.turns || 0) + tokens.turns;
    if (startedAt < (parentRecord.startedAt || "Z")) parentRecord.startedAt = startedAt;
    if (lastActiveAt > (parentRecord.lastActiveAt || "")) parentRecord.lastActiveAt = lastActiveAt;
    if (!Array.isArray(parentRecord.mergedSubagents)) parentRecord.mergedSubagents = [];
    parentRecord.mergedSubagents.push(agentId);
    mergedAgentIds.add(agentId);
    dirty = true;
    subProcessed++;
  }

  if (dirty) {
    try {
      fs.writeFileSync(TOKEN_HISTORY_PATH, JSON.stringify(history, null, 2));
    } catch (e) {
      console.error("Failed to write subagent-merged token history:", e);
    }
  }

  return { processed, skipped, subProcessed, subSkipped };
}

/**
 * Find active (in-progress) Claude Code sessions that aren't in token-history yet.
 * Scans ~/.claude/projects for .jsonl files modified in the last 12 hours whose
 * sessionId isn't already recorded. Returns lightweight records suitable for
 * merging into the dashboard's project lists.
 *
 * @returns {Promise<object[]>} Array of { sessionId, cwd, date, startedAt, lastActiveAt, live, inputTokens, ... }
 */
async function getActiveSessions() {
  const history = loadTokenHistory();
  const knownIds = new Set(history.map((r) => r.sessionId));

  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  const cutoff = Date.now() - 12 * 3_600_000;
  const results = [];

  let projectDirs;
  try {
    projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch { return []; }

  for (const projEntry of projectDirs) {
    const projPath = path.join(projectsDir, projEntry.name);
    let entries;
    try {
      entries = fs.readdirSync(projPath, { withFileTypes: true });
    } catch { continue; }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const filePath = path.join(projPath, entry.name);
      const sessionId = path.basename(filePath, ".jsonl");
      if (knownIds.has(sessionId)) continue;

      try {
        const stat = fs.statSync(filePath);
        if (stat.mtime.getTime() < cutoff) continue;
        const tokens = await parseTranscript(filePath);
        results.push({
          sessionId,
          cwd: decodeCwd(projEntry.name),
          date: stat.mtime.toISOString().slice(0, 10),
          startedAt: stat.birthtime.toISOString(),
          lastActiveAt: stat.mtime.toISOString(),
          live: true,
          ...tokens,
        });
      } catch { continue; }
    }
  }

  return results;
}

module.exports = { loadTokenHistory, appendSession, backfillAllTranscripts, repairTimestamps, getActiveSessions };
