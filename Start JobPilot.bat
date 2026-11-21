@echo off
REM Double-click launcher, so using JobPilot needs no terminal knowledge.
REM The server runs in THIS window (closing it stops the app); a hidden helper
REM waits a few seconds and then opens the browser, because opening it
REM immediately lands on an error page before the server has finished starting.
title JobPilot
cd /d "%~dp0"

echo ============================================
echo    Starting JobPilot
echo ============================================
echo.
echo Keep this black window OPEN while you use JobPilot.
echo Closing it shuts the app down.
echo.

if not exist "node_modules" (
  echo First run - installing what JobPilot needs.
  echo This happens once and takes a few minutes.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed. Run:  npm install
    echo.
    pause
    exit /b 1
  )
)

echo Opening your browser in a moment...
echo If it does not open, go to:  http://127.0.0.1:3000
echo.

powershell -NoProfile -Command "Start-Process -WindowStyle Hidden powershell -ArgumentList '-NoProfile','-Command','Start-Sleep -Seconds 6; Start-Process \"http://127.0.0.1:3000\"'"

npm run dev

echo.
echo JobPilot has stopped. You can close this window.
pause
