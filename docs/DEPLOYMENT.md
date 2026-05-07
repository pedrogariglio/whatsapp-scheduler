# Deployment - WhatsApp Scheduler

Guia de despliegue para operar WhatsApp Scheduler en Ubuntu Server headless, con acceso privado por WireGuard, estado persistente en `STATE_DIR`, servicio principal con `systemd` y backups automaticos.

## Alcance
- Entorno objetivo: Ubuntu Server headless.
- Acceso al panel: privado por WireGuard, no expuesto publicamente.
- Runtime: Node.js + Express + `whatsapp-web.js` + Chromium headless.
- Persistencia: `STATE_DIR` fuera del repo.
- Operacion: `systemd` para app y `systemd timer` para backups.

## Arquitectura

| Componente | Descripcion |
|---|---|
| `src/index.js` | Servidor Express, login, health check, API y arranque del scheduler/WhatsApp. |
| `src/whatsapp.js` | Cliente `whatsapp-web.js`, Chromium headless, sesion persistente y watchdog de `ready`. |
| `src/scheduler.js` | Despachador resiliente de mensajes programados y retries persistidos. |
| `src/db.js` | DB local SQLite via `sql.js`, almacenada en `STATE_DIR/data/scheduler.db`. |
| `src/routes/messages.js` | API de mensajes y manejo endurecido de uploads. |
| `scripts/setup-admin.js` | Bootstrap de usuario admin por CLI. |
| `scripts/backup-state.js` | Backup de `STATE_DIR` a `.tar.gz` con checksum `.sha256`. |
| `deploy/systemd/` | Unit files para app y backups. |

## Estado Persistente

`STATE_DIR` contiene el estado operativo y sensible. En produccion debe vivir fuera del repo.

Ruta validada:

```bash
/opt/whatsapp-scheduler/state
```

Contenido esperado:

| Ruta | Uso |
|---|---|
| `config.json` | Configuracion de admin con `passwordHash`. |
| `data/scheduler.db` | DB local de mensajes. |
| `data/contacts-cache.json` | Cache de contactos. |
| `.wwebjs_auth/` | Sesion persistente de WhatsApp Web. |
| `uploads/` | Adjuntos pendientes de envio. |

No borrar `STATE_DIR` salvo que se quiera resetear completamente la instalacion. Borrar `.wwebjs_auth/` fuerza reenrolamiento por QR.

## Requisitos

- Ubuntu Server con acceso SSH.
- WireGuard operativo entre workstation y servidor.
- Node.js disponible para el usuario de servicio.
- Chromium/Chrome instalado y ejecutable en modo headless.
- Cuenta de WhatsApp activa en un celular.
- Repo clonado en:

```bash
/home/pedrogariglio/whatsapp-scheduler
```

El despliegue validado usa `nvm` y Node en:

```bash
/home/pedrogariglio/.nvm/versions/node/v20.20.2/bin
```

Si la ruta cambia, actualizar los unit files antes de copiarlos a `/etc/systemd/system/`.

## Variables de Entorno

Crear `.env` en la raiz del repo:

```env
PORT=3001
HOST=0.0.0.0
SESSION_SECRET=change-me-with-a-long-random-string-of-at-least-32-chars
STATE_DIR=/opt/whatsapp-scheduler/state
CHROME_BIN=/usr/bin/chromium-browser
TRUST_PROXY=false
COOKIE_SECURE=false
ALLOW_LOCAL_WEB_SETUP=false
```

Variables relevantes:

| Variable | Valor recomendado | Descripcion |
|---|---|---|
| `PORT` | `3001` | Puerto HTTP del panel/API. |
| `HOST` | `0.0.0.0` | Necesario para acceso por WireGuard. |
| `SESSION_SECRET` | secreto largo | Obligatorio, minimo 32 caracteres. |
| `STATE_DIR` | `/opt/whatsapp-scheduler/state` | Estado persistente fuera del repo. |
| `CHROME_BIN` | `/usr/bin/chromium-browser` | Ruta del navegador headless. |
| `TRUST_PROXY` | `false` | Mantener `false` si no hay reverse proxy. |
| `COOKIE_SECURE` | `false` | Usar `true` solo con HTTPS. |
| `ALLOW_LOCAL_WEB_SETUP` | `false` | Setup web deshabilitado en produccion. |

## Preparacion Inicial

Desde el servidor:

```bash
cd /home/pedrogariglio/whatsapp-scheduler
npm install
```

Crear directorios persistentes:

```bash
sudo mkdir -p /opt/whatsapp-scheduler/state
sudo mkdir -p /opt/whatsapp-scheduler/backups
sudo chown -R pedrogariglio:pedrogariglio /opt/whatsapp-scheduler
chmod 700 /opt/whatsapp-scheduler/state /opt/whatsapp-scheduler/backups
```

Proteger `.env`:

```bash
chmod 600 .env
```

Crear admin:

```bash
npm run setup-admin
```

