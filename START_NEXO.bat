@echo off
setlocal
title NEXO v2
cd /d "%~dp0"
for /f "tokens=1 delims=v." %%a in ('node -v 2^>nul') do set MAJOR=%%a
if not defined MAJOR (
  echo NEXO needs Node.js 22.5 or newer.
  echo Install/update Node.js, then run this file again.
  pause
  exit /b 1
)
if %MAJOR% LSS 22 (
  echo NEXO v2 needs Node.js 22.5 or newer because it uses the built-in SQLite database.
  pause
  exit /b 1
)
echo Starting NEXO v2...
echo Keep this window open while using NEXO.
echo.
node server.js
pause
