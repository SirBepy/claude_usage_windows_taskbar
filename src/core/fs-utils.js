"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { decodeCwd } = require("./path-decoder");

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

module.exports = { walkJsonl, buildSessionCwdMap, buildSessionFileMap };
