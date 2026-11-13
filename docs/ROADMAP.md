# Roadmap - WhatsApp Scheduler

## Norte

Convertir la aplicacion en una plataforma self-hosted para varias personas, manteniendo:

- aislamiento por persona;
- una sesion de WhatsApp por instancia;
- acceso privado, sin exposicion publica innecesaria;
- backups y monitoreo por instancia;
- despliegues reproducibles;
- capacidad de migrar a Proxmox y red segmentada sin reescribir la app.

## Estado actual

- Una instancia productiva en Docker sobre `homelab-server`.
- WhatsApp conectado, envio programado validado y cache de contactos corregido.
- Monitoreo interno con `/internal/health` y timer cada 2 minutos.
- Backups periodicos de `STATE_DIR`.
- Panel accesible por WireGuard en `http://10.0.0.1:3001`.
- `compose.yml` preparado para instancias aisladas por variables de entorno.
- Documento de multi-instancia en `docs/MULTI_INSTANCE.md`.

## Principios

1. **WireGuard primero.** El panel no se expone a Internet salvo decision explicita y con controles adicionales.
2. **Una persona, una instancia.** Cada usuario tiene su propio numero, sesion, estado, puerto, backups y secretos.
3. **Nunca compartir `.wwebjs_auth`.** Dos clientes sobre el mismo perfil corrompen la sesion.
4. **Secretos separados.** `SESSION_SECRET`, `HEALTH_TOKEN` y tokens de monitoreo no se reutilizan entre instancias.
5. **Backups separados.** Un backup de una instancia no se restaura sobre otra.
6. **Monitoreo por instancia.** Cada instancia debe exponer su propio health check.
7. **Cambios pequenos y reversibles.** Cada fase debe tener criterio de aceptacion y rollback.

## Red y puertos

### Respuesta corta

Para que otra persona use la app **no hace falta abrir puertos en el router**.

Lo recomendado es que esa persona se conecte por WireGuard y acceda al panel por la IP interna de la VPN. El router solo necesita el puerto UDP de WireGuard si el acceso remoto ya funciona asi.

### Opciones de acceso

| Opcion | Router | Firewall del server | Recomendacion |
|---|---|---|---|
| WireGuard + puerto directo por instancia | No abrir puertos nuevos | Permitir `3001`, `3002`, etc. solo en `wg0` | Recomendada para empezar |
| WireGuard + reverse proxy interno | No abrir puertos nuevos | Permitir `443` solo en `wg0` | Recomendada cuando haya varias instancias |
| Solo LAN | No | Permitir el puerto solo en la interfaz LAN | Aceptable si la persona vive en la misma red |
| Exposicion publica | Si, port forwarding | TLS, firewall, rate limit, MFA, monitoreo | No recomendada por ahora |

### Implicancias concretas para una segunda persona

- Agregar un peer de WireGuard para su dispositivo.
- Permitir el puerto de su instancia solo sobre `wg0` (o LAN si se elige ese modelo).
- No publicar el puerto en `0.0.0.0`.
- No abrir el panel a Internet.
- Si se usa reverse proxy interno, publicar solo `443` en `wg0` y enrutar por nombre interno.

## Fases

### Fase 0 - Estabilizacion actual

Objetivo: cerrar la operacion de la instancia principal.

Tareas:

- [x] Contactos guardados, LID resueltos y nombres correctos.
- [x] Monitoreo interno y timer de health.
- [x] Backups con exclusion del auth legacy.
- [ ] Verificar el proximo backup periodico.
- [ ] Crear tag estable del estado actual.
- [ ] Confirmar varios reinicios y envios sin regresiones.

Criterio de aceptacion:

- ready sin QR en arranques normales;
- envio programado con estado `Sent`;
- health `whatsappReady=true`;
- backup reciente con checksum valido.

### Fase 1 - Onboarding de una segunda persona

Objetivo: que otra persona use su propia instancia sin afectar la principal.

Prerrequisitos:

- numero de WhatsApp propio para esa persona;
- token de WireGuard para su dispositivo;
- decision de puerto host (ejemplo: `3002`);
- decision de nombre de instancia (ejemplo: `whatsapp-scheduler-<nombre>`).

Tareas:

- [ ] Crear `/opt/whatsapp-scheduler/<nombre>/state`.
- [ ] Crear `/opt/whatsapp-scheduler/<nombre>/backups`.
- [ ] Crear `.env.<nombre>` con secretos propios.
- [ ] Levantar la instancia con `COMPOSE_PROJECT_NAME`, `INSTANCE_NAME`, `STATE_DIR_HOST`, `ENV_FILE`, `PORT` y `PANEL_BIND`.
- [ ] Reenrolar el WhatsApp de esa persona por QR.
- [ ] Crear su admin de panel con `npm run setup-admin`.
- [ ] Configurar backup propio.
- [ ] Configurar health check propio.
- [ ] Agregar regla de firewall para su puerto solo sobre `wg0`.
- [ ] Agregar peer de WireGuard para su dispositivo.
- [ ] Validar login, contactos, envio programado y reinicio.

