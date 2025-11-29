@echo off
title Argus Watchdog Loop
color 0A

:loop
cls
echo =================================================
echo    ARGUS SYSTEM LAUNCHER - AUTO RESTART ON
echo    %date% %time%
echo =================================================

:: Запуск Python из вашего виртуального окружения
:: Убедитесь, что путь к python.exe верный!
:: Обычно это .venv\Scripts\python.exe относительно корня
".venv\Scripts\python.exe" inference_robust.py

:: Если скрипт завершился (сам или был убит Watchdog-ом), код пойдет дальше:
echo.
echo ⚠️ WARNING: Script crashed or exited!
echo 🔄 Restarting in 3 seconds...
timeout /t 3 >nul
goto loop
