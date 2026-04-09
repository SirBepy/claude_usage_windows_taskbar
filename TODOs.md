# TODOs

<!-- last-id: 30 -->

---

## [T-021] Extract dashboard CSS into separate file
**Status:** pending
**Added:** 2026-04-09
**Description:** Extract the ~533 lines of embedded `<style>` from `dashboard.html` into `src/renderer/dashboard.css`, linked via `<link>`. Reduces dashboard.html from ~1005 to ~470 lines and improves cacheability.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-022] Extract dashboard formatters module
**Status:** pending
**Added:** 2026-04-09
**Description:** Pull formatting/color utility functions (`hourToMs`, `pctColor`, `getThresholdColor`, `getPaceColor`, `valueColor`, `fmtPct`, `fmtResetTime`) out of `dashboard.js` into `src/renderer/modules/formatters.js`. These are pure functions with no DOM dependencies.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-023] Extract dashboard chart rendering module
**Status:** pending
**Added:** 2026-04-09
**Description:** Pull chart rendering logic out of `dashboard.js` (~500 lines) into `src/renderer/modules/chart.js`. Includes: `buildChart`, `applyLineVisibility`, `setupLegendToggles`, `buildProjectBarsView`, `buildGraphCard`, `openGraphDetail`, `renderGraphDetailFromCurrent`, `wireChartModeToggles`, and pagination logic.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-024] Extract dashboard settings module
**Status:** pending
**Added:** 2026-04-09
**Description:** Pull the ~280 lines of settings UI logic out of `dashboard.js` into `src/renderer/modules/settings.js`. Includes: 35+ DOM element refs, `saveSettings`, color picker handlers, sound config, visibility toggles, `updateColorModeVisibility`, `renderUpdateState`.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-025] Extract dashboard project/stats module
**Status:** pending
**Added:** 2026-04-09
**Description:** Pull project list and stats rendering (~500 lines) out of `dashboard.js` into `src/renderer/modules/stats.js`. Includes: `aggregateByProject`, `buildProjectListHTML`, `wireProjectListClicks`, `buildTodaySectionHTML`, `buildWindowProjectsHTML`, `renderStats`, `openProjectDetail`, `renderProjectDetail`, `buildBarChartSVG`, `renderSessionsList`, `timeAgo`, `setupBackfillBtn`.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-026] Extract main.js hook server module
**Status:** pending
**Added:** 2026-04-09
**Description:** Pull the HTTP hook server (~70 lines, handles Claude Code stop hooks) from `main.js` into `src/core/hook-server.js`. Clean export that accepts callbacks for session-end events.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-027] Extract main.js tray management module
**Status:** pending
**Added:** 2026-04-09
**Description:** Pull tray-related logic from `main.js` into `src/core/tray.js`. Includes: `updateTray`, `buildContextMenu`, `createTray`, display cycling (`buildDisplayCycle`, `cycleDisplayMode`, `resetDisplayMode`), and threshold checking.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-028] Extract main.js window management module
**Status:** pending
**Added:** 2026-04-09
**Description:** Pull `showLoginWindow` (with OAuth popup handling and SPA detection) and `showDashboardWindow` from `main.js` into `src/core/windows.js`.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-029] Extract icon.js PNG primitives and fonts
**Status:** pending
**Added:** 2026-04-09
**Description:** Pull low-level PNG encoding (`crc32`, `pngChunk`, `pixelsToPNG`, `drawRoundedRect`) into `src/core/png-utils.js` and the 3 pixel font definitions + `drawDigit`/`drawText` into `src/core/fonts.js`. Reduces icon.js from 624 to ~300 lines focused on ring/bar rendering.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-030] Extract token-stats.js path decoder and fs utils
**Status:** pending
**Added:** 2026-04-09
**Description:** Pull `decodeCwd` path recovery logic into `src/core/path-decoder.js` and file traversal helpers (`walkJsonl`, `buildSessionCwdMap`, `buildSessionFileMap`) into `src/core/fs-utils.js`. Reduces token-stats.js from 452 to ~280 lines focused on session/backfill logic.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---
