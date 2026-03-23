# TODOs

<!-- last-id: 11 -->

## [T-009] Per-graph pagination controls
**Status:** planned
**Added:** 2026-03-23
**Description:** Pagination (left/right) should be independent per graph - weekly usage and session usage each have their own navigation. Buttons should live inside the graph card, not shared globally.
**Questions:**
_(none)_

**Plan:**
1. In `dashboard.js`, replace the single `weekOffset` with two separate offsets: `sessionPageOffset` and `weeklyPageOffset`.
2. In `renderHistory`, compute separate shifted window bounds for each chart using their respective offsets.
3. Move the pagination HTML into each chart card: render a `.chart-pagination` block with unique button IDs (`prev-session`, `next-session`, `prev-weekly`, `next-weekly`) directly above each `.chart-container`.
4. Update `setupPaginationButtons` to wire up all four buttons independently, each calling `renderHistory(lastHistory)` after mutating only its own offset variable.
5. Remove the shared `.chart-pagination` block that currently sits above both charts.

---

## [T-010] Fix session timeframe to 5 hours
**Status:** planned
**Added:** 2026-03-23
**Description:** The session timeframe shown in the dashboard is wrong. It should reflect a 5-hour window, matching the API's `five_hour` field.
**Questions:**
_(none)_

**Plan:**
1. In `renderHistory` (`dashboard.js`), compute a separate session window: `sessionEndMs` from `latest.session_resets_at` (fallback: `Date.now() + 3_600_000`), and `sessionStartMs = sessionEndMs - 5 * 3_600_000`.
2. Apply `sessionPageOffset` (from T-009) in 5-hour steps: `shiftedSessionEndMs = sessionEndMs - sessionPageOffset * 5 * 3_600_000`, `shiftedSessionStartMs = sessionStartMs - sessionPageOffset * 5 * 3_600_000`.
3. Update `buildChart` to accept an optional `tickIntervalMs` hint. When the window is ≤ 12 hours, render hour ticks (every 30 or 60 min) labeled `HH:mm` instead of day ticks.
4. Pass the session window bounds to the session chart call: `buildChart(history, shiftedSessionStartMs, shiftedSessionEndMs, "s", "chart-session")`.
5. Update the session pagination label to show the session number/range (e.g., "This session", "1 session ago") instead of "This week" / "Xw ago".

---

## [T-011] Toggle safe pace in settings
**Status:** planned
**Added:** 2026-03-23
**Description:** Add a toggle in the settings panel to enable/disable the "safe pace" indicator shown in the tray icon hover tooltip.
**Questions:**
_(none)_

**Plan:**
1. Add `showSafePace: true` to `DEFAULT_SETTINGS` in `src/settings.js`.
2. In `dashboard.html`, add a toggle row for "Safe Pace Indicator" inside the Tokens `<div class="section">`, using the same `.switch` pattern as the other toggles.
3. In `dashboard.js`:
   - Declare a module-level `let currentSettings = {}` variable.
   - In `window.onload`, after loading settings, assign to `currentSettings` and also load the new `showSafePace` checkbox state.
   - In `saveBtn.onclick`, include `showSafePace: safePaceToggle.checked` in the settings object saved via `saveSettings`.
4. In `renderHistory`, guard the safe pace stat column with `currentSettings.showSafePace !== false` - if disabled, render only the single "current" value column in each stat card (remove the two-column `.stat-values-row` layout and replace with just `.stat-value`).

---

## [T-008] Auto-download on new version
**Status:** planned
**Added:** 2026-03-23
**Description:** When a new version is available, the app immediately starts downloading it and shows "downloading..." in the tray context menu, even though the user never clicked anything to initiate it. The download should only start after the user explicitly requests it.
**Questions:**
_(none)_

**Plan:**
1. In `main.js` `buildContextMenu()`, fix the `available` state entry: change the label from `"Downloading update v${version}…"` (misleading) to `"Update available: v${version}"` and give it a `click` handler that calls `downloadUpdate()`.
2. Add an `else if (state === "downloading")` branch that renders a disabled label `"Downloading v${version}…"` so the tray correctly reflects an in-progress download.
3. Verify `src/updater.js` still has `autoUpdater.autoDownload = false` (it does - no change needed there).

---

