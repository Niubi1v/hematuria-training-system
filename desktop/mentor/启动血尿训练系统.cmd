@echo off
chcp 65001 >nul
setlocal
set "MENTOR_ROOT=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%MENTOR_ROOT%tools\Start-Mentor.ps1"
if errorlevel 1 (
  echo.
  echo 启动未完成。请按上方提示修复后重试。
  pause
)
endlocal
