@echo off
chcp 65001 >nul

:: Moverse a la carpeta del proyecto (donde está este .bat)
cd /d "%~dp0"

:: Verificar que Node.js esté disponible
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js no encontrado.
    echo         Ejecutá primero "instalar.bat" como administrador.
    pause
    exit /b 1
)

:: Verificar que las dependencias estén instaladas
if not exist "node_modules" (
    echo [!] Dependencias no instaladas. Instalando...
    call npm install --loglevel=error
)

:: Iniciar el servidor
node src/index.js
