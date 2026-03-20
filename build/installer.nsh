; ── Why this file exists ──────────────────────────────────────────────────────
;
; electron-builder's default NSIS close logic sends WM_CLOSE to windows.
; A tray-only app has no windows, so the signal is ignored and the installer
; shows "cannot be closed" even when the app appears to not be running.
;
; Two macros are used:
;
;   customInit           — runs in .onInit, BEFORE process detection.
;                          Kills the app here so the detection finds nothing.
;
;   customCloseApplication — runs when detection finds the app still running
;                          (e.g. on Retry). Belt-and-suspenders kill.
;
; All exec calls use nsExec::ExecToLog (instead of ExecWait) so no console
; window flashes during install. cmd.exe /C resolves curl and taskkill via
; the shell PATH regardless of NSIS process bitness / WOW64 redirects.
; "2>nul & exit 0" suppresses errors when the process isn't found.

!macro _killApp
  ; 1. Graceful quit via hook server (app calls app.quit() on POST /quit)
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C curl -s -m 3 -X POST http://127.0.0.1:27182/quit 2>nul & exit 0'
  Sleep 2500

  ; 2. Force-kill main process and any surviving Electron helper processes
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "Claude Usage Taskbar Tool.exe" 2>nul & exit 0'
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "Claude Usage Taskbar Tool Helper.exe" 2>nul & exit 0'
  Sleep 2000
!macroend

; Runs inside .onInit — before electron-builder checks if the app is running
!macro customInit
  !insertmacro _killApp
!macroend

; Runs when the process-still-running dialog offers Retry
!macro customCloseApplication
  !insertmacro _killApp
!macroend
