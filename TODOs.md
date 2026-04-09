# TODOs

<\!-- last-id: 20 -->

## [T-017] Chart/bar graph toggle per usage graph
**Status:** planned
**Added:** 2026-04-08
**Description:** Each usage graph gets a toggle to switch between the current chart view and a per-project bar breakdown (e.g. "80% total, 60% by Project A, 20% by Project B").
**Questions:**
- [x] Bar visualization style? "Horizontal bars per project, sorted descending by contribution"
- [x] Toggle placement? "In the graph header, small tabs next to the title"
- [x] Max projects shown? "Top 5, rest as 'Other'. 'Show X more' link navigates to the existing all-projects screen for that timeframe"

**Plan:**
1. Add `[Chart] [Bars]` toggle tabs in the graph header area (next to "Session (5h)" / "Weekly (7d)" titles) in `dashboard.html`/`dashboard.js`
2. Track toggle state per graph (session vs weekly) in dashboard.js state
3. Create `buildProjectBarsView(lineKey, windowStart, windowEnd)` in `dashboard.js` that:
   - Reuses the existing `buildWindowProjectsHTML()` attribution logic (projectTokens/totalTokens * percentageGain)
   - Renders horizontal bars per project, sorted descending
   - Shows top 5 projects, groups remainder into "Other"
   - Shows a "Show X more" link that navigates to the existing stats/project detail screen filtered to that timeframe
   - Displays total % at the bottom
4. When "Bars" tab is active, replace the SVG chart area with the horizontal bars view
5. When "Chart" tab is active, show the existing SVG polyline chart (current behavior)
6. Style the toggle to match existing dashboard theme (dark background, matching colors)

---

## [T-019] Fix sound not firing for AskUserQuestion
**Status:** pending
**Added:** 2026-04-09
**Description:** Sound notification does not play when AskUserQuestion is fired. Need to investigate why the sound hook is not triggering and fix it.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

## [T-020] Don't log out on network drop
**Status:** pending
**Added:** 2026-04-09
**Description:** When WiFi drops temporarily (common on macOS), the app treats it as an expired session and logs the user out, forcing re-authentication. The app should tolerate transient network failures and only log out on a genuine auth expiry, not a connectivity blip.
**Questions:**
_(none)_

**Plan:**
_(empty)_

---

