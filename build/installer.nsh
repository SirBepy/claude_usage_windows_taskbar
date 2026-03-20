; Custom close handler for tray apps.
;
; Problem: the default NSIS CloseApplication plugin works by sending WM_CLOSE
; to windows. A tray-only app has no windows, so the signal is ignored and the
; installer shows "cannot be closed".
;
; Fix (two stages):
;   1. Ask the app to quit gracefully via its built-in HTTP hook server.
;      curl.exe is shipped with Windows 10 1803+ (lives in System32).
;   2. Hard-kill any surviving processes using taskkill with the full System32
;      path (no reliance on PATH being set in the NSIS environment).
;      /F = force  /T = include child processes (Electron helpers)
!macro customCloseApplication
  ; Stage 1 — graceful quit (app responds to POST /quit by calling app.quit())
  ExecWait '"$SYSDIR\curl.exe" -s -m 3 -X POST http://127.0.0.1:27182/quit'
  Sleep 2500

  ; Stage 2 — force-kill any remaining Electron processes
  ExecWait '"$SYSDIR\taskkill.exe" /F /T /IM "Claude Usage Taskbar Tool.exe"'
  ExecWait '"$SYSDIR\taskkill.exe" /F /T /IM "Claude Usage Taskbar Tool Helper.exe"'
  Sleep 1000
!macroend
