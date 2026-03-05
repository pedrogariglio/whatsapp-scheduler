@echo off
title WA Scheduler - Instalacion

echo.
echo ==========================================
echo      WA Scheduler - Instalador
echo ==========================================
echo.

:: Verificar si se ejecuta como administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Este script requiere permisos de administrador.
    echo     Cerralo y ejecuta "instalar.bat" con
    echo     clic derecho - "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

:: Verificar Node.js
echo [1/4] Verificando Node.js...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo      Node.js no encontrado.
    echo      Ejecuta primero "instalar_nodejs.bat" y luego
    echo      vuelve a ejecutar este instalador.
    echo.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%v in ('node --version') do echo      Node.js %%v ya instalado. OK
)

:: Instalar dependencias npm
echo.
echo [2/4] Instalando dependencias...
echo.
echo      IMPORTANTE: Este paso puede tardar entre 5 y 15 minutos.
echo      Se esta descargando el navegador interno (Chromium ~170MB).
echo      No cierres esta ventana aunque parezca que no hace nada.
echo.
cd /d "%~dp0"
call npm install
if %errorLevel% neq 0 (
    echo.
    echo [ERROR] Fallo la instalacion de dependencias.
    echo         Verifica tu conexion a internet e intenta de nuevo.
    pause
    exit /b 1
)
echo.
echo      Dependencias instaladas. OK

:: Eliminar sesion anterior si existe (evita conflictos al vincular)
echo.
echo [3/4] Configurando entorno...
if not exist ".env" (
    echo PORT=3001 > .env
    echo      Archivo .env creado. OK
) else (
    echo      Archivo .env ya existe. OK
)

if exist ".wwebjs_auth" (
    rmdir /s /q ".wwebjs_auth"
    echo      Sesion anterior eliminada para evitar conflictos. OK
)

:: Configurar inicio automatico con Windows
echo.
echo [4/4] Configurando inicio automatico...

set "VBS_PATH=%~dp0iniciar_silent.vbs"
set "BAT_PATH=%~dp0iniciar.bat"

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_PATH%"
echo WshShell.Run """%BAT_PATH%""", 0, False >> "%VBS_PATH%"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy "%VBS_PATH%" "%STARTUP%\wa-scheduler.vbs" >nul

echo      Inicio automatico configurado. OK

:: Finalizar
echo.
echo ==========================================
echo        Instalacion completada
echo.
echo  Ahora ejecuta "iniciar.bat" para arrancar
echo  el sistema y escanear el codigo QR.
echo ==========================================
echo.
pause
