# TODOs

<\!-- last-id: 18 -->

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

## [T-018] Expected line in 5-hour session graph
**Status:** planned
**Added:** 2026-04-08
**Description:** Add the "expected" pace line to the 5-hour session graphs, matching the existing pace line on the 7-day graph.
**Questions:**
- [x] Same style as weekly pace line? "Yes, identical dashed gray diagonal, same toggling behavior"

**Plan:**
1. In `buildChart()` in `dashboard.js`, remove the `lineKey === "w"` guard on the expected pace line rendering (~line 223) so the diagonal `refLine` also renders for `lineKey === "s"` (session graphs)
2. Add an "Expected" legend entry to the session graph legend (matching the weekly graph's existing legend entry)
3. Wire the same legend click toggle behavior for the session expected line
4. Verify the diagonal goes from (windowStart, 0%) to (windowEnd, 100%) correctly for 5-hour windows

---

