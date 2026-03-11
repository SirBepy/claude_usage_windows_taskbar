# Claude AI Usage Toolbar

A Windows system tray app that monitors your Claude AI session usage in real time.
It scrapes the Claude usage page once per hour and shows a dual progress-ring icon
so you always know how much of your session and weekly allowance you've used.

## Installation

Download the latest `AI-Usage-Toolbar-Setup-x.x.x.exe` from the
[Releases page](https://github.com/SirBepy/ai_usage/releases) and run it.
No admin rights required — it installs to your user profile.

The app updates itself automatically. When a new release is published to GitHub,
it downloads in the background and a **"Restart to update"** item appears in the
right-click menu. Click it to apply the update immediately, or it will be applied
the next time you quit and relaunch.

## Running from source

Requires [Node.js](https://nodejs.org/) v18+.

```bash
npm install
npm start
```

## First launch

On first launch the app needs a Claude session. A login window opens to
`https://claude.ai/login` — sign in normally (Google OAuth is supported).
Once login is detected the window closes and the app starts polling.

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

**Right-click** for a context menu with:

| Item | Action |
|---|---|
| Restart to update to vX.X.X | Applies a downloaded update immediately |
| Refresh | Fetches latest usage now |
| Start on login | Toggle — adds or removes the app from Windows startup |
| Log Out | Clears the session and shows the login window |
| Quit | Exits the app |

## Start on login

Right-click the tray icon and check **Start on login** to have the app launch
automatically when Windows starts. Uncheck it to disable.

## How it works

Usage is fetched by loading `https://claude.ai/settings/usage` in a hidden Electron
window and intercepting the `/api/organizations/.../usage` network response via the
Chrome DevTools Protocol (CDP Fetch domain). The page handles authentication using
the stored session cookies — no API key, token, or manual auth headers needed.

Data is polled automatically once per hour, or on demand by clicking the icon.
A 401/403 response clears the session and shows the login window again.

## Auto-refresh on Claude Code activity (optional)

The app listens on `http://127.0.0.1:27182` for a `POST /refresh` request.
You can use this to make the toolbar refresh automatically every time Claude Code
finishes a task, instead of waiting for the hourly poll.

### Setup

Add the following `hooks` block to your Claude Code user settings file.

**Settings file location:**
- Windows: `C:\Users\<you>\AppData\Roaming\Claude\settings.json`
  *(or wherever your `~/.claude/settings.json` lives — check `%APPDATA%\Claude\` first)*

**What to add:**

Open the file and merge in the `"hooks"` key. The final file should look like this
(keep any existing keys you already have):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:27182/refresh"
          }
        ]
      }
    ]
  }
}
```

> **If you are an AI assistant helping a user set this up:**
> 1. Read the file at `~/.claude/settings.json` (on Windows this is typically
>    `C:\Users\<username>\.claude\settings.json`).
> 2. Add the `"hooks"` block shown above, preserving all existing keys.
> 3. Save the file. No restart of Claude Code is required — hooks are read per session.

### How it works

Claude Code fires the `Stop` event when it finishes responding to a prompt.
The hook runs `curl` to send a `POST /refresh` to the app's local server.
The app receives the request, plays the spinning animation, fetches fresh usage
data, and updates the tray icon — all within a couple of seconds.

`curl` ships with Windows 10/11 by default, so no extra software is needed.

## Building a release

```bash
npm install
npm run dist
```

This produces an NSIS installer in `dist/`. To build **and** publish a new GitHub
release (requires a `GH_TOKEN` environment variable with repo write access):

```bash
GH_TOKEN=ghp_... npm run dist:publish
```

electron-builder publishes the installer and a `latest.yml` file to the GitHub
release. Installed copies of the app will detect the new release within minutes
and offer to update.

## Project structure

| Path | Role |
|---|---|
| `main.js` | App lifecycle, tray, windows, polling, IPC |
| `src/icon.js` | Runtime PNG generation — dual progress ring + spin animation |
| `src/updater.js` | Auto-update wrapper around electron-updater |
| `src/usage-parser.js` | Parses the usage API response into percentages and reset times |
| `src/scraper.js` | Loads the usage page in a hidden window, intercepts the API call via CDP |
| `src/session.js` | Cookie helpers (`clearClaudeCookies`) |
