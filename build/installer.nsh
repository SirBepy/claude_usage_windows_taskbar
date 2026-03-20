; Custom close handler for tray apps.
; The default NSIS CloseApplication plugin sends WM_CLOSE to windows,
; which does nothing for a system tray app that has no visible windows.
; We use taskkill /F /T to force-terminate the process tree instead.
!macro customCloseApplication
  DetailPrint "Closing Claude Usage Taskbar Tool..."
  nsExec::Exec 'taskkill /F /IM "Claude Usage Taskbar Tool.exe" /T'
  Sleep 2000
!macroend
