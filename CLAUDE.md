# Claude AI Usage Toolbar

Windows (future: macOS) system tray app that monitors Claude AI usage by loading
the Claude settings/usage page in a hidden window and intercepting the API response
via CDP, once per hour.

## Running

```bash
npm install
npm start
```

## Architecture

**Single process: Electron main** (`main.js`) — no renderer bundle, no build step.

| File | Role |
|---|---|
| `main.js` | App lifecycle, tray, windows, polling, IPC |
| `src/core/icon.js` | Runtime PNG generation — dual progress ring + spin animation |
| `src/core/updater.js` | Auto-update wrapper around `electron-updater`; skips in dev mode |
| `src/core/usage-parser.js` | Parses `five_hour` / `seven_day` fields from usage API response |
| `src/core/scraper.js` | Fetches usage data via hidden BrowserWindow + CDP Fetch interception |
| `src/core/session.js` | `clearClaudeCookies()` |
| `src/core/history.js` | Snapshot persistence — read/write/prune usage history |
| `src/core/settings.js` | Load/save user settings to disk |
| `src/renderer/dashboard.html` | Dashboard + settings UI (single-file SPA) |
| `src/renderer/dashboard.js` | Dashboard renderer logic |
| `src/renderer/preload.js` | Electron contextBridge — exposes IPC to renderer |
| `src/assets/icon.png` | App icon (512×512, for window chrome and installer) |
| `src/assets/icon.svg` | Source SVG for icon generation |
| `scripts/generate-icons.js` | Dev utility — regenerates icon.png from icon.svg via sharp |

## Authentication flow

1. On startup, try to resume from a saved session (Electron persists cookies across runs).
2. If no session, clear stale cookies and show `https://claude.ai/login` in a full `BrowserWindow`.
   Google OAuth popups are allowed via `setWindowOpenHandler`. Navigation away
   from auth pages triggers `tryAutoDetectLogin` which re-runs the scraper.

## Usage scraping

Instead of calling the API directly (which requires replicating browser auth headers),
`fetchUsageFromPage()` in `src/core/scraper.js`:

1. Opens a hidden `BrowserWindow` (never shown to the user).
2. Enables the **CDP Fetch domain** with a URL pattern matching `*/api/organizations/*/usage`.
3. Loads `https://claude.ai/settings/usage`.
4. When the page makes its own API call, the Fetch domain **pauses** the response.
5. Calls `Fetch.getResponseBody` to read the body (guaranteed available since paused).
6. Calls `Fetch.continueRequest` so the page isn't left hanging.
7. Resolves with the parsed JSON; destroys the window.

A redirect to `/login` during navigation signals an expired session (rejects with `HTTP 401`).

## API response shape

```json
{
  "five_hour": { "utilization": 30, "resets_at": "<ISO8601>" },
  "seven_day":  { "utilization": 36, "resets_at": "<ISO8601>" },
  "extra_usage": { "is_enabled": false, ... }
}
```

`five_hour.utilization` = session (5-hour window) percentage 0–100.
`seven_day.utilization` = weekly (7-day window) percentage 0–100.

## Tray icon

Generated at runtime as a 22×22 RGBA PNG using only Node built-ins (`zlib` + `Buffer`).
No image files on disk. Rendered in `src/core/icon.js`.

**Normal state** — dual concentric progress rings:
- Outer ring (r 7.5–10.5): session utilisation
- Inner ring (r 3.5–5.5): weekly utilisation
- Each ring coloured by urgency: Blue (loading) → Green (<50%) → Orange (50–80%) → Red (>80%)
- Unfilled portion rendered as a dim grey track

**Refresh animation** — triggered by clicking the tray icon:
- Outer ring replaced by a rotating bright-blue arc (~108°, 20 fps)
- Inner ring stays at last known weekly value
- Implemented in `makeSpinFrame(frame, weeklyPct)`

## Keeping README up to date

**Whenever the authentication flow, tray behaviour, scraping approach, or project
structure changes, update `README.md` to match.** The README is the user-facing
document; CLAUDE.md is the developer reference. Both must stay in sync.

## Key dependencies

| Package | Why |
|---|---|
| `electron` (devDep) | App framework |
