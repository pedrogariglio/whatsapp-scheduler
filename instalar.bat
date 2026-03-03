@echo off
chcp 65001 >nul
title WA Scheduler - Instalación

echo.
echo ╔══════════════════════════════════════╗
echo ║      WA Scheduler - Instalador       ║
echo ╚══════════════════════════════════════╝
echo.

:: ── Verificar si se ejecuta como administrador ──
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Este script requiere permisos de administrador.
    echo     Cerrá esta ventana y ejecutá "instalar.bat" con
    echo     clic derecho → "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

:: ── Verificar Node.js ──
echo [1/4] Verificando Node.js...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo      Node.js no encontrado. Descargando instalador...
    echo      Esto puede tardar unos minutos.
    echo.

    :: Descargar Node.js LTS con PowerShell
    powershell -Command "& { Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile '%TEMP%\node_installer.msi' }"

    if %errorLevel% neq 0 (
        echo [ERROR] No se pudo descargar Node.js.
        echo         Verificá tu conexión a internet e intentá de nuevo.
        pause
        exit /b 1
    )

    echo      Instalando Node.js...
    msiexec /i "%TEMP%\node_installer.msi" /qn /norestart

    :: Recargar PATH
    call RefreshEnv.cmd >nul 2>&1
    set "PATH=%PATH%;%ProgramFiles%\nodejs"

    node --version >nul 2>&1
    if %errorLevel% neq 0 (
        echo [ERROR] La instalación de Node.js falló o requiere reiniciar.
        echo         Reiniciá la PC y volvé a ejecutar este instalador.
        pause
        exit /b 1
    )
    echo      Node.js instalado correctamente.
) else (
    for /f "tokens=*" %%v in ('node --version') do echo      Node.js %%v ya instalado. OK
)

:: ── Instalar dependencias npm ──
echo.
echo [2/4] Instalando dependencias...
echo      (la primera vez puede tardar varios minutos)
echo.
cd /d "%~dp0"
call npm install --loglevel=error
if %errorLevel% neq 0 (
    echo [ERROR] Falló la instalación de dependencias.
    echo         Verificá tu conexión a internet e intentá de nuevo.
    pause
    exit /b 1
)
echo      Dependencias instaladas. OK

:: ── Crear archivo .env si no existe ──
echo.
echo [3/4] Configurando entorno...
if not exist ".env" (
    echo PORT=3001 > .env
    echo      Archivo .env creado con puerto 3001.
) else (
    echo      Archivo .env ya existe. OK
)

:: ── Crear script VBS para arranque sin ventana ──
echo.
echo [4/4] Configurando inicio automático con Windows...

:: Crear iniciar_silent.vbs que lanza el servidor sin ventana
set "VBS_PATH=%~dp0iniciar_silent.vbs"
set "BAT_PATH=%~dp0iniciar.bat"

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_PATH%"
echo WshShell.Run """%BAT_PATH%""", 0, False >> "%VBS_PATH%"

:: Registrar en inicio de Windows (carpeta Startup del usuario actual)
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy "%VBS_PATH%" "%STARTUP%\wa-scheduler.vbs" >nul

echo      Inicio automático configurado. OK

:: ── Finalizar ──
echo.
echo ╔══════════════════════════════════════╗
echo ║        Instalación completada        ║
echo ║                                      ║
echo ║  El sistema arrancará solo cuando    ║
echo ║  iniciés Windows.                    ║
echo ║                                      ║
echo ║  Para arrancarlo ahora:              ║
echo ║  → Doble clic en "iniciar.bat"       ║
echo ╚══════════════════════════════════════╝
echo.
echo Presioná cualquier tecla para cerrar...
pause >nul
