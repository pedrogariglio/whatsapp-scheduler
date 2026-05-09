# TODO - WhatsApp Scheduler Migration

## Validado
- [x] Repo auditado con foco en migracion a Ubuntu Server headless.
- [x] Riesgo principal identificado: `whatsapp-web.js` + Chromium headless + persistencia de estado.
- [x] Autenticacion del panel endurecida con `passwordHash` usando `scrypt`.
- [x] `SESSION_SECRET` movido a variables de entorno.
- [x] Setup inicial de admin movido a CLI con `npm run setup-admin`.
- [x] Uso de contrasena plana en `config.json` eliminado.
- [x] `helmet` y rate limiting agregados al login.
- [x] Setup web restringido y deshabilitado por defecto.
- [x] Variables de runtime configurables: `HOST`, `STATE_DIR`, `CHROME_BIN`, `TRUST_PROXY`, `COOKIE_SECURE`.
- [x] Estado operativo movido a `STATE_DIR`.
- [x] DB, autenticacion de WhatsApp, uploads y cache ajustados para usar `STATE_DIR`.
- [x] Acceso al panel validado desde workstation por WireGuard.
- [x] Firewall configurado para exponer `3001/tcp` solo sobre `wg0`.
- [x] Chromium headless validado en Ubuntu Server.
- [x] Sesion de WhatsApp persistida y QR inicial validado.
- [x] Scheduler mejorado para tolerar reinicios.
- [x] Reintentos persistidos con `next_retry_at`.
- [x] Retry en memoria eliminado como mecanismo principal.
- [x] Limpieza de adjuntos agregada para mensajes `sent` y `failed`.
- [x] Uploads endurecidos con nombres aleatorios y mejor validacion.
- [x] Unit file de `systemd` agregado.
- [x] Unit file ajustado para entorno con `nvm`.
- [x] `NoNewPrivileges=true` removido por incompatibilidad con Chromium via Snap.
- [x] Servicio `systemd` validado corriendo.
- [x] Stall `authenticated` -> `ready` corregido con watchdog y reinicializacion controlada.
- [x] Recuperacion de estado `ready` validada bajo `systemd`.
- [x] Bot corregido para no disparar ayuda ante mensajes enviados a terceros.
- [x] Respuestas del bot restringidas a comandos explicitos en chat propio.
- [x] Flujo funcional validado: login, testigo verde, envio programado y UI en estado `Sent`.
- [x] Backup manual de `STATE_DIR` creado y verificado.

## Proximos pasos inmediatos
- [x] Ejecutar reboot completo del servidor Ubuntu y validar recuperacion end-to-end.
- [x] Confirmar que `systemd` levanta la app automaticamente despues del reboot.
- [x] Confirmar que WhatsApp llega a estado `ready` sin reenrolar QR despues del reboot.
- [x] Programar un mensaje de prueba post-reboot y verificar envio y estado `Sent`.
- [x] Verificar acceso al panel desde workstation exclusivamente por WireGuard.
- [x] Revisar logs de `journalctl` despues del reboot para detectar warnings recurrentes de Chromium, WhatsApp o scheduler.
- [x] Documentar fecha, hora y resultado de la validacion post-reboot en `docs/SESSION_LOG.md`.

