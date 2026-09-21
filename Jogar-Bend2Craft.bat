@echo off
rem Launcher for the Bend2Craft static bundle in dist/.
rem Serves dist/ on http://localhost:8080/ and opens the default browser.
title Bend2Craft
cd /d "%~dp0"
set PORT=8080
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js to play Bend2Craft.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo dist\index.html was not found. Run "npm run build" from WSL first.
  pause
  exit /b 1
)
echo Starting Bend2Craft at http://localhost:%PORT%/?play=1^&seed=1337 ...
echo Keep this window open while you play. Press Ctrl+C to stop.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%PORT%/?play=1^&seed=1337"
node scripts\play-server.mjs
pause
