@echo off
rem Windows：双击运行（等同于 PowerShell 执行 .\start.ps1）；可附加 -Dev 或 -Build
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause
