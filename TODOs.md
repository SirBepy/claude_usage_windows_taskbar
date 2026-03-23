# TODOs

<!-- last-id: 7 -->

## [T-002] Separate session and weekly graphs
**Status:** planned
**Added:** 2026-03-21
**Description:** Session and weekly utilization should not be shown on the same graph - they need to be separated into two chart sections within the dashboard window.
**Questions:**
- [x] Should they be two separate tray icons, two separate popup windows, or two separate sections within one popup?: "two sections within one popup window"
- [x] Is this about the tray icon rings, a popup/dashboard graph, or both?: "the dashboard graph (the one with 3 lines)"

**Plan:**
1. Refactor `buildChart()` in `dashboard.js` to accept a `lineKey` parameter (`"s"` or `"w"`) and only render that line.
2. In `renderHistory()`, render two `.chart-container` divs stacked vertically, each with its own legend.
   - Session chart: session line only, legend label "Session".
   - Weekly chart: weekly line + expected dashed line, legends "Weekly" and "Expected".
3. Both charts share the same x-axis bounds (the 7-day weekly window).
4. Update `lineVisible` state keys and `applyLineVisibility()` to target each chart's SVG by ID independently.

---

## [T-003] Show safe pace indicator in dashboard
**Status:** planned
**Added:** 2026-03-21
**Description:** Next to each utilization percentage in the dashboard, show what percentage would be "safe" to be at right now based on time elapsed in the window (e.g. halfway through the session = 50% safe). The name for this metric is "Safe Pace".
**Questions:**
- [x] What should this indicator be called? Options: "safe pace", "expected", "on track", "pace", or something else?: "Safe Pace"
- [x] How should it be displayed in the stat card?: "Two values side by side — current % on the left, safe pace % on the right, each with a small label beneath (current / safe pace). Reset time sublabel spans the bottom."

**Plan:**
1. Compute safe pace for each window:
   - Session: `Math.round(elapsedMs / (5 * 3_600_000) * 100)` where `elapsedMs = sessionEndMs - Date.now()` (clamped 0-100).
   - Weekly: `Math.round(elapsedMs / (7 * 24 * 3_600_000) * 100)` where `elapsedMs = weeklyEndMs - Date.now()` (clamped 0-100).
2. Rework each `.stat-card` in `renderHistory()` to show two values side by side:
   ```
   Session (5h)
   17%          50%
   current      safe pace    ← very small dim text
   resets in 2h 35m
   ```
3. Use a two-column flex row inside the card for the values + sublabels. The reset time sits below spanning full width.
4. "current" and "safe pace" labels use the existing `.stat-sublabel` style or smaller variant.

---

## [T-004] Increase dashboard graph item font size
**Status:** planned
**Added:** 2026-03-21
**Description:** The font size of graph items (labels, values, etc.) in the dashboard should be increased for better readability.
**Questions:**
_(none)_

**Plan:**
1. In `buildChart()` in `dashboard.js`, increase y-axis label `font-size` from `8` to `10`.
2. Increase x-axis day-name label `font-size` from `8` to `10`.
3. Increase x-axis date label `font-size` from `7` to `9`.
4. Increase bottom margin `MB` from `38` to `42` to accommodate the taller x-axis labels.

---

## [T-005] Add week pagination to dashboard
**Status:** planned
**Added:** 2026-03-21
**Description:** Add left/right pagination controls to the dashboard so the user can navigate to previous weeks and view their historical usage graphs.
**Questions:**
_(none)_

**Plan:**
1. In `history.js`, change `retainedDays()` to keep 35 days (5 weeks) instead of 7. Update the loop from `i < 7` to `i < 35`.
2. In `dashboard.js`, add a `let weekOffset = 0` state variable (0 = current week, 1 = one week back, etc.).
3. Add prev/next pagination buttons to the chart area header (e.g. `◀ Week  ▶`). Style consistently with existing icon buttons.
4. Compute the displayed week's bounds: `const shiftMs = weekOffset * 7 * 24 * 3_600_000`, then `weeklyEndMs -= shiftMs` and `weeklyStartMs -= shiftMs`.
5. Filter `history` to records within `[weeklyStartMs, weeklyEndMs]` before passing to `buildChart()`.
6. Disable the next (▶) button when `weekOffset === 0`. Disable prev (◀) when no history data exists in the previous window.
7. Note: history is already stored per-hour bucket (poll is every 60 min), so no compression is needed.

---

## [T-006] Add cache cleanup on startup
**Status:** planned
**Added:** 2026-03-21
**Description:** Add a cache cleanup routine to prune old cached data so it doesn't grow indefinitely. Triggered on app startup. Threshold is 5 weeks, rounded to week boundaries.
**Questions:**
- [x] What age threshold should trigger deletion? (You suggested ~1 month — confirm?): "5 weeks, tied to T-005 retention window"
- [x] Should cleanup run on every startup, or only if the cache exceeds a certain size/age?: "every startup"

**Plan:**
1. In `history.js`, add a `pruneHistory()` export that:
   - Loads the current history file.
   - Computes cutoff: start of the calendar week (Sunday or Monday, consistent with locale) that is 5 full weeks ago.
   - Removes all records whose date portion falls before the cutoff.
   - Writes the pruned history back to disk.
2. In `main.js`, call `pruneHistory()` inside `app.whenReady()` before the first poll/scrape runs.
3. This ensures stale data is cleaned up even if the app was closed for an extended period and no new `recordSnapshot` writes occurred.

---
