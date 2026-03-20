; Custom close handler for tray apps.
;
; Problem: the default NSIS CloseApplication plugin works by sending WM_CLOSE
; to windows. A tray-only app has no windows, so the signal is ignored and the
; installer shows "cannot be closed".
;
; Two-stage fix:
;   1. Ask the app to quit gracefully via its HTTP hook server.
;   2. Force-kill any surviving Electron processes via taskkill.
;
; Everything runs through "cmd.exe /C" to avoid the WOW64 filesystem redirect
; issue where $SYSDIR may point to SysWOW64 on a 32-bit NSIS process running
; on a 64-bit OS. cmd.exe always resolves executables from the real PATH.
!macro customCloseApplication
  ; Stage 1 — graceful quit (app responds to POST /quit by calling app.quit())
  ExecWait '"$SYSDIR\cmd.exe" /C curl -s -m 3 -X POST http://127.0.0.1:27182/quit 2>nul & exit 0'
  Sleep 2500

  ; Stage 2 — force-kill any surviving processes (/T = kill child processes too)
  ExecWait '"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "Claude Usage Taskbar Tool.exe" 2>nul & exit 0'
  ExecWait '"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "Claude Usage Taskbar Tool Helper.exe" 2>nul & exit 0'
  Sleep 1500
!macroend
