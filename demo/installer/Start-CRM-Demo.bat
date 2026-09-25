@echo off
cd /d "%~dp0"
start "CRM Demo Server" /min node\node.exe server.mjs
timeout /t 3 /nobreak >nul
start http://localhost:3000
