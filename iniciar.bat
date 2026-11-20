@echo off
start "" http://localhost:8420
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1"
