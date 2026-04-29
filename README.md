# 📅 WA Scheduler

Sistema local para programar el envío de mensajes de WhatsApp. Funciona mediante automatización de WhatsApp Web — sin API oficial de Meta, sin cuenta Business.

Incluye una API REST, un bot conversacional en WhatsApp y una interfaz web para gestionar los mensajes programados.

---

## Características

- Programar mensajes para cualquier contacto con fecha y hora futura
- Bot conversacional en WhatsApp (escribite a vos mismo para operar)
- Interfaz web accesible desde el navegador en la misma red
- API REST para integración con otras herramientas
- Base de datos local SQLite — sin dependencias en la nube
- Compatible con Windows 10/11

---

## Stack

| Componente | Tecnología |
|---|---|
| Servidor | Node.js + Express |
| WhatsApp Web | whatsapp-web.js |
| Scheduler | node-cron |
| Base de datos | SQLite (sql.js) |
| Interfaz web | HTML + CSS + JS vanilla |

---

## Requisitos

- Windows 10 u 11
- Conexión a internet (para WhatsApp Web)
- Cuenta de WhatsApp activa en un celular

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/whatsapp-scheduler.git
cd whatsapp-scheduler
```
### 2. Instalar Node.js (solo si no lo tenés instalado)
Doble clic en `instalar_nodejs.bat`

El instalador:
- Verifica si Node.js  ya está instalado
- Si no está, lo descarga automáticamente (~25MB)
- Abre el instalador visual — seguir los pasos: **Next → Next → Install → Finish**

> Si ya tenés Node.js instalado podés saltear este paso.

### 3. Ejecutar el instalador principal (solo la primera vez)

Clic derecho en `instalar.bat` → **Ejecutar como administrador**

El instalador:
- Verifica Node.js
- Instala las dependencias del proyecto (puede tardar entre 5 y 15 minutos — no cerrar la ventana)
- Crea el archivo `.env`
- Configura el arranque automático con Windows

### 4. Primer arranque

Doble clic en `iniciar.bat`

Al arrancar por primera vez aparece un **código QR** en la consola. Escanealo desde WhatsApp en tu celular:

**WhatsApp → Dispositivos vinculados → Vincular dispositivo**

La sesión queda guardada localmente. En arranques siguientes no es necesario escanear el QR de nuevo.

---

## Uso

### Interfaz web

Abrí el navegador en:

```
http://localhost:3001
```

Desde ahí podés programar mensajes, ver pendientes, historial y cancelar envíos.

### Bot de WhatsApp

Escribite a **vos mismo** en WhatsApp y usá estos comandos:

| Comando | Descripción |
|---|---|
| `/agendar` | Iniciar flujo para programar un mensaje |
| `/pendientes` | Ver mensajes pendientes de envío |
| `/cancelar <id>` | Cancelar un mensaje programado |
| `/ayuda` | Mostrar el menú de comandos |

### API REST

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/messages` | Crear mensaje programado |
| `GET` | `/api/messages` | Listar todos los mensajes |
| `GET` | `/api/messages/pending` | Listar mensajes pendientes |
| `DELETE` | `/api/messages/:id` | Eliminar un mensaje |

**Ejemplo — programar un mensaje:**

```bash
curl -X POST http://localhost:3001/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5491112345678",
    "message": "Hola, recordatorio de reunión",
    "scheduledAt": "2025-12-31T09:00:00"
  }'
```

El campo `phone` debe incluir el código de país, sin `+` ni espacios.

---

## Estructura del proyecto

```
whatsapp-scheduler/
├── src/
│   ├── index.js          # Punto de entrada
│   ├── whatsapp.js       # Cliente WhatsApp Web
│   ├── bot.js            # Bot conversacional
│   ├── scheduler.js      # Cron job de envíos
│   ├── db.js             # Base de datos SQLite
│   └── routes/
│       └── messages.js   # Endpoints REST
├── public/
│   └── index.html        # Interfaz web
├── data/                 # Base de datos (auto-generado)
├── .wwebjs_auth/         # Sesión WhatsApp (auto-generado)
├── .env                  # Variables de entorno
├── instalar.bat          # Instalador para Windows
├── iniciar.bat           # Script de arranque
└── package.json
```

---

## Configuración

El archivo `.env` en la raíz del proyecto permite ajustar el entorno:

```env
PORT=3001
HOST=127.0.0.1
SESSION_SECRET=cadena-larga-y-random
STATE_DIR=./state
CHROME_BIN=
TRUST_PROXY=false
COOKIE_SECURE=false
ALLOW_LOCAL_WEB_SETUP=false
```

Variables relevantes:

- `HOST`: usar `0.0.0.0` si vas a entrar desde otra máquina por WireGuard o LAN
- `SESSION_SECRET`: obligatorio, mínimo 32 caracteres
- `STATE_DIR`: directorio persistente para `config.json`, DB, sesión de WhatsApp y uploads
- `CHROME_BIN`: ruta explícita al navegador Chromium/Chrome si hace falta
- `ALLOW_LOCAL_WEB_SETUP`: dejar `false` en entornos estables; usar `npm run setup-admin`

### Bootstrap de admin

La configuración inicial del panel se crea desde CLI:

```bash
npm run setup-admin
```

Esto guarda el usuario y un hash de contraseña dentro de `config.json` en `STATE_DIR`.

### Ubuntu Server + WireGuard

Despliegue recomendado para tu escenario:

1. Clonar el repo en el servidor
2. Crear `.env`
3. Crear un `STATE_DIR` persistente fuera del repo
4. Ejecutar `npm run setup-admin`
5. Vincular WhatsApp una vez con QR
6. Exponer el puerto solo por `wg0` con firewall
7. Ejecutar la app con `systemd`

Ejemplo de `.env`:

```env
PORT=3001
HOST=0.0.0.0
SESSION_SECRET=una-cadena-larga-y-random
STATE_DIR=/opt/whatsapp-scheduler/state
CHROME_BIN=/usr/bin/chromium-browser
TRUST_PROXY=false
COOKIE_SECURE=false
ALLOW_LOCAL_WEB_SETUP=false
```

Ejemplo de preparación:

```bash
sudo mkdir -p /opt/whatsapp-scheduler/state
sudo chown -R $USER:$USER /opt/whatsapp-scheduler/state
npm install
npm run setup-admin
npm start
```

Con la app validada, podés habilitar el servicio de `systemd` incluido en [deploy/systemd/whatsapp-scheduler.service](/home/pedrogariglio/backup-home/pedrogariglio/whatsapp-scheduler/deploy/systemd/whatsapp-scheduler.service:1).

Pasos típicos:

```bash
sudo cp deploy/systemd/whatsapp-scheduler.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-scheduler
sudo systemctl status whatsapp-scheduler
```

Notas del servicio:

- El unit file de ejemplo asume Node.js instalado con `nvm` en `/home/pedrogariglio/.nvm/...`
- Si tu `node` o `npm` viven en otra ruta, ajustá `Environment=PATH=...` y `ExecStart=...`
- Si `CHROME_BIN` apunta a un Chromium empaquetado como Snap, no uses `NoNewPrivileges=true` en el servicio porque bloquea `snap-confine`

Logs del servicio:

```bash
journalctl -u whatsapp-scheduler -f
```

---

## Notas de seguridad

- **No subas `.wwebjs_auth/`, `.env`, ni el contenido de `STATE_DIR` a ningún repositorio** — contienen sesión, configuración y datos sensibles.
- La app ahora exige login para el panel y rate limiting en autenticación, pero igual no conviene exponer el puerto 3001 a internet pública.
- Si usás WireGuard, permití el puerto solo sobre `wg0`.
- WhatsApp puede limitar cuentas que envían mensajes automatizados en alto volumen. Este sistema está pensado para uso ocasional y personal.

---

## Solución de problemas

**El QR no aparece o expiró**
Esperá — se genera uno nuevo automáticamente cada 20 segundos.

**"Autenticado" pero WhatsApp no está listo**
Esperá unos segundos más. El cliente necesita cargar WhatsApp Web completamente después de autenticarse.

**Sesión expirada o error de autenticación**
Borrá la carpeta `.wwebjs_auth/` y reiniciá para escanear el QR de nuevo.

**El mensaje figura como `failed`**
Verificá que el número de teléfono sea correcto (con código de país, sin `+` ni espacios) y que el destinatario tenga WhatsApp activo.

---

## Licencia

MIT
