# Multi-instance deployment

## Decision

Para que otra persona use la aplicacion, el modelo elegido es **una instancia aislada por persona**.

Cada instancia tiene:

- su propio numero de WhatsApp y sesion `.wwebjs_auth`;
- su propio `STATE_DIR`;
- su propio puerto del panel;
- sus propios backups;
- su propio `SESSION_SECRET` y `HEALTH_TOKEN`;
- su propio contenedor y proyecto Docker.

No se comparten perfiles de Chromium ni sesiones de WhatsApp entre instancias. Tampoco se debe correr mas de un cliente sobre el mismo perfil.

Esta decision evita convertir la app en un monolito multi-tenant y encaja mejor con una futura migracion a Proxmox, VLANs y nodos separados.

## Variables de compose

`compose.yml` ahora acepta estas variables:

| Variable | Default | Uso |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `whatsapp-scheduler` | Nombre del proyecto Docker. Evita colisiones entre instancias. |
| `INSTANCE_NAME` | `whatsapp-scheduler` | `container_name` y `hostname`. |
| `STATE_DIR_HOST` | `/opt/whatsapp-scheduler/state` | Ruta host del estado persistente. |
| `ENV_FILE` | `.env` | Archivo de variables de la instancia. |
| `PANEL_BIND` | `0.0.0.0` | IP host donde se publica el panel. |
| `PORT` | `3001` | Puerto host del panel. El contenedor sigue escuchando en `3001`. |

## Ejemplo: instancia actual y nueva instancia

Instancia actual:

```text
Proyecto:  whatsapp-scheduler
Estado:    /opt/whatsapp-scheduler/state
Backups:   /opt/whatsapp-scheduler/backups
Env:       .env
Panel:     10.0.0.1:3001
```

Nueva instancia:

```text
Proyecto:  whatsapp-scheduler-<nombre>
Estado:    /opt/whatsapp-scheduler/<nombre>/state
Backups:   /opt/whatsapp-scheduler/<nombre>/backups
Env:       .env.<nombre>
Panel:     10.0.0.1:3002
```

## Crear una instancia nueva

1. Crear directorios:

```bash
sudo mkdir -p /opt/whatsapp-scheduler/<nombre>/state
sudo mkdir -p /opt/whatsapp-scheduler/<nombre>/backups
sudo chown -R pedrogariglio:pedrogariglio /opt/whatsapp-scheduler/<nombre>
chmod 700 /opt/whatsapp-scheduler/<nombre>/state /opt/whatsapp-scheduler/<nombre>/backups
```

2. Crear `.env.<nombre>` a partir de `.env` y cambiar como minimo:

```env
SESSION_SECRET=<secreto-nuevo-de-32-o-mas-caracteres>
HEALTH_TOKEN=<token-nuevo>
STATE_DIR=/opt/whatsapp-scheduler/<nombre>/state
PANEL_BIND=10.0.0.1
PORT=3002
ALLOW_LOCAL_WEB_SETUP=false
```

3. Levantar la instancia:

```bash
cd ~/whatsapp-scheduler
COMPOSE_PROJECT_NAME=whatsapp-scheduler-<nombre> \
INSTANCE_NAME=whatsapp-scheduler-<nombre> \
STATE_DIR_HOST=/opt/whatsapp-scheduler/<nombre>/state \
ENV_FILE=.env.<nombre> \
PORT=3002 \
PANEL_BIND=10.0.0.1 \
docker compose up -d --build
```

4. Seguir logs y escanear el QR:

```bash
COMPOSE_PROJECT_NAME=whatsapp-scheduler-<nombre> docker compose logs -f whatsapp-scheduler
```

5. Crear el admin del panel:

```bash
COMPOSE_PROJECT_NAME=whatsapp-scheduler-<nombre> \
docker compose exec whatsapp-scheduler npm run setup-admin
```

6. Validar salud:

```bash
curl -H "X-Health-Token: <token>" \
  http://10.0.0.1:3002/internal/health
```

## Backups por instancia

El unit actual de backup apunta a la instancia principal. Para una instancia nueva, duplicar los units con otro nombre y ajustar:

- `EnvironmentFile=/home/pedrogariglio/whatsapp-scheduler/.env.<nombre>`
- `Environment=BACKUP_DIR=/opt/whatsapp-scheduler/<nombre>/backups`
- `ReadWritePaths=/opt/whatsapp-scheduler/<nombre>/state /opt/whatsapp-scheduler/<nombre>/backups`

No mezclar backups entre instancias.

## Monitoreo por instancia

Duplicar `whatsapp-scheduler-health.service` y `.timer` con otro nombre y ajustar:

- `EnvironmentFile=/home/pedrogariglio/whatsapp-scheduler/.env.<nombre>`
- `Environment=HEALTH_URL=http://10.0.0.1:3002/internal/health`
- `ReadWritePaths=/opt/whatsapp-scheduler/<nombre>/state`

Cada instancia debe tener su propio `HEALTH_TOKEN` y su propio archivo `health-monitor-state.json` dentro de su `STATE_DIR`.

## Proxmox y red

Fases sugeridas:

1. Mantener las instancias en el servidor actual mientras sean pocas.
2. Segmentar la red con el switch L2:
   - VLAN de servidores.
   - VLAN de confianza para workstation/celulares.
   - VLAN separada para IoT.
3. Mover cada instancia a un contenedor/VM de Proxmox cuando la cantidad o el aislamiento lo justifiquen.
4. Publicar el panel solo por WireGuard o por un reverse proxy interno con TLS.
5. Evaluar Caddy/Traefik para nombres internos por instancia, por ejemplo:
   - `scheduler.example.internal`
   - `<nombre>.scheduler.example.internal`

## Requisitos operativos

- Una sesion de WhatsApp por instancia.
- Un `SESSION_SECRET` distinto por instancia.
- Un `HEALTH_TOKEN` distinto por instancia.
- Un `STATE_DIR` distinto por instancia.
- Un puerto host distinto por instancia.
- Un backup distinto por instancia.
- No ejecutar dos clientes sobre el mismo `.wwebjs_auth`.
- No restaurar un backup de una instancia sobre otra.

## Checklist de madurez

- [ ] Plantilla de `.env.<nombre>` documentada.
- [ ] Units de backup y health parametrizados o duplicados por instancia.
- [ ] Reverse proxy interno con TLS.
- [ ] VLANs definidas en el switch L2.
- [ ] Plan de migracion a Proxmox.
- [ ] Limites de memoria por instancia.
- [ ] Monitoreo centralizado de todas las instancias.
- [ ] Procedimiento de alta/baja de una persona.
