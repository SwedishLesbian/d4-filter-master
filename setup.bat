@echo off
setlocal
title d4-lootfilter-generator setup
cd /d "%~dp0"

echo ============================================
echo  d4-lootfilter-generator setup
echo ============================================
echo.

rem ---- find a usable Python (3.9+) ----
set "PY="
call :trypy python
if not defined PY call :trypy py -3

if not defined PY (
    echo Python 3.9+ was not found on this PC.
    where winget >nul 2>&1
    if not errorlevel 1 (
        echo Installing Python via winget, this can take a few minutes...
        winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
        echo.
        echo Python was installed. Close this window and run setup.bat
        echo once more so the new installation is picked up.
    ) else (
        echo Opening the Python download page in your browser.
        echo Run the installer, tick "Add python.exe to PATH",
        echo then run setup.bat again.
        start "" https://www.python.org/downloads/
    )
    echo.
    pause
    exit /b 1
)
echo [ok] Python found: %PY%

rem ---- pip ----
%PY% -m pip --version >nul 2>&1
if errorlevel 1 (
    echo pip is missing, setting it up...
    %PY% -m ensurepip --upgrade
    if errorlevel 1 (
        echo Could not set up pip. Reinstall Python from python.org.
        pause
        exit /b 1
    )
)
echo [ok] pip works

rem ---- playwright package ----
%PY% -c "import playwright" >nul 2>&1
if errorlevel 1 (
    echo Installing Playwright...
    %PY% -m pip install -r requirements.txt
    if errorlevel 1 (
        echo Playwright installation failed, see the message above.
        pause
        exit /b 1
    )
    echo [ok] Playwright installed
) else (
    echo [ok] Playwright already installed
)

rem ---- chromium for playwright ----
%PY% -c "import os,sys;from playwright.sync_api import sync_playwright;pw=sync_playwright().start();ok=os.path.exists(pw.chromium.executable_path);pw.stop();sys.exit(0 if ok else 1)" >nul 2>&1
if errorlevel 1 (
    echo Downloading Chromium for Playwright, roughly 150 MB, one time only...
    %PY% -m playwright install chromium
    if errorlevel 1 (
        echo Chromium download failed, check your internet connection.
        pause
        exit /b 1
    )
    echo [ok] Chromium installed
) else (
    echo [ok] Chromium already installed
)

echo.
echo Setup complete. Double-click run.bat to build a filter.
if "%~1"=="" pause
exit /b 0

:trypy
%* --version >nul 2>&1 || exit /b
%* -c "import sys;raise SystemExit(0 if sys.version_info>=(3,9) else 1)" >nul 2>&1 || exit /b
set "PY=%*"
exit /b
