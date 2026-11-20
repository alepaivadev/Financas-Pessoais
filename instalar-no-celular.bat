@echo off
cd /d "%~dp0"
echo Gerando o APK...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0android\build.ps1" > "%~dp0gerar-apk.log" 2>&1
if errorlevel 1 (
  echo Erro ao gerar o APK. Veja gerar-apk.log
  pause
  exit /b 1
)
echo Instalando no celular...
"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" install -r "%~dp0Financas.apk"
pause
