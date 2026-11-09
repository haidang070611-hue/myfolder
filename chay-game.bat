@echo off
chcp 65001 >nul
title Phone Party Arcade
cd /d "%~dp0"
where node >nul 2>nul || (echo Chua cai Node.js. Tai ban LTS tai https://nodejs.org roi chay lai file nay. & pause & exit /b)
echo Dang khoi dong game... (de nguyen cua so nay trong luc choi)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
node server.js
pause
