# TODOs

<!-- last-id: 16 -->




## [T-015] Token stats parser and history storage
**Status:** planned
**Added:** 2026-03-29
**Description:** Epic 2a. On Stop hook: stream the transcript JSONL line by line, sum `input_tokens` + `output_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens` from all `assistant` entries, and append one record to a persistent `token-history.json`. Also expose a "backfill" function that scans all existing `~/.claude/projects/` transcripts to pre-populate history. Gates T-016.
**Questions:**
- [x] Split from original T-015?: "Yes - parser+storage here, dashboard UI in T-016"

**Plan:**
1. Create `src/core/transcript-parser.js`: stream a JSONL file line by line with Node's `readline`, accumulate `usage` fields from `type === "assistant"` entries, return `{ inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, turns }`.
2. Create `src/core/token-stats.js`: handles reading/writing `token-history.json` (stored in `app.getPath("userData")`). Exposes `appendSession({ sessionId, cwd, date, ...tokens })` and `loadHistory()`. Prunes duplicate `sessionId` entries on append.
3. In `main.js`, update the `/refresh` handler: after receiving the body, extract `transcript_path` + `cwd`, call the parser, then call `appendSession`. Do this async - don't block the refresh animation.
4. Add a `backfillAllTranscripts()` function in `token-stats.js`: glob `~/.claude/projects/**/*.jsonl`, skip any `sessionId` already in history, parse and append each. Expose via IPC so the dashboard can trigger it.
5. Expose `loadHistory` and `backfillAllTranscripts` to the renderer via `ipcMain` and `preload.js`.

---

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
