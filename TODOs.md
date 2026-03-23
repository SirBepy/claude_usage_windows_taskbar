# TODOs

<!-- last-id: 7 -->

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
