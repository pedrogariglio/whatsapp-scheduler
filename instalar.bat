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
    echo      Node.js no encontrado. Descargando...
    echo      Esto puede tardar varios minutos.
    echo.

    :: Intentar descarga con curl.exe (incluido en Windows 10/11)
    curl.exe -L -o "%TEMP%\node_installer.msi" "https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi"

    if %errorLevel% neq 0 (
        echo.
        echo [ERROR] No se pudo descargar Node.js automaticamente.
        echo.
        echo  Descargalo manualmente desde:
        echo  https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi
        echo.
        echo  Instalalo y luego vuelve a ejecutar este instalador.
        pause
        exit /b 1
    )

    echo      Instalando Node.js...
    msiexec /i "%TEMP%\node_installer.msi" /qn /norestart

    :: Actualizar PATH para la sesion actual
    set "PATH=%PATH%;%ProgramFiles%\nodejs"

    node --version >nul 2>&1
    if %errorLevel% neq 0 (
        echo.
        echo      Node.js instalado correctamente.
        echo      Es necesario reiniciar la PC para continuar.
        echo      Reinicia y vuelve a ejecutar este instalador.
        echo.
        pause
        exit /b 1
    )
    echo      Node.js instalado correctamente.
) else (
    for /f "tokens=*" %%v in ('node --version') do echo      Node.js %%v ya instalado. OK
)

:: Instalar dependencias npm
echo.
echo [2/4] Instalando dependencias...
echo      La primera vez puede tardar varios minutos.
echo.
cd /d "%~dp0"
call npm install --loglevel=error
if %errorLevel% neq 0 (
    echo.
    echo [ERROR] Fallo la instalacion de dependencias.
    echo         Verifica tu conexion a internet e intenta de nuevo.
    pause
    exit /b 1
)
echo      Dependencias instaladas. OK

:: Crear archivo .env si no existe
echo.
echo [3/4] Configurando entorno...
if not exist ".env" (
    echo PORT=3001 > .env
    echo      Archivo .env creado. OK
) else (
    echo      Archivo .env ya existe. OK
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
echo  El sistema arrancara automaticamente
echo  cuando inicies Windows.
echo.
echo  Para arrancarlo ahora:
echo  - Doble clic en "iniciar.bat"
echo ==========================================
echo.
pause
