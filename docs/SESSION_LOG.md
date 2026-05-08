• Checklist

  - Revisado el repo completo con foco en migración a Ubuntu headless.
  - Identificado riesgo principal en whatsapp-web.js + Chromium + estado persistente.
  - Endurecida autenticación del panel.
  - Movido SESSION_SECRET a .env.
  - Agregado setup-admin por CLI.
  - Eliminado uso de contraseña plana en config.json.
  - Introducido passwordHash con scrypt.
  - Agregado helmet y rate limiting en login.
  - Restringido el setup web; deshabilitado por defecto.
  - Hecho configurable HOST, STATE_DIR, CHROME_BIN, TRUST_PROXY, COOKIE_SECURE.
  - Movido estado operativo a STATE_DIR.
  - Ajustadas rutas de DB, auth de WhatsApp, uploads y cache a STATE_DIR.
  - Validado acceso al panel desde workstation por WireGuard.
  - Abierto 3001/tcp solo sobre wg0 en ufw.
  - Resuelto arranque de Chromium headless en Ubuntu Server.
  - Persistida sesión de WhatsApp y validado QR inicial.
  - Mejorado scheduler para tolerar reinicios.
  - Persistidos retries con next_retry_at.
  - Eliminado retry en memoria como mecanismo principal.
  - Agregada limpieza de adjuntos tras sent y failed.
  - Endurecidos uploads con nombres aleatorios y mejor validación.
  - Agregado unit file de systemd.
  - Ajustado unit file para nvm.
  - Quitado NoNewPrivileges=true por incompatibilidad con Chromium vía Snap.
  - Validado servicio systemd corriendo.
  - Corregido stall authenticated -> ready con watchdog y reinicialización controlada.
  - Validado recuperación de ready bajo systemd.
  - Corregido disparo espurio del bot ante mensajes a terceros.
  - Restringidas respuestas del bot a comandos explícitos en chat propio.
  - Validado backup manual de STATE_DIR.

  Migration Log

  1. Se auditó el proyecto original, orientado a Windows, para detectar incompatibilidades con Ubuntu headless y acceso remoto por WireGuard.
  2. Se confirmó que el estado sensible estaba disperso en el repo (config.json, data/, .wwebjs_auth/, uploads/) y se rediseñó para usar STATE_DIR.
  3. Se endureció el login del panel: hash de contraseñas, SESSION_SECRET en entorno, rate limiting y setup inicial por CLI.
  4. Se creó .env.example y se definieron variables de despliegue para Ubuntu Server.
  5. Se preparó el server:
      - STATE_DIR en /opt/whatsapp-scheduler/state
      - permisos correctos
      - acceso del panel por HOST=0.0.0.0
      - firewall limitado a wg0
  6. Se validó el arranque manual de la app y el enrolamiento inicial por QR.
  7. Se detectó un problema de scheduler: los mensajes en retry podían quedar colgados tras reinicios. Se corrigió persistiendo next_retry_at.
  8. Se endureció el manejo de archivos adjuntos y uploads.
  9. Se agregó soporte de despliegue con systemd.
  10. Se encontró incompatibilidad entre el unit file inicial y un entorno con nvm + Chromium empaquetado como Snap.
  11. Se ajustó el servicio:
      - ExecStart apuntando a npm de nvm
      - PATH explícito
      - eliminación de NoNewPrivileges=true
  12. Se validó que el servicio arrancara tras reinicio del proceso, pero apareció un bug: el cliente quedaba en authenticated y no siempre llegaba a ready.
  13. Se corrigió src/whatsapp.js con watchdog de ready, logs de estado y reinicialización controlada sin borrar la sesión.
  14. Se validó que bajo systemd el cliente llegara a:
      - Autenticado correctamente
      - WhatsApp Web listo para enviar mensajes
  15. Se detectó otro bug funcional: el bot respondía ayuda automáticamente en el chat propio al enviar mensajes a terceros.
  16. Se corrigió la detección de “self chat” y se limitó la respuesta del bot a comandos explícitos.
  17. Se validó el flujo final:
      - login correcto
      - testigo verde
      - mensajes enviados en tiempo y forma
      - UI mostrando Sent
  18. Se creó y verificó un backup manual de STATE_DIR.

  Commits realizados

  - 6a1991a Harden auth and runtime configuration
  - 7b4a49a Harden scheduler retries and attachment handling
  - 0fd5a87 Add Ubuntu systemd deployment support
  - 282100f fix: align systemd unit with nvm and snap chromium
  - 3f291a2 fix: recover whatsapp client when auth stalls before ready
  - b0abe1b fix: restrict bot replies to explicit self-chat commands

  Estado final

  - app operable en Ubuntu Server
  - acceso desde workstation por WireGuard
  - servicio systemd funcional
  - sesión de WhatsApp persistente
  - scheduler resiliente
  - bot corregido
  - backup manual validado

  Pendiente recomendado

  - automatizar backups
  - probar reboot completo del server como validación final
  - evaluar migración de sql.js a better-sqlite3

  Continuacion 2026-05-06

  - Revisados docs/SESSION_LOG.md y docs/TODO.md para retomar continuidad operativa.
  - Agregado script npm backup:state para generar backups de STATE_DIR.
  - El backup genera archivo .tar.gz y checksum .sha256.
  - Excluidos dependencias, metadatos de git, cache de navegador y archivos regenerables.
  - Validado backup contra STATE_DIR temporal en /tmp, sin tocar estado real.
  - Validado contenido del tar temporal y checksum con sha256sum -c.
  - Documentado procedimiento de backup y restore en docs/BACKUP.md.
  - Agregados unit files de systemd para backup diario con timer.

  Pendiente actualizado

  - ejecutar reboot completo del servidor como validación final
  - definir retención/rotación de backups
  - probar restore completo en entorno limpio
  - evaluar migración de sql.js a better-sqlite3

  Continuacion 2026-05-07

  - Validado backup manual en servidor con checksum OK.
  - Instalado y habilitado whatsapp-scheduler-backup.timer en el servidor.
  - Confirmado timer enabled y active waiting.
  - Confirmado disparo automatico del timer el 2026-05-07 03:15:06 UTC.
  - Validada ejecucion manual de whatsapp-scheduler-backup.service con status=0/SUCCESS.
  - Confirmada creacion de backups en /opt/whatsapp-scheduler/backups con permisos 0600.
  - Validado checksum OK para backups 2026-05-06T20-35-04-120Z, 2026-05-07T03-15-06-180Z y 2026-05-07T11-51-42-615Z.

  Pendiente actualizado

  - ejecutar reboot completo del servidor como validación final
  - validar systemd, WhatsApp ready, acceso por WireGuard y envio programado post-reboot
  - definir retención/rotación de backups
  - probar restore completo en entorno limpio
  - evaluar migración de sql.js a better-sqlite3

  Continuacion 2026-05-07 post-reboot

  - Ejecutado reboot completo del servidor Ubuntu.
  - Confirmado whatsapp-scheduler.service enabled y active running tras reboot.
  - Confirmado arranque automatico por systemd desde boot 87957838899f44c0814e6233aabec98f.
  - Confirmado scheduler iniciado y servidor escuchando en http://0.0.0.0:3001.
  - Confirmada persistencia de sesion: WhatsApp autentico sin solicitar QR.
  - Detectado fallo inicial de Chromium Snap al arrancar: xdg-settings no encontrado y cgroup snap no reconocido.
  - Confirmada recuperacion automatica por watchdog: initialize-error, ready-timeout y reintento controlado.
  - Confirmado estado final WhatsApp ready a las 2026-05-07 12:22:34 UTC.
  - Confirmado bot activo y cache de contactos actualizada.

  Pendiente actualizado

  - validar acceso al panel desde workstation por WireGuard
  - verificar timer de backup tras reboot
  - evaluar hardening de Chromium no dependiente de Snap o resolver warning de xdg-settings/cgroup
  - definir retención/rotación de backups
  - probar restore completo en entorno limpio
  - evaluar migración de sql.js a better-sqlite3

  Continuacion 2026-05-07 validacion funcional

  - Validado envio de mensaje de prueba post-reboot.
  - Confirmado envio correcto y estado Sent.

  Pendiente actualizado

  - evaluar hardening de Chromium no dependiente de Snap o resolver warning de xdg-settings/cgroup
  - definir retención/rotación de backups
  - probar restore completo en entorno limpio
  - evaluar migración de sql.js a better-sqlite3

  Continuacion 2026-05-07 cierre post-reboot

  - Validado acceso exitoso al panel desde workstation via WireGuard en http://10.0.0.1:3001/.
  - Confirmado testigo verde en panel.
  - Confirmado envio correcto de mensaje desde la workstation.
  - Confirmado whatsapp-scheduler-backup.timer enabled y active waiting tras reboot.
  - Confirmado proximo backup automatico para 2026-05-08 03:15:00 UTC.
  - Confirmado ultimo backup automatico registrado el 2026-05-07 03:15:05 UTC.

  Pendiente actualizado

  - evaluar hardening de Chromium no dependiente de Snap o resolver warning de xdg-settings/cgroup
  - definir retención/rotación de backups
  - probar restore completo en entorno limpio
  - evaluar migración de sql.js a better-sqlite3

  Resumen estructurado

  - Ver docs/sessions/session-2026-05-07.md para objetivos, cambios realizados, problemas, soluciones y próximos pasos de la sesión.

  Documentacion operativa

  - Completado docs/DEPLOYMENT.md como guia profesional de despliegue Ubuntu headless con systemd, WireGuard, STATE_DIR, backups, validacion y troubleshooting.

  Continuacion 2026-05-08

  - Definida politica de retencion y rotacion de backups.
  - Agregadas variables BACKUP_RETENTION_DAYS y BACKUP_RETENTION_MIN_COUNT al script de backup.
  - Politica por defecto: conservar backups por 30 dias y mantener siempre al menos 7 backups recientes.
  - La rotacion corre solo despues de crear backup y checksum exitosamente.
  - La limpieza se limita a archivos propios whatsapp-scheduler-state-*.tar.gz y sus .sha256 asociados.
  - Agregadas variables de retencion al unit file whatsapp-scheduler-backup.service.
  - Validada rotacion con STATE_DIR temporal en /tmp, sin tocar estado real.
  - Validado checksum OK del backup temporal generado durante la prueba.
  - Actualizados docs/BACKUP.md, docs/DEPLOYMENT.md y docs/TODO.md.
  - Probado restore completo en directorio limpio usando STATE_DIR temporal en /tmp.
  - Validado checksum antes del restore.
  - Validada restauracion de config.json, data/scheduler.db, .wwebjs_auth y uploads pendientes.
  - Comparados archivos restaurados contra origen temporal con cmp.

  Pendiente actualizado

  - asegurar permisos restrictivos sobre STATE_DIR, .env y backups
  - evaluar hardening de Chromium no dependiente de Snap o resolver warning de xdg-settings/cgroup
  - agregar monitoreo liviano
  - evaluar migracion de sql.js a better-sqlite3
