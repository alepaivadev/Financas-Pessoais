@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0android\build.ps1" > "%~dp0gerar-apk.log" 2>&1
echo Codigo de saida: %ERRORLEVEL% >> "%~dp0gerar-apk.log"
