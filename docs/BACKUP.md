# Backup and Restore - WhatsApp Scheduler

## Alcance
- `STATE_DIR` contiene el estado operativo: `config.json`, DB, sesion de WhatsApp, uploads pendientes y cache funcional.
- Los backups se guardan fuera de `STATE_DIR`.
- Cada backup genera un `.tar.gz` y un `.sha256`.
- Se excluyen dependencias, metadatos de git, cache de navegador y archivos regenerables.

## Crear backup
```bash
npm run backup:state
```

Variables opcionales:
```bash
STATE_DIR=/opt/whatsapp-scheduler/state BACKUP_DIR=/opt/whatsapp-scheduler/backups npm run backup:state
```

En produccion, usar los valores reales definidos en `.env` o exportarlos desde el entorno del servicio.

## Retencion y rotacion
La politica por defecto conserva backups por `30` dias y mantiene siempre al menos los `7` backups mas recientes, aunque sean mas antiguos que 30 dias.

Variables configurables:
```bash
BACKUP_RETENTION_DAYS=30
BACKUP_RETENTION_MIN_COUNT=7
```

La rotacion corre despues de crear y checksummear correctamente el backup nuevo. Solo elimina archivos generados por este script con nombre `whatsapp-scheduler-state-*.tar.gz` y su `.sha256` asociado.

Para deshabilitar el borrado por antiguedad:
```bash
BACKUP_RETENTION_DAYS=0 npm run backup:state
```

## Verificar integridad
```bash
cd /opt/whatsapp-scheduler/backups
sha256sum -c whatsapp-scheduler-state-YYYY-MM-DDTHH-MM-SS-msZ.tar.gz.sha256
```

## Restaurar backup
1. Detener el servicio:
```bash
sudo systemctl stop whatsapp-scheduler-docker.service
```

2. Preservar el estado actual antes de sobrescribir:
```bash
sudo mv /opt/whatsapp-scheduler/state /opt/whatsapp-scheduler/state.before-restore
sudo mkdir -p /opt/whatsapp-scheduler/state
sudo chown -R pedrogariglio:pedrogariglio /opt/whatsapp-scheduler/state
```

3. Extraer el backup:
```bash
sudo tar -xzf /opt/whatsapp-scheduler/backups/whatsapp-scheduler-state-YYYY-MM-DDTHH-MM-SS-msZ.tar.gz -C /opt/whatsapp-scheduler/state
sudo chown -R pedrogariglio:pedrogariglio /opt/whatsapp-scheduler/state
```

4. Reiniciar y validar:
```bash
sudo systemctl start whatsapp-scheduler-docker.service
sudo systemctl status whatsapp-scheduler-docker.service
journalctl -u whatsapp-scheduler-docker.service -n 100 --no-pager
```

## Validacion post-restore
- Confirmar que el panel responde por WireGuard.
- Confirmar login correcto.
- Confirmar que WhatsApp llega a `ready` sin nuevo QR.
- Confirmar que mensajes pendientes y retries aparecen en la UI/API.
- Programar un mensaje de prueba y verificar estado `Sent`.

## Automatizacion pendiente
- Instalar y habilitar los unit files incluidos en `deploy/systemd/`.
- Probar restore completo en entorno limpio.

## systemd timer
Copiar los unit files:
```bash
sudo cp deploy/systemd/whatsapp-scheduler-backup.service /etc/systemd/system/
sudo cp deploy/systemd/whatsapp-scheduler-backup.timer /etc/systemd/system/
```

Habilitar el timer:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-scheduler-backup.timer
```

Ejecutar una prueba manual:
```bash
sudo systemctl start whatsapp-scheduler-backup.service
sudo systemctl status whatsapp-scheduler-backup.service
journalctl -u whatsapp-scheduler-backup.service -n 100 --no-pager
```

Ver proximas ejecuciones:
```bash
systemctl list-timers whatsapp-scheduler-backup.timer
```