Esto guarda `config.json` en `STATE_DIR` con hash `scrypt`, no contrasena plana.

## Primer Arranque Manual

Antes de habilitar `systemd`, validar manualmente:

```bash
npm start
```

En el primer arranque, escanear el QR desde WhatsApp:

```text
WhatsApp > Dispositivos vinculados > Vincular dispositivo
```

Esperar logs equivalentes a:

```text
Autenticado correctamente. Sesion guardada.
WhatsApp Web listo para enviar mensajes.
Servidor corriendo en http://0.0.0.0:3001
```

Luego validar desde workstation por WireGuard:

```text
http://10.0.0.1:3001/
```

## WireGuard y Firewall

El panel debe quedar accesible solo por la interfaz WireGuard.

Regla validada:

```bash
sudo ufw allow in on wg0 to any port 3001 proto tcp
```

Verificar reglas:

```bash
sudo ufw status verbose
```

No abrir `3001/tcp` en interfaces publicas.

## systemd - Servicio Principal

Unit file incluido:

```bash
deploy/systemd/whatsapp-scheduler.service
```

Copiar y habilitar:

```bash
sudo cp deploy/systemd/whatsapp-scheduler.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-scheduler.service
```

Validar:

```bash
systemctl status whatsapp-scheduler
journalctl -u whatsapp-scheduler -n 150 --no-pager
```

Operacion diaria:

```bash
sudo systemctl restart whatsapp-scheduler
sudo systemctl stop whatsapp-scheduler
sudo systemctl start whatsapp-scheduler
```

Notas del unit actual:

- Usa `EnvironmentFile=/home/pedrogariglio/whatsapp-scheduler/.env`.
- Usa `PATH` explicito para `nvm`.
- Usa `Restart=always`.
- Mantiene `ProtectSystem=full`.
- Permite escritura en repo y `STATE_DIR` con `ReadWritePaths`.
- No usa `NoNewPrivileges=true` por incompatibilidad observada con Chromium via Snap.

## Backups

El backup operativo esta documentado en `docs/BACKUP.md`.

Crear backup manual:

```bash
npm run backup:state
```

Validar checksums:

```bash
cd /opt/whatsapp-scheduler/backups
sha256sum -c whatsapp-scheduler-state-*.sha256
```

Resultado esperado:

```text
whatsapp-scheduler-state-...tar.gz: OK
```

## systemd - Backup Timer

Unit files incluidos:

```bash
deploy/systemd/whatsapp-scheduler-backup.service
deploy/systemd/whatsapp-scheduler-backup.timer
```

Instalar:

```bash
sudo cp deploy/systemd/whatsapp-scheduler-backup.service /etc/systemd/system/
sudo cp deploy/systemd/whatsapp-scheduler-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-scheduler-backup.timer
```

Validar timer:

```bash
systemctl status whatsapp-scheduler-backup.timer
systemctl list-timers whatsapp-scheduler-backup.timer
```

Probar ejecucion manual:

```bash
sudo systemctl start whatsapp-scheduler-backup.service
sudo systemctl status whatsapp-scheduler-backup.service
journalctl -u whatsapp-scheduler-backup.service -n 100 --no-pager
```

El timer validado corre diariamente a:

```text
03:15 UTC
```

## Validacion Post-Deploy

Checklist minima:

- [ ] `systemctl status whatsapp-scheduler` muestra `active (running)`.
- [ ] Logs muestran servidor escuchando en `0.0.0.0:3001`.
- [ ] Logs muestran WhatsApp autenticado.
- [ ] Logs muestran `WhatsApp Web listo para enviar mensajes`.
- [ ] Panel abre desde workstation en `http://10.0.0.1:3001/`.
- [ ] Login del panel funciona.
- [ ] Testigo del panel esta verde.
- [ ] Mensaje de prueba se envia y queda en `Sent`.
- [ ] `whatsapp-scheduler-backup.timer` esta `enabled` y `active (waiting)`.
- [ ] Backup manual genera `.tar.gz` y `.sha256`.
- [ ] `sha256sum -c` devuelve `OK`.

## Validacion Post-Reboot

Ejecutar:

```bash
sudo reboot
```

Al volver:

```bash
systemctl status whatsapp-scheduler
journalctl -u whatsapp-scheduler -n 150 --no-pager
systemctl status whatsapp-scheduler-backup.timer
systemctl list-timers whatsapp-scheduler-backup.timer
```

Validaciones ya realizadas en produccion:

- Servicio principal levanto automaticamente tras reboot.
- WhatsApp autentico sin pedir nuevo QR.
- Watchdog recupero un stall `authenticated -> ready`.
- Panel accesible por WireGuard en `http://10.0.0.1:3001/`.
- Testigo verde.
- Mensaje post-reboot enviado correctamente.
- Timer de backup activo tras reboot.

## Health Check

Endpoint:

```text
GET /health
```

Ejemplo:

```bash
curl http://10.0.0.1:3001/health
```

Si no hay sesion autenticada del panel, la app puede devolver `401` por middleware de auth. Para monitoreo futuro conviene evaluar un health check operacional especifico o autenticado.

## Operacion y Mantenimiento

Ver logs:

```bash
journalctl -u whatsapp-scheduler -f
journalctl -u whatsapp-scheduler -n 150 --no-pager
```

Ver backups:

```bash
ls -lh /opt/whatsapp-scheduler/backups
```

Ver estado de timers:

```bash
systemctl list-timers whatsapp-scheduler-backup.timer
```

Actualizar despliegue:

```bash
cd /home/pedrogariglio/whatsapp-scheduler
git pull
npm install
sudo systemctl restart whatsapp-scheduler
```

Si hubo cambios en unit files:

```bash
sudo cp deploy/systemd/whatsapp-scheduler.service /etc/systemd/system/
sudo cp deploy/systemd/whatsapp-scheduler-backup.service /etc/systemd/system/
sudo cp deploy/systemd/whatsapp-scheduler-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart whatsapp-scheduler
sudo systemctl restart whatsapp-scheduler-backup.timer
```

## Restore

Procedimiento completo en `docs/BACKUP.md`.

Resumen:

```bash
sudo systemctl stop whatsapp-scheduler
sudo mv /opt/whatsapp-scheduler/state /opt/whatsapp-scheduler/state.before-restore
sudo mkdir -p /opt/whatsapp-scheduler/state
sudo tar -xzf /opt/whatsapp-scheduler/backups/whatsapp-scheduler-state-YYYY-MM-DDTHH-MM-SS-msZ.tar.gz -C /opt/whatsapp-scheduler/state
sudo chown -R pedrogariglio:pedrogariglio /opt/whatsapp-scheduler/state
sudo systemctl start whatsapp-scheduler
```

Despues del restore, validar panel, WhatsApp `ready`, mensajes pendientes y envio de prueba.

## Troubleshooting

### Chromium Snap falla al iniciar

Sintomas observados:

```text
xdg-settings: not found
not a snap cgroup for tag snap.chromium.chromium
```

Estado actual:

- El problema no bloqueo produccion.
- El watchdog recupero el cliente y llego a `ready`.
- Queda como hardening pendiente evaluar Chromium/Chrome no dependiente de Snap o resolver dependencias de entorno.

Acciones:

```bash
journalctl -u whatsapp-scheduler -n 150 --no-pager
systemctl restart whatsapp-scheduler
```

### WhatsApp queda autenticado pero no llega a ready

El cliente tiene watchdog de `ready`. Esperar el reintento controlado.

Logs esperados en recuperacion:

```text
WhatsApp quedo autenticado pero no listo tras 90s
Reinicializando cliente WhatsApp (ready-timeout)
WhatsApp Web listo para enviar mensajes
```

Si supera los reintentos, reiniciar servicio:

```bash
sudo systemctl restart whatsapp-scheduler
```

Si persiste, evaluar reenrolamiento borrando `.wwebjs_auth/` dentro de `STATE_DIR`.

### El panel no responde desde workstation

Verificar:

```bash
systemctl status whatsapp-scheduler
sudo ufw status verbose
ip addr show wg0
```

Confirmar:

- `HOST=0.0.0.0`.
- Puerto `3001/tcp` permitido solo por `wg0`.
- Workstation conectada a WireGuard.
- URL correcta: `http://10.0.0.1:3001/`.

### Backup falla

Verificar:

```bash
systemctl status whatsapp-scheduler-backup.service
journalctl -u whatsapp-scheduler-backup.service -n 100 --no-pager
ls -ld /opt/whatsapp-scheduler/state /opt/whatsapp-scheduler/backups
```

Confirmar:

- `STATE_DIR` existe.
- `BACKUP_DIR` no esta dentro de `STATE_DIR`.
- El usuario `pedrogariglio` puede leer `STATE_DIR` y escribir backups.

## Seguridad y Hardening Pendiente

Ya validado:

- Login con hash `scrypt`.
- `SESSION_SECRET` por entorno.
- Setup web deshabilitado por defecto.
- Rate limiting en login.
- `helmet`.
- `STATE_DIR` fuera del repo.
- Backups fuera del repo con permisos restrictivos.
- Puerto expuesto solo por WireGuard.

Pendiente recomendado:

- Definir retencion y rotacion de backups.
- Probar restore completo en entorno limpio.
- Revisar permisos finales de `.env`, `STATE_DIR` y backups.
- Confirmar periodicamente `ALLOW_LOCAL_WEB_SETUP=false`.
- Evaluar Chromium/Chrome no dependiente de Snap.
- Agregar monitoreo liviano para WhatsApp `ready`, retries vencidos, crecimiento de `STATE_DIR` y reinicios de `systemd`.
- Evaluar migracion de `sql.js` a `better-sqlite3`.
