@echo off
title Instalando Node.js

echo.
echo ==========================================
echo      Instalacion de Node.js
echo ==========================================
echo.

node --version >nul 2>&1
if %errorLevel% equ 0 (
    for /f "tokens=*" %%v in ('node --version') do echo Node.js %%v ya esta instalado.
    echo Podes cerrar esta ventana y ejecutar instalar.bat
    pause
    exit /b 0
)

echo Node.js no encontrado. Descargando...
echo Esto puede tardar varios minutos segun tu conexion.
echo.

curl.exe -L --progress-bar -o "%TEMP%\node_installer.msi" "https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi"

if %errorLevel% neq 0 (
    echo.
    echo [ERROR] No se pudo descargar Node.js.
    echo.
    echo Descargalo manualmente desde:
    echo https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi
    echo.
    echo Instalalo y luego ejecuta instalar.bat
    pause
    exit /b 1
)

echo.
echo Descarga completada. Abriendo instalador...
echo Sigue los pasos: Next - Next - Install - Finish
echo.

:: /wait hace que el .bat espere hasta que el usuario termine la instalacion
start /wait msiexec /i "%TEMP%\node_installer.msi"

echo.
echo Instalacion finalizada.
echo.
echo Ahora ejecuta "instalar.bat" como administrador para continuar.
echo.
pause
