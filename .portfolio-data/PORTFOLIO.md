# Claude AI Usage Toolbar

## The What

A system tray app for Windows and macOS that monitors your Claude Pro usage limits in real time. It tracks two windows simultaneously — the 5-hour session limit and the 7-day rolling limit — and renders them as a dual concentric ring icon in the tray, colour-coded from green to orange to red. No browser, no interruptions; the data is always one glance away.

## The Why

Claude Pro throttles usage across two overlapping time windows, but there's no native indicator for either. The only way to check is to navigate to the settings page, which breaks flow when you're deep in work. This app makes the limits passive and ambient — you only notice them when they're getting close.

## The How

Getting usage data without maintaining a separate authenticated API client was the main challenge. The solution: open a hidden browser window, enable the Chrome DevTools Protocol Fetch domain, and intercept the page's own API call mid-flight — reading the response body before the page receives it. No auth headers to replicate, no separate session to manage. The tray icon is drawn entirely at runtime using raw PNG encoding (zlib + Buffer), so there are no image assets on disk. Updates ship silently via GitHub Releases.
