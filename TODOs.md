# TODOs

<!-- last-id: 7 -->

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
