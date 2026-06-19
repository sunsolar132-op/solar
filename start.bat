@echo off
title WMS - Warehouse Management System
echo ===================================================
echo   Starting Warehouse Management System (WMS)...
echo   Starting both Backend Server and Frontend Client
echo ===================================================
echo.
cd /d "%~dp0"
call npm run dev
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start WMS. Please make sure Node.js is installed.
    pause
)
