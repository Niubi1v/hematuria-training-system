@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未检测到 npm。请先安装 Node.js 20 或更高版本：
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo 正在安装依赖，首次运行可能需要几分钟...
  npm install
  if errorlevel 1 (
    echo.
    echo 依赖安装失败。请检查网络，或在项目目录手动运行 npm install。
    pause
    exit /b 1
  )
)

echo.
echo 正在启动血尿病史采集训练系统...
start "" "http://127.0.0.1:3000"
npm run dev -- --hostname 127.0.0.1 --port 3000

