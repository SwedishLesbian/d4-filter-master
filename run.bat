@echo off
setlocal
title d4-lootfilter-generator
cd /d "%~dp0"
chcp 65001 >nul

rem ---- find Python and make sure everything is installed ----
set "TRIED="
:checkdeps
set "PY="
call :trypy python
if not defined PY call :trypy py -3
if not defined PY goto :needsetup
%PY% -c "import os,sys;from playwright.sync_api import sync_playwright;pw=sync_playwright().start();ok=os.path.exists(pw.chromium.executable_path);pw.stop();sys.exit(0 if ok else 1)" >nul 2>&1
if errorlevel 1 goto :needsetup

:ask
echo.
set "URL="
set /p URL="Paste the build link (Mobalytics, D4Builds or InfinityBuilds): "
if not defined URL goto :ask
set "URL=%URL:"=%"

set "ANC="
set /p ANC="Show unique gear only as Ancestral? [y/N]: "
set "ANCFLAG="
if /i "%ANC%"=="y" set "ANCFLAG=--ancestral-uniques"

set "ANCG="
set /p ANCG="Show matching gear only as Ancestral? [y/N]: "
set "ANCGFLAG="
if /i "%ANCG%"=="y" set "ANCGFLAG=--ancestral-gear"

echo.
echo Fetching the build, this takes a moment...
%PY% d4_lootfilter.py "%URL%" %ANCFLAG% %ANCGFLAG%
echo.
set "AGAIN="
set /p AGAIN="Another build? [y/N]: "
if /i "%AGAIN%"=="y" goto :ask
exit /b 0

:needsetup
if defined TRIED (
    echo.
    echo Requirements are still missing. If Python was just installed,
    echo close this window and start run.bat again.
    pause
    exit /b 1
)
set "TRIED=1"
echo Missing requirements, running setup first...
echo.
call setup.bat auto
goto :checkdeps

:trypy
%* --version >nul 2>&1 || exit /b
%* -c "import sys;raise SystemExit(0 if sys.version_info>=(3,9) else 1)" >nul 2>&1 || exit /b
set "PY=%*"
exit /b
