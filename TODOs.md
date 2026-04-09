# TODOs

<!-- last-id: 33 -->

## [T-031] Voice notify on AI events
**Status:** planned
**Added:** 2026-04-09
**Easibility:** Easy - straightforward npm TTS lib + settings UI wiring
**Description:** Voice announcement when an AI in a project finishes work or is asking a question (e.g. "An AI in Toolbar is done", "An AI in Toolbar is asking a question").
**Questions:**
- [x] TTS approach: "Use an npm TTS package (say.js or similar) for cross-platform support"
- [x] Project name: "Use the user-assigned project name (falls back to path.basename(cwd)). Configurable via settings checklist."
- [x] Relationship to sounds: "Voice replaces sound effects when enabled. One or the other, not both."

**Plan:**
1. Add `say` (or similar) npm package as a dependency
2. Add voice settings to settings schema: `voice.enabled` (bool), `voice.includeProjectName` (bool)
3. In settings UI (dashboard.html), add a "Voice Notifications" section with toggles
4. In hook-server.js `showNotification` / event handlers: when voice is enabled, call TTS instead of `playSound()`. Build the message string based on user's checklist preferences.
5. Use the project's custom name from settings if available, fall back to `path.basename(cwd)`
6. Test on Windows and (eventually) macOS

---

## [T-032] Native browser sign-in flow
**Status:** planned
**Added:** 2026-04-09
**Easibility:** Medium - the auth flow itself is tricky (getting cookies back from a real browser into Electron), multiple approaches to try
**Description:** Open auth in the user's real default browser with their actual profile instead of an Electron window. Current flow feels sketchy - users have to log into Google in an embedded browser, which will turn off potential users.
**Questions:**
- [x] Auth mechanism: "Any approach that works - localhost callback, deep link, or cookie extraction. Whichever is most reliable."
- [x] Fallback: "Keep the old Electron login window as deprecated code (not deleted) but don't use it. Switch fully to native browser. If the new approach proves unreliable, the old code is still there."

**Plan:**
1. Register a custom protocol handler (`aiusage://`) via Electron's `app.setAsDefaultProtocolClient`
2. When login is needed: start a local HTTP server on a random port, open `claude.ai/login` in the user's default browser via `shell.openExternal`
3. After the user completes OAuth in their real browser, intercept the session cookie via one of:
   - a. Inject a small script on claude.ai that posts the session cookie to the localhost callback server
   - b. Or use the deep link redirect to pass the token back
4. Import the received session cookie into Electron's session store so the scraper can use it
5. Mark the old Electron login window code as deprecated (keep in codebase, don't invoke by default)
6. Add timeout handling - if no callback within ~5 minutes, show a "retry" option
7. Test with Google OAuth flow specifically

---

## [T-033] Cross-device usage sync
**Status:** planned
**Added:** 2026-04-09
**Easibility:** Hard - involves a hosted backend, auth system, MCP server, and cross-platform sync logic. Multiple moving parts.
**Description:** Sync usage data between PC and Mac. Possibly via MCP or similar mechanism, so data can be collected even from machines without the app installed, and could also track normal Claude usage.
**Questions:**
- [x] Storage: "Custom Node.js backend hosted on cheapest available platform (Render, Railway, Fly.io free tier or similar)"
- [x] Self-hosting: "No self-hosting. Use a hosted PaaS for simplicity."
- [x] Non-app machines: "Build an MCP server plugin that runs locally, reads usage data, and pushes to the sync backend. Zero cost, runs on user's machine."

**Plan:**
1. **Backend**: Build a small Node.js/Express API server with endpoints for:
   - User registration/auth (simple API key per device)
   - POST usage snapshots (usage history, token stats)
   - GET merged usage data (aggregated from all devices)
   - Deploy to cheapest free tier (Render/Railway/Fly.io)
   - Use SQLite or free Postgres for storage
2. **App integration**: Add sync module to the Electron app
   - On each poll cycle, push new usage data to the backend
   - Periodically pull merged data from all linked devices
   - Settings UI: sync enable/disable, device name, API key setup
3. **MCP server**: Build a standalone MCP server package
   - Reads local Claude usage data (settings files, JSONL logs)
   - Exposes tools for Claude Code to query local usage
   - Pushes data to the sync backend on a schedule
   - Installable via `npx` or as a Claude Code MCP config entry
4. **Device linking**: Simple flow - generate API key on first device, enter it on second device to link them
5. **Data merge**: Server merges snapshots by timestamp, deduplicates, returns unified view

---
