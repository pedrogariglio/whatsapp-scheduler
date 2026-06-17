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

  Continuacion 2026-05-09

  - Analizado problema post-reboot asociado a mounts de Docker netns y desmontaje masivo de snaps.
  - Definido camino de hardening: sacar Chromium Snap del host y ejecutar Chromium dentro de un contenedor Docker junto con la app.
  - Agregado Dockerfile basado en node:20-bookworm-slim con Chromium instalado via apt dentro de la imagen.
  - Agregado compose.yml para montar /opt/whatsapp-scheduler/state en /state y publicar el panel.
  - Configurado CHROME_BIN=/usr/bin/chromium y STATE_DIR=/state para runtime Docker.
  - Agregado PANEL_BIND opcional para publicar el panel solo sobre WireGuard, por ejemplo 10.0.0.1.
  - Agregado unit alternativo deploy/systemd/whatsapp-scheduler-docker.service para operar Docker Compose desde systemd.
  - Actualizada documentacion de despliegue con procedimiento de prueba, migracion y rollback implicito manteniendo el unit host existente.
  - Validado docker compose config correctamente.
  - Construida imagen local whatsapp-scheduler:local correctamente.
  - Validado Chromium dentro de la imagen: Chromium 148.0.7778.96 sobre Debian 12 bookworm.

  Pendiente actualizado

  - confirmar que WhatsApp llega a ready dentro del contenedor sin nuevo QR
  - validar acceso por WireGuard y envio de prueba
  - migrar systemd desde whatsapp-scheduler.service a whatsapp-scheduler-docker.service
  - tras validar Docker, evaluar remocion de Chromium Snap y snaps de escritorio innecesarios

  Resumen estructurado

  - Ver docs/sessions/session-2026-05-09.md para objetivos, cambios realizados, problemas, soluciones y proximos pasos de la sesion.

  Continuacion 2026-05-23

  - Retomado el proyecto desde docs/SESSION_LOG.md, docs/TODO.md y docs/sessions/session-2026-05-09.md sin asumir cambios no documentados.
  - Confirmado que el ultimo checkpoint funcional validado sigue siendo el servicio host con whatsapp-scheduler.service, WireGuard, backups y post-reboot OK.
  - Revalidado localmente docker compose config correctamente.
  - Revalidada construccion local de la imagen whatsapp-scheduler:local correctamente.
  - Revalidado Chromium dentro de la imagen: Chromium 148.0.7778.96 sobre Debian 12 bookworm.
  - Ejecutado smoke test aislado del contenedor con STATE_DIR temporal en /tmp, sin tocar estado real ni servicio productivo.
  - Confirmado arranque HTTP del contenedor en http://127.0.0.1:3301.
  - Confirmada respuesta 503 esperada en /login.html y /health al usar STATE_DIR temporal sin admin configurado.
  - Confirmado QR efimero dentro del contenedor temporal, consistente con arranque sin sesion persistida.
  - No se detectaron bloqueos locales que impidan avanzar con la validacion Docker en el servidor.
  - Documentado runbook de validacion Docker en servidor con preflight, validacion funcional, migracion de systemd y rollback inmediato.
  - Corregido el runbook para evitar conflicto de puertos con el servicio host: la validacion manual Docker en servidor debe usar puerto temporal, por ejemplo 3301 sobre WireGuard.

  Pendiente actualizado

  - confirmar que WhatsApp llega a ready dentro del contenedor usando el STATE_DIR real del servidor y sin nuevo QR
  - validar acceso al panel por WireGuard y envio de prueba con estado Sent
  - migrar systemd desde whatsapp-scheduler.service a whatsapp-scheduler-docker.service solo despues de validar Docker
  - tras validar Docker, evaluar remocion de Chromium Snap y snaps de escritorio innecesarios
  - mantener pendiente la revision de permisos restrictivos sobre STATE_DIR, .env y backups

  Resumen estructurado

  - Ver docs/sessions/session-2026-05-23.md para la validacion local aislada del runtime Docker y el proximo paso operativo en servidor.

  Continuacion 2026-05-24

  - No se ejecutaron aun pasos de la secuencia recomendada sobre el servidor.
  - Se confirmo que la continuidad correcta sigue siendo: validar Docker en servidor usando puerto temporal 3301, completar las 4 validaciones funcionales y recien despues migrar systemd.
  - Se intento diagnosticar acceso remoto desde esta sesion usando el alias SSH local minipc.
  - Los chequeos remotos fallaron con timeout hacia 192.168.18.29:22.
  - Se concluyo que no hubo conectividad util al servidor desde esta sesion y que la ejecucion remota debe retomarse manana desde la workstation del usuario.
  - No se modifico codigo de aplicacion ni se toco el estado productivo.
  - Se actualizaron los docs para dejar asentado el bloqueo operativo y el punto exacto de retome.

  Decisiones importantes

  - No asumir validaciones remotas no ejecutadas.
  - No migrar systemd ni tocar el servicio host hasta completar las 4 comprobaciones funcionales en el servidor.
  - Mantener como plan vigente la validacion manual de Docker en 10.0.0.1:3301 para evitar conflicto con el 3001 del servicio host.

  Problemas encontrados

  - Sin acceso operativo al servidor en esta sesion.
  - Timeout de SSH usando el alias minipc configurado localmente contra 192.168.18.29:22.

  Proximos pasos

  - Hacer git push desde la workstation.
  - En el servidor, ejecutar git pull y el preflight documentado.
  - Crear backup manual de STATE_DIR antes de la prueba Docker.
  - Levantar Docker manualmente con PANEL_BIND=10.0.0.1 y PORT=3301.
  - Confirmar en logs WhatsApp ready sin nuevo QR.
  - Validar panel por WireGuard, login, testigo verde y envio de prueba con estado Sent.
  - Solo despues de completar esas validaciones, migrar systemd a whatsapp-scheduler-docker.service.

  Resumen estructurado

  - Ver docs/sessions/session-2026-05-24.md para el cierre documental de la sesion bloqueada por falta de acceso al servidor y el punto exacto de retome.

  Continuacion 2026-05-28

  - Ejecutado backup manual de STATE_DIR en servidor antes de la validacion Docker.
  - Validado arranque funcional del contenedor Docker en puerto temporal 3301 con el servicio host detenido.
  - Confirmados login OK, testigo verde y envio correcto de mensaje programado desde la UI en Docker.
  - Al probar persistencia con `docker compose down` + `up`, Chromium fallo con `profile appears to be in use by another Chromium process on another computer`.
  - Identificada causa operativa probable: hostname variable del contenedor entre recreaciones, incompatible con el lock del perfil persistido de Chromium.
  - Ajustado `compose.yml` para fijar `hostname: whatsapp-scheduler`.
  - Actualizada documentacion operativa con limpieza unica de `Singleton*` y `Lock*` en `.wwebjs_auth` antes de reintentar la persistencia.

  Pendiente actualizado

  - hacer git push/pull del ajuste de `compose.yml` y docs
  - con el servicio host detenido, limpiar locks stale de `.wwebjs_auth`
  - relanzar Docker y validar persistencia sin QR nuevo ni error de `profile in use`
  - si la persistencia queda OK, migrar systemd a whatsapp-scheduler-docker.service

  Resumen estructurado

  - Ver docs/TODO.md y docs/DEPLOYMENT.md para el procedimiento corregido de persistencia Docker con hostname estable y limpieza de locks.

  Cierre 2026-05-28

  - Ejecutado preflight operativo en servidor y backup manual de STATE_DIR antes de la migracion.
  - Validado Docker manualmente en `10.0.0.1:3301` con el servicio host detenido.
  - Confirmados login OK, testigo verde y envio correcto de mensaje programado desde la UI en Docker.
  - Detectado reenrolamiento necesario: la cuenta ya no estaba vinculada y el QR nuevo era consistente con sesion invalida o inexistente.
  - Reenrolada la cuenta en Docker y validado `Autenticado correctamente. Sesion guardada.` seguido de `WhatsApp Web listo para enviar mensajes.`
  - Detectado fallo de persistencia en reinicio controlado por lock de perfil Chromium `profile appears to be in use by another Chromium process on another computer`.
  - Confirmada causa operativa: hostname variable del contenedor entre recreaciones, incompatible con el lock del perfil persistido.
  - Aplicado fix en `compose.yml` fijando `hostname: whatsapp-scheduler`.
  - Limpiados locks stale `Singleton*` y `Lock*` dentro de `.wwebjs_auth` con el servicio host detenido.
  - Revalidada persistencia en Docker sin QR nuevo y sin error de `profile in use`.
  - Actualizado `.env` del servidor con `PANEL_BIND=10.0.0.1` para publicar el panel solo sobre WireGuard.
  - Ejecutado cutover final de `systemd` desde `whatsapp-scheduler.service` a `whatsapp-scheduler-docker.service`.
  - Confirmado `docker compose ps` con bind `10.0.0.1:3001->3001/tcp`.
  - Confirmado estado final en produccion:
      - login correcto en `http://10.0.0.1:3001/`
      - testigo verde
      - mensaje programado enviado correctamente
      - app corriendo en Docker como servicio principal

  Pendiente actualizado

  - validar reboot completo usando `whatsapp-scheduler-docker.service`
  - revisar warning legacy de Chromium Snap y evaluar remocion de paquetes Snap no necesarios
  - asegurar permisos restrictivos sobre STATE_DIR, `.env` y backups
  - definir rotacion de credenciales del panel y procedimiento de reenrolamiento

  Resumen estructurado

  - Ver docs/sessions/session-2026-05-28.md para el cierre completo de la migracion a Docker y la validacion funcional final en produccion.

  Continuacion 2026-05-30

  - Detectado bloqueo operativo del host para reboot remoto: el HP EliteDesk no completa un boot headless confiable sin monitor conectado y la red no levanta.
  - Confirmado que no hubo workaround util desde BIOS: la opcion de configuracion VGA no estuvo disponible y el adaptador `DP-HDMI` no resolvio el problema.
  - Ejecutado reboot controlado del servidor con teclado y monitor conectados localmente.
  - Confirmado nuevo boot `b99d79f629734b498bb36c3e1214f75c`.
  - Confirmado `whatsapp-scheduler-docker.service` enabled y arranque automatico tras reboot.
  - Confirmado estado final de `whatsapp-scheduler-docker.service`: `active (exited)` con `status=0/SUCCESS`.
  - Confirmado `whatsapp-scheduler-backup.timer` `active (waiting)` tras reboot.
  - Confirmada validacion funcional post-reboot en produccion:
      - login correcto en `http://10.0.0.1:3001/`
      - testigo verde
      - mensaje programado enviado correctamente
      - Docker operativo como servicio principal tambien despues del reboot real del host

  Pendiente actualizado

  - resolver el headless boot issue del HP EliteDesk para permitir reboots remotos seguros sin monitor
  - confirmar si ya no quedan dependencias operativas del host legacy antes de retirar Chromium Snap
  - asegurar permisos restrictivos sobre STATE_DIR, `.env` y backups
  - definir rotacion de credenciales del panel y procedimiento de reenrolamiento

  Resumen estructurado

  - La migracion a Docker quedo validada end-to-end, incluido reboot real del host.
  - El riesgo operativo abierto ya no es de la app sino del hardware/BIOS del servidor en modo headless.

  Continuacion 2026-05-30 auditoria host legacy

  - Auditadas dependencias residuales del runtime legacy directamente en el servidor despues del reboot validado.
  - Confirmado que `whatsapp-scheduler.service` sigue instalado pero `disabled` e `inactive`.
  - Confirmado que el servicio productivo vigente es `whatsapp-scheduler-docker.service`.
  - Confirmado que `snapd.service` y `snapd.seeded.service` no existen en el host.
  - Confirmado que el comando `snap` no existe en el host.
  - Confirmado que no hay binarios locales de Chromium en `/usr/bin/chromium-browser` ni `/usr/bin/chromium`.
  - Confirmado que el contenedor productivo usa `CHROME_BIN=/usr/bin/chromium` interno a la imagen y publica `10.0.0.1:3001`.
  - Confirmado que el repo legacy y el runtime `node` de `nvm` aun existen en el host, pero el `.env` legacy apunta a `CHROME_BIN=/usr/bin/chromium-browser`, hoy ausente.
  - Concluido que ya no quedan dependencias operativas del runtime legacy para la produccion actual en Docker.
  - Detectado que el rollback legacy a `whatsapp-scheduler.service` ya no es inmediato ni confiable sin reinstalar o reconfigurar un navegador local del host.

  Pendiente actualizado

  - resolver el headless boot issue del HP EliteDesk para permitir reboots remotos seguros sin monitor
  - actualizar o retirar el rollback legacy a `whatsapp-scheduler.service`
  - asegurar permisos restrictivos sobre STATE_DIR, `.env` y backups
  - definir rotacion de credenciales del panel y procedimiento de reenrolamiento

  Continuacion 2026-05-31

  - Adoptada la decision operativa de abandonar el rollback al servicio host legacy y estandarizar produccion como Docker-only.
  - Actualizado `docs/DEPLOYMENT.md` para presentar `whatsapp-scheduler-docker.service` como servicio principal actual.
  - Reemplazado el rollback legado a `whatsapp-scheduler.service` por un rollback Docker-native basado en volver a un commit o tag conocido y reconstruir la imagen.
  - Actualizado `docs/BACKUP.md` para que restore y validacion usen `whatsapp-scheduler-docker.service`.
  - Marcado `deploy/systemd/whatsapp-scheduler.service` como unit legacy de referencia y no como camino soportado de rollback inmediato.

  Pendiente actualizado

  - resolver el headless boot issue del HP EliteDesk para permitir reboots remotos seguros sin monitor
  - definir una convencion de tags o checkpoints estables para acelerar rollback Docker-native
  - asegurar permisos restrictivos sobre STATE_DIR, `.env` y backups
  - definir rotacion de credenciales del panel y procedimiento de reenrolamiento

  Continuacion 2026-06-17

  - Definida convencion operativa de checkpoints estables para rollback Docker-native.
  - Documentado en `docs/DEPLOYMENT.md` el formato recomendado de tags anotados: `prod-stable-YYYYMMDD-HHMM`.
  - Documentada la regla de crear tags solo despues de validacion real en produccion.
  - Documentado procedimiento de rollback usando `git fetch --tags`, `git checkout <tag>` y reinicio de `whatsapp-scheduler-docker.service`.
  - Documentada nota operativa sobre `detached HEAD` y vuelta explicita a `main` despues del incidente.

  Pendiente actualizado

  - resolver el headless boot issue del HP EliteDesk para permitir reboots remotos seguros sin monitor
  - crear el primer tag `prod-stable-*` despues del proximo checkpoint productivo que se quiera conservar
  - asegurar permisos restrictivos sobre STATE_DIR, `.env` y backups
  - definir rotacion de credenciales del panel y procedimiento de reenrolamiento
