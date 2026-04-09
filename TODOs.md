# TODOs

<!-- last-id: 30 -->

---

## [T-021] Extract dashboard CSS into separate file
**Status:** planned
**Added:** 2026-04-09
**Description:** Extract the ~533 lines of embedded `<style>` from `dashboard.html` into `src/renderer/dashboard.css`, linked via `<link>`. Reduces dashboard.html from ~1005 to ~470 lines and improves cacheability.
**Questions:**
- [x] Module loading approach? "Multiple script tags in dependency order, window globals for shared state"

**Plan:**
1. Create `src/renderer/dashboard.css` containing the full contents of the `<style>` block (lines 13-545 of dashboard.html)
2. In `dashboard.html`, replace the `<style>...</style>` block with `<link rel="stylesheet" href="dashboard.css">`
3. Update the CSP meta tag to allow `style-src 'self' https://fonts.googleapis.com` (remove `'unsafe-inline'` since styles are now external)
4. Verify the dashboard renders identically

---

---

## [T-026] Extract main.js hook server module
**Status:** planned
**Added:** 2026-04-09
**Description:** Pull the HTTP hook server (~70 lines, handles Claude Code stop hooks) from `main.js` into `src/core/hook-server.js`. Clean export that accepts callbacks for session-end events.
**Questions:**
- [x] Dependency passing approach? "Function args - each module exports functions that take what they need"

**Plan:**
1. Create `src/core/hook-server.js` containing:
   - `HOOK_SERVER_PORT` constant
   - `parseHookBody()` helper
   - `focusVSCodeWindow()` helper
   - `showNotification()` helper
   - `recordTokenStats()` async function
   - `createHookServer(callbacks)` function that creates and returns the http server
   - `callbacks` param shape: `{ onRefresh, onNotify, onQuit, getSettings, parseTranscript, appendSession, loadTokenHistory, dashboardSend }`
2. The server handles `/refresh`, `/notify`, `/quit` routes, calling callbacks instead of directly referencing main.js state
3. Export `{ createHookServer, HOOK_SERVER_PORT }`
4. In `main.js`, replace lines 14-81 with `const { createHookServer } = require("./src/core/hook-server")` and call it in `app.whenReady()` with the appropriate callbacks
5. Keep `hookServer` variable in main.js for cleanup in `before-quit`
6. Verify hook server still responds to POST /refresh, /notify, /quit

---

## [T-027] Extract main.js tray management module
**Status:** planned
**Added:** 2026-04-09
**Description:** Pull tray-related logic from `main.js` into `src/core/tray.js`. Includes: `updateTray`, `buildContextMenu`, `createTray`, display cycling (`buildDisplayCycle`, `cycleDisplayMode`, `resetDisplayMode`), and threshold checking.
**Questions:**
- [x] Dependency passing approach? "Function args"

**Plan:**
1. Create `src/core/tray.js` containing:
   - `hasThresholdCrossed()` (line 182-185)
   - Temp display state: `tempDisplay`, `tempDisplayCycle`, `tempDisplayIndex`, `tempDisplayTimer`
   - `getActiveSettings(settings)` - takes settings as arg instead of reading module-level var
   - `buildDisplayCycle(settings)`, `cycleDisplayMode()`, `resetDisplayMode()`
   - `updateTray(tray, usageData, settings)` - takes tray, usageData, settings as args
   - `buildContextMenu(callbacks)` - takes `{ loggedIn, getUpdateState, showLoginWindow, showDashboardWindow, refreshWithAnimation, quitAndInstall, downloadUpdate, quit }`
   - `createTray(callbacks)` - creates and returns the Tray instance
2. Export: `{ createTray, updateTray, buildContextMenu, cycleDisplayMode, resetDisplayMode, getActiveSettings, hasThresholdCrossed }`
3. In `main.js`, replace lines 182-394 with require and delegation
4. The tray module internally requires `makeIcon`/`makeSpinFrame` and `usage-parser` functions
5. Verify tray icon, tooltip, context menu, display cycling all work

---

## [T-028] Extract main.js window management module
**Status:** planned
**Added:** 2026-04-09
**Description:** Pull `showLoginWindow` (with OAuth popup handling and SPA detection) and `showDashboardWindow` from `main.js` into `src/core/windows.js`.
**Questions:**
- [x] Dependency passing approach? "Function args"

