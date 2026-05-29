@echo off
cd /d "%~dp0"

set "DO_CLEAN=0"
if /i "%~1"=="clean" set "DO_CLEAN=1"

if %DO_CLEAN%==1 (
    echo Cleaning site...
    call bundle exec jekyll clean || exit /b
)

echo Starting Jekyll server on 127.0.0.1:4000 with live reload...
if /i "%~1"=="fg" (
    bundle exec jekyll serve --baseurl "" --livereload --host 127.0.0.1
    exit /b
)

start cmd /k "cd /d "%~dp0" && bundle exec jekyll serve --baseurl "" --livereload --host 127.0.0.1"

echo Waiting for server to start...
set "PORT=4000"
set "TIMEOUT=30"
for /l %%i in (1,1,%TIMEOUT%) do (
    timeout /t 1 /nobreak >nul
    netstat -an | find ":%PORT% " | find "LISTENING" >nul && goto :ready
)
echo WARNING: Server not responding after %TIMEOUT% seconds. Opening browser anyway.

:ready
start http://127.0.0.1:4000/