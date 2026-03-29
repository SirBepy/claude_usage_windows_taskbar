# TODOs

<!-- last-id: 15 -->

## [T-012] Investigate Stop hook stdin payload
**Status:** pending
**Added:** 2026-03-29
**Description:** Before building token stats (T-015), verify the Stop hook actually delivers what we expect. Trigger a real Claude Code session, log the full raw stdin JSON to a file, confirm `cwd` and `transcript_path` fields exist, open the JSONL transcript and inspect a few entries to confirm the `usage` block shape (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`). This task gates T-015 - do not start T-015 until this passes.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-013] Project-aware "finished working" notification
**Status:** pending
**Added:** 2026-03-29
**Description:** Epic 1a. When the Stop hook fires (POST /refresh), parse the request body to extract `cwd`, derive the project name (last path segment), and fire a native OS notification: "Claude finished working in <project>". Requires updating the hook script to pipe stdin into the POST body, and updating the server handler to read + parse it.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-014] "Waiting for input" notification
**Status:** pending
**Added:** 2026-03-29
**Description:** Epic 1b. Wire up a new hook endpoint (POST /notify or similar) triggered by Claude Code's Notification hook event. Parse `cwd` from the payload the same way as T-013, then show a native OS notification: "Claude is waiting for input in <project>". Shares all the stdin-forwarding infrastructure introduced in T-013 - do T-013 first.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-015] Per-project token statistics dashboard
**Status:** pending
**Added:** 2026-03-29
**Description:** Epic 2. Requires T-012 to pass first. On Stop hook: read `transcript_path` from payload, parse the JSONL, sum `input_tokens` + `output_tokens` + `cache_read_input_tokens` per session, and append `{ project, date, inputTokens, outputTokens, cacheReadTokens }` to a local token-history JSON file. In the dashboard: add a "Token Stats" view showing usage grouped by project. Clicking a project shows a day-by-day breakdown.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---
