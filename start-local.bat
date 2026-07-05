@echo off
setlocal
cd /d "%~dp0"

set "BUNDLED_NODE=C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "BUNDLED_PNPM=C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd"

if exist "%BUNDLED_NODE%\node.exe" (
  set "PATH=%BUNDLED_NODE%;%PATH%"
)

start "" "http://127.0.0.1:3000"

if exist "%BUNDLED_PNPM%" (
  "%BUNDLED_PNPM%" exec next dev -H 127.0.0.1 -p 3000
) else (
  npm run dev
)
