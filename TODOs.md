# TODOs

<!-- last-id: 16 -->




## [T-016] Token stats dashboard UI
**Status:** planned
**Added:** 2026-03-29
**Description:** Epic 2b. Requires T-015. Build the Stats screen in the dashboard and the today-summary section on the main screen. Stats screen: sortable table (Project | Sessions | Avg tokens/session | Total tokens | % of total | Last active), click project to see day-by-day bar chart with empty-day skipping, time range toggle (7d/30d/all), scroll left/right. Per-project custom emoji + display name stored in settings. Today summary: shown on main screen between usage graphs and session/weekly boxes. Main screen shows projects active today with token count and cache efficiency %.
**Questions:**
- [x] What do bar chart bars represent?: "Tokens only - bar height = total tokens that day"

**Plan:**
1. Add a "Stats" nav tab to `dashboard.html` alongside existing tabs. Clicking it shows the stats screen, hides others.
2. **Stats table:** render rows from `loadHistory()` aggregated by `cwd`. Columns: Project (emoji + display name), Sessions, Avg tokens/session, Total tokens, % of total, Last active. Each column header is clickable to sort asc/desc. Default sort: Total tokens desc.
3. **Project drill-down:** clicking a row opens a detail view. Show the day-by-day bar chart: x-axis = dates with activity only (skip empty days), y-axis = total tokens that day. Include prev/next scroll buttons and a time range toggle (7 days / 30 days / All time).
4. **Per-project settings:** small edit button per row opens an inline form to set a custom display name and emoji. Saved to `settings.json` under a `projectAliases` map keyed by `cwd`.
5. **Today summary on main screen:** insert a "Today" section between the usage ring area and the session/weekly percentage boxes. Lists each project active today with total tokens and cache efficiency % (`cacheReadTokens / (inputTokens + cacheReadTokens + cacheCreationTokens) * 100`). Hidden if no activity today.
6. **Backfill button:** in the Stats screen footer, a "Rebuild history" button that calls `backfillAllTranscripts()` via IPC. Show a spinner and a "This may take a while" note while running. Disable the button during the scan.

---
