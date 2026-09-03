@echo off
chcp 65001 >nul
title 432统计学学习驾驶舱
cd /d "%~dp0"
echo 正在启动 432 统计学学习驾驶舱...
start "" http://localhost:3000
python backend\app.py
pause
