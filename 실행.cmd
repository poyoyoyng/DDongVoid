@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
if exist "artifacts\release\package\DDongVoid.exe" goto launch
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Publish-Release.ps1" -SkipTests
if errorlevel 1 goto build_failed
:launch
start "" "%~dp0artifacts\release\package\DDongVoid.exe"
set "launch_result=%errorlevel%"
popd
exit /b %launch_result%
:build_failed
echo Build failed. Please check that .NET 10 SDK is installed.
pause
popd
exit /b 1
