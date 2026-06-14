@echo off
title VideoForge
cd /d "%~dp0"

if not exist node_modules (
  echo Primera vez: instalando dependencias, esto puede tardar un poco...
  call npm install
)

echo.
echo  VideoForge se esta iniciando y se abrira en el navegador.
echo  Deja esta ventana abierta mientras lo uses; cierrala para detener la app.
echo.

REM Abre el navegador (en segundo plano) cuando el servidor este listo
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\open-when-ready.ps1"

REM Servidor en primer plano: al cerrar esta ventana se detiene la app
call npm run dev
