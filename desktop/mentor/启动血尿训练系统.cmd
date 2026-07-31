@echo off
setlocal
set "MENTOR_ROOT=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%MENTOR_ROOT%tools\Start-Mentor.ps1"
if errorlevel 1 (
  echo.
  echo Startup did not complete. Follow the repair message above and retry.
  pause
)
endlocal