**Plan:**
1. Create `src/core/windows.js` containing:
   - `showLoginWindow(callbacks)` - callbacks: `{ onLoginSuccess(usageData), onClosed }`
     - Internally creates BrowserWindow, handles OAuth popups, SPA detection
     - Calls `fetchUsageFromPage()` directly (requires scraper)
     - On success: calls `onLoginSuccess(usageData)`, closes window
   - `showDashboardWindow(callbacks)` - callbacks: `{ onClosed }`
     - Creates BrowserWindow with preload, returns the window ref
2. Export: `{ showLoginWindow, showDashboardWindow }`
3. In `main.js`, replace lines 396-502 with require and wrapper functions that pass state
4. main.js keeps `loginWindow` and `dashboardWindow` refs, updated via callbacks
5. Verify login flow (including Google OAuth popups, SPA detection) and dashboard window work

---

## [T-029] Extract icon.js PNG primitives and fonts
**Status:** planned
**Added:** 2026-04-09
**Description:** Pull low-level PNG encoding (`crc32`, `pngChunk`, `pixelsToPNG`, `drawRoundedRect`) into `src/core/png-utils.js` and the 3 pixel font definitions + `drawDigit`/`drawText` into `src/core/fonts.js`. Reduces icon.js from 624 to ~300 lines focused on ring/bar rendering.
**Questions:**
- [x] Extraction approach? "Straightforward - no architectural decisions needed, just move and require"

**Plan:**
1. Create `src/core/png-utils.js` containing:
   - `crc32()` (lines 8-15)
   - `pngChunk()` (lines 17-24)
   - `pixelsToPNG()` (lines 26-54)
   - `drawRoundedRect()` (lines 58-91)
   - Export: `{ crc32, pngChunk, pixelsToPNG, drawRoundedRect }`
2. Create `src/core/fonts.js` containing:
   - `FONTS` object with all 3 font definitions: classic, digital, bold (lines 250-400ish)
   - `drawDigit()` function
   - `drawText()` function (lines 416-423)
   - Export: `{ FONTS, drawDigit, drawText }`
3. In `icon.js`, replace extracted code with:
   - `const { pixelsToPNG, drawRoundedRect } = require("./png-utils")`
   - `const { drawText } = require("./fonts")`
4. Remove `zlib` require from icon.js (moves to png-utils.js)
5. Keep in icon.js: `SIZE`, `hexToRgb`, `urgencyRGB`, `drawRingArc`, `drawSpinningArc`, `drawBars`, `makeIcon`, `makeSpinFrame`
6. Verify tray icon renders correctly in all states (normal, spinning, bars mode)

---

## [T-030] Extract token-stats.js path decoder and fs utils
**Status:** planned
**Added:** 2026-04-09
**Description:** Pull `decodeCwd` path recovery logic into `src/core/path-decoder.js` and file traversal helpers (`walkJsonl`, `buildSessionCwdMap`, `buildSessionFileMap`) into `src/core/fs-utils.js`. Reduces token-stats.js from 452 to ~280 lines focused on session/backfill logic.
**Questions:**
- [x] Extraction approach? "Straightforward - just move and require"

**Plan:**
1. Create `src/core/path-decoder.js` containing:
   - `decodeCwd()` function (token-stats.js lines 73-129)
   - Export: `{ decodeCwd }`
2. Create `src/core/fs-utils.js` containing:
   - `walkJsonl()` function (lines 134-148)
   - `buildSessionCwdMap()` function (lines 154-164) - requires `decodeCwd` from path-decoder
   - `buildSessionFileMap()` function (lines 169-178)
   - Export: `{ walkJsonl, buildSessionCwdMap, buildSessionFileMap }`
3. In `token-stats.js`, replace extracted code with:
   - `const { decodeCwd } = require("./path-decoder")`
   - `const { walkJsonl, buildSessionCwdMap, buildSessionFileMap } = require("./fs-utils")`
4. Keep in token-stats.js: `loadTokenHistory`, `appendSession`, `repairTimestamps`, `repairTokenHistoryCwds`, `backfillAllTranscripts`, `getActiveSessions`
5. Verify backfill, repair, and session discovery all work

---
