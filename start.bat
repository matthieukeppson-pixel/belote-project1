@echo off
title Belote - Lancement complet

echo ======================================
echo   LANCEMENT DU BACKEND
echo ======================================
cd backend
start cmd /k "npm run dev"
cd ..
echo.

echo ======================================
echo   LANCEMENT DU FRONTEND
echo ======================================
cd frontend
start cmd /k "npm run dev"
cd ..
echo.

echo ======================================
echo        TOUT EST LANCE !
echo ======================================
pause
