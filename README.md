# Claude AI Usage Toolbar

A Windows system tray app that monitors your Claude AI session usage in real time.
It scrapes the Claude usage page once per hour and shows a dual progress-ring icon
so you always know how much of your session and weekly allowance you've used.

## Requirements

- Windows (macOS support planned)
- [Node.js](https://nodejs.org/) (v18+)
- Google Chrome installed (optional — used to import your existing Claude session)

## Installation

```bash
npm install
```

## Running

```bash
npm start
```

## First launch

On first launch the app needs a Claude session. It will try one of two paths:

### Option A — Import from Chrome (recommended)

If Chrome is installed and you're already logged in to claude.ai there, the app
shows a profile picker. Select your Chrome profile and the app will read and
decrypt Chrome's cookies to import your Claude session automatically. Chrome can
be open or closed.

### Option B — Log in manually

If Chrome is not detected, a login window opens directly to `https://claude.ai/login`.
Sign in (Google OAuth is supported). Once login is detected the window closes and
the app starts polling.

After a successful login the session is saved, so subsequent launches skip this
step entirely.

## Tray icon

The icon is a 22×22 dual progress ring generated entirely at runtime (no image files):

- **Outer ring** — session (5-hour window) utilisation
- **Inner ring** — weekly (7-day window) utilisation

Each ring is coloured independently:

| Color  | Meaning     |
|--------|-------------|
| Blue   | Loading / unknown |
| Green  | < 50% used  |
| Orange | 50–80% used |
| Red    | > 80% used  |

**Left-click** the icon to manually trigger a refresh. The outer ring animates with
a spinning blue arc while the fetch is in progress, then snaps back to real data.

**Hover** over the icon to see a tooltip with exact percentages and reset times for
both the session and weekly windows.

**Right-click** for a context menu with Refresh, Log Out, and Quit.

## How it works

Usage is fetched by loading `https://claude.ai/settings/usage` in a hidden Electron
window and intercepting the `/api/organizations/.../usage` network response via the
Chrome DevTools Protocol (CDP Fetch domain). The page handles authentication using
the stored session cookies — no API key, token, or manual auth headers needed.

Data is polled automatically once per hour, or on demand by clicking the icon.
A 401/403 response clears the session and shows the login window again.

## Project structure

| Path | Role |
|---|---|
| `main.js` | App lifecycle, tray, windows, polling, IPC |
| `src/icon.js` | Runtime PNG generation — dual progress ring + spin animation |
| `src/usage-parser.js` | Parses the usage API response into percentages and reset times |
| `src/scraper.js` | Loads the usage page in a hidden window, intercepts the API call via CDP |
| `src/session.js` | Cookie helpers (`clearClaudeCookies`) |
| `src/chrome-import.js` | Chrome cookie import — locked-file copy, DPAPI decryption, sql.js |
| `profile-preload.js` | Exposes `window.profileAPI` to the profile picker |
| `profile-picker.html` | Chrome profile selection window shown on first launch |
