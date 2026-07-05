@echo off
setlocal
cd /d "%~dp0"

set "BUNDLED_NODE=C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist out (
  echo Building static site...
  if exist "%BUNDLED_NODE%" (
    "%BUNDLED_NODE%" node_modules\next\dist\bin\next build
  ) else (
    npm run build
  )
)

echo.
echo Opening static preview at http://127.0.0.1:4173
start "" "http://127.0.0.1:4173"

if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" scripts\serve-static.mjs
) else (
  npm run preview
)
