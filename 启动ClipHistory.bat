@echo off
rem ClipHistory 开发模式一键启动
cd /d "%~dp0"
start "ClipHistory" /min npm run dev
exit