## Hardening / produccion
- [x] Habilitar y validar backups periodicos de `STATE_DIR` en el servidor.
- [x] Definir retencion de backups y politica de rotacion.
- [x] Probar restauracion de backup en un directorio limpio antes de considerarlo confiable.
- [ ] Asegurar permisos restrictivos sobre `STATE_DIR`, `.env` y backups.
- [ ] Confirmar que `ALLOW_LOCAL_WEB_SETUP=false` en produccion.
- [ ] Confirmar que `SESSION_SECRET` sea unico, largo y no versionado.
- [ ] Revisar reglas `ufw` y mantener `3001/tcp` expuesto solo por `wg0`.
- [x] Preparar despliegue Docker con Chromium dentro del contenedor para eliminar dependencia de Snap.
- [ ] Validar despliegue Docker en servidor y migrar desde `whatsapp-scheduler.service` a `whatsapp-scheduler-docker.service`.
- [ ] Revisar warning post-reboot de Chromium Snap tras validar migracion Docker: `xdg-settings: not found` y `not a snap cgroup`.
- [ ] Agregar limites operativos al servicio `systemd` si no afectan Chromium headless.
- [ ] Definir procedimiento de rotacion de credenciales del panel.
- [ ] Definir procedimiento controlado para reenrolar WhatsApp si se invalida la sesion.
- [ ] Verificar que archivos de uploads no queden persistidos tras fallos inesperados.

## Backups
- [x] Backup manual de `STATE_DIR` validado.
- [x] Crear script de backup para `STATE_DIR`.
- [x] Incluir en el backup: DB, `config.json`, sesion de WhatsApp, uploads pendientes y cache necesaria.
- [x] Excluir dependencias, logs temporales y archivos regenerables.
- [x] Guardar backups fuera del repo.
- [x] Validar checksums o prueba equivalente de integridad.
- [x] Agregar unit files para agendar backup con `systemd timer`.
- [x] Instalar y habilitar `whatsapp-scheduler-backup.timer` en el servidor.
- [x] Validar ejecucion manual de `whatsapp-scheduler-backup.service` en el servidor.
- [x] Verificar `whatsapp-scheduler-backup.timer` activo despues del reboot.
- [x] Documentar comando de restore y orden de parada/arranque del servicio.
- [x] Aplicar rotacion automatica con `BACKUP_RETENTION_DAYS=30` y `BACKUP_RETENTION_MIN_COUNT=7`.
- [x] Validar restore en directorio limpio con checksum OK y comparacion de archivos restaurados.

## Monitoreo
- [ ] Definir chequeo simple de salud HTTP para el panel/API.
- [ ] Agregar revision periodica de estado WhatsApp `ready`.
- [ ] Monitorear errores de envio y mensajes en retry vencido.
- [ ] Monitorear crecimiento de `STATE_DIR`.
- [ ] Monitorear reinicios del servicio `systemd`.
- [ ] Definir alerta ante perdida de sesion de WhatsApp o necesidad de nuevo QR.
- [ ] Revisar logs de scheduler para detectar drift, duplicados o mensajes atascados.

## Mejoras recomendadas
- [ ] Actualizar `README.md` para reflejar estado real multiplataforma y despliegue Ubuntu headless.
- [ ] Documentar comandos operativos: start, stop, restart, logs, backup y restore.
- [ ] Agregar guia corta de despliegue con WireGuard + `systemd`.
- [ ] Agregar checklist de validacion post-deploy.
- [ ] Mejorar visibilidad en UI/API para mensajes `pending`, `retry`, `sent` y `failed`.
- [ ] Agregar endpoint o vista de salud operacional.
- [ ] Revisar cobertura de pruebas para scheduler resiliente y reintentos persistidos.
- [ ] Revisar cobertura de pruebas para manejo de uploads y limpieza de adjuntos.
- [ ] Revisar cobertura de pruebas para bot en chat propio y comandos explicitos.

## Investigacion futura
- [ ] Evaluar migracion de `sql.js` a `better-sqlite3`.
- [ ] Evaluar alternativas a Chromium via Snap para reducir incompatibilidades con `systemd`.
- [ ] Investigar estrategia de monitoreo liviana compatible con servidor headless.
- [ ] Investigar limites y comportamiento de `whatsapp-web.js` ante sesiones largas.
- [ ] Evaluar estrategia para detectar y recuperar desconexiones silenciosas de WhatsApp Web.
- [ ] Evaluar empaquetado o instalador Linux para reducir pasos manuales de despliegue.
- [ ] Evaluar cifrado o proteccion adicional para backups que contienen estado sensible.