Criterio de aceptacion:

- ambas instancias corren en paralelo sin conflicto;
- cada una tiene su propia sesion y cache;
- un reinicio de una no afecta a la otra;
- cada backup y health file queda en su propio directorio;
- no hay puertos publicos nuevos en el router.

### Fase 2 - Red segmentada con switch L2

Objetivo: separar servidores, dispositivos de confianza e IoT.

Tareas:

- [ ] Definir VLAN de servidores.
- [ ] Definir VLAN de confianza para workstation y celulares.
- [ ] Definir VLAN de IoT.
- [ ] Definir reglas de firewall entre VLANs.
- [ ] Mover el server o sus instancias a la VLAN de servidores.
- [ ] Documentar direccionamiento, DHCP y DNS interno.
- [ ] Validar acceso por WireGuard desde fuera de casa.
- [ ] Validar que IoT no accede al panel ni a la sesion de WhatsApp.

Criterio de aceptacion:

- el panel solo es accesible desde redes permitidas;
- IoT no alcanza los puertos de las instancias;
- WireGuard sigue funcionando;
- backups y monitoreo siguen operativos.

### Fase 3 - Reverse proxy interno y TLS

Objetivo: dejar de exponer un puerto por instancia y centralizar el acceso.

Tareas:

- [ ] Elegir Caddy o Traefik.
- [ ] Definir DNS interno para cada instancia.
- [ ] Emitir certificados internos o usar ACME con DNS interno.
- [ ] Enrutar por hostname a cada contenedor.
- [ ] Publicar solo `443` en la interfaz privada.
- [ ] Mantener el acceso directo por puerto como fallback temporal.

Criterio de aceptacion:

- cada persona accede por su nombre interno con TLS;
- no hay puertos de instancias publicados en `0.0.0.0`;
- health checks siguen funcionando;
- el acceso directo por puerto queda restringido o deshabilitado.

### Fase 4 - Proxmox y segundo nodo

Objetivo: separar cargas y mejorar recuperacion.

Tareas:

- [ ] Definir si cada instancia va a VM o contenedor LXC.
- [ ] Estimar memoria por instancia (Chromium + Node + shm).
- [ ] Definir almacenamiento para estado y backups.
- [ ] Configurar snapshots y backups de Proxmox.
- [ ] Definir red virtual y VLANs.
- [ ] Migrar una instancia piloto.
- [ ] Validar reinicio, QR, envio y monitoreo.
- [ ] Documentar rollback al server actual.

Criterio de aceptacion:

- la instancia migrada funciona igual que antes;
- el backup de la instancia se restaura correctamente en el nuevo entorno;
- el nodo original puede apagarse sin perder servicio;
- el monitoreo central detecta caidas.

### Fase 5 - Observabilidad centralizada

Objetivo: ver todas las instancias desde un solo lugar.

Tareas:

- [ ] Recolectar health de cada instancia.
- [ ] Centralizar logs (journald remoto, Loki o similar).
- [ ] Alertar por ready=false, stalls, reinicios y backups fallidos.
- [ ] Monitorear espacio en disco de `STATE_DIR`.
- [ ] Monitorear crecimiento de uploads y backups.
- [ ] Definir panel o dashboard simple.

Criterio de aceptacion:

- una caida de WhatsApp se detecta sin mirar el server;
- se sabe que instancia fallo y por que;
- hay alerta si un backup no corre;
- hay alerta si el disco supera el umbral definido.

### Fase 6 - Features de producto

Objetivo: mejorar la experiencia una vez estable la plataforma.

Ideas:

- [ ] Historial y filtros por estado.
- [ ] Reintentos manuales desde el panel.
- [ ] Plantillas de mensajes.
- [ ] Etiquetas o grupos de contactos.
- [ ] Adjuntos con mejor validacion y limpieza.
- [ ] Export/import de mensajes pendientes.
- [ ] Branding/nombre por instancia.
- [ ] Roles dentro de una instancia (si alguna vez se comparte).

No implementar estas features antes de cerrar Fase 1 y Fase 2.

## Decisiones pendientes

- ¿La segunda persona tendra su propio numero de WhatsApp? Asumido: si.
- ¿Acceso por puerto directo sobre WireGuard o reverse proxy desde el inicio?
- ¿VLANs desde el primer dia o despues de estabilizar la segunda instancia?
- ¿Proxmox en el mismo nodo actual o en el nodo nuevo?
- ¿Backups cifrados o solo permisos restrictivos?
- ¿Monitoreo por webhook, correo o dashboard?

## Proximo paso recomendado

1. Validar el compose actualizado en el server.
2. Verificar el proximo backup y crear un tag estable.
3. Definir nombre, numero y puerto de la segunda instancia.
4. Ejecutar la Fase 1 con una checklist de aceptacion.
