@echo off
title George Bank Dev Server
cd /d "%~dp0"
echo ===================================================
echo   Spustam George Bank Dev Server na porte 3030
echo   URL: http://localhost:3030
echo ===================================================
npm run dev
pause
