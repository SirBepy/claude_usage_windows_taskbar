"use strict";

const http = require("http");
const path = require("path");
const { Notification } = require("electron");
const { execFile } = require("child_process");

const HOOK_SERVER_PORT = 27182;

function parseHookBody(req, cb) {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    try { cb(JSON.parse(Buffer.concat(chunks).toString())); }
    catch { cb(null); }
  });
}

function focusVSCodeWindow(projectName) {
  const safe = projectName.replace(/[^a-zA-Z0-9 _\-\.]/g, "");
  const script = [
    `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n); }'`,
    `$p = Get-Process -Name Code -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*${safe}*' } | Select-Object -First 1`,
    `if (-not $p) { $p = Get-Process -Name Code -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1 }`,
    `if ($p) { [W]::ShowWindow($p.MainWindowHandle, 9); [W]::SetForegroundWindow($p.MainWindowHandle) }`,
  ].join("; ");
  execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true }, () => {});
}

function showNotification(title, body, cwd) {
  try {
    const n = new Notification({ title, body });
    if (cwd) n.on("click", () => focusVSCodeWindow(path.basename(cwd)));
    n.show();
  } catch { /* app not ready */ }
}

function createHookServer(callbacks) {
  const { onRefresh, onNotify, onQuit, getSettings, parseTranscript, appendSession, loadTokenHistory, dashboardSend, playSound } = callbacks;

  async function recordTokenStats(payload) {
    if (!payload?.session_id || !payload?.transcript_path) return;
    const tokens = await parseTranscript(payload.transcript_path);
    const date = new Date().toISOString().slice(0, 10);
    appendSession({ sessionId: payload.session_id, cwd: payload.cwd, date, ...tokens });
    dashboardSend("token-history-updated", loadTokenHistory());
  }

  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/refresh") {
      res.writeHead(204).end();
      parseHookBody(req, (payload) => {
        if (payload && payload.cwd) {
          showNotification("Claude finished", path.basename(payload.cwd), payload.cwd);
        }
        recordTokenStats(payload).catch(console.error);
      });
      onRefresh();
    } else if (req.method === "POST" && req.url === "/notify") {
      res.writeHead(204).end();
      parseHookBody(req, (payload) => {
        if (payload && payload.cwd) {
          showNotification("Claude is waiting for your input", path.basename(payload.cwd), payload.cwd);
        }
        const sfx = getSettings().sounds || {};
        if (sfx.questionAsked?.enabled) {
          playSound(sfx.questionAsked.file);
        }
      });
    } else if (req.method === "POST" && req.url === "/quit") {
      res.writeHead(204).end();
      onQuit();
    } else {
      res.writeHead(404).end();
    }
  });

  server.listen(HOOK_SERVER_PORT, "127.0.0.1");
  return server;
}

module.exports = { createHookServer, HOOK_SERVER_PORT };
