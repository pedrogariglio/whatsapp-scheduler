@echo off
title WA Scheduler
cd /d "%~dp0"

node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js no encontrado.
    echo         Ejecuta primero "instalar.bat" como administrador.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Instalando dependencias...
    call npm install --loglevel=error
)

:: Cerrar cualquier instancia previa en el puerto 3001
echo Verificando puerto 3001...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo Cerrando instancia previa PID %%a...
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 /nobreak >nul

echo.
echo WA Scheduler iniciando...
echo Abre tu navegador en: http://localhost:3001
echo Para detener el servidor, cierra esta ventana.
echo.
node src/index.js
pause
