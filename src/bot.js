const db = require('./db');

// Almacena el estado de la conversación por número de usuario
// Estructura: { "5491112345678": { step: 'esperando_numero', data: {} } }
const sessions = {};

// Número del propio usuario — el bot solo escucha mensajes de él mismo.
// Se detecta automáticamente cuando el cliente está listo.
let ownerNumber = null;

function setOwnerNumber(number) {
  ownerNumber = number;
  console.log(`🤖 Bot activo. Escuchando mensajes de: ${number}`);
}

/**
 * Punto de entrada principal. Recibe cada mensaje entrante.
 * Se llama desde index.js al registrar el evento 'message'.
 */
async function handleMessage(message, client) {
  // Solo procesar mensajes enviados por el propio usuario a sí mismo
  const senderId = message.from.replace('@c.us', '');
  
  if (!ownerNumber || senderId !== ownerNumber) return;

  // Solo mensajes de chat individual (ignorar grupos)
  if (message.from.includes('@g.us')) return;

  const text = message.body.trim();
  const session = sessions[senderId] || { step: 'idle', data: {} };

  // --- Comandos directos (disponibles en cualquier momento) ---

  if (text === '/agendar') {
    sessions[senderId] = { step: 'esperando_numero', data: {} };
    await reply(message, 
      '📱 ¿A qué número querés enviar el mensaje?\n' +
      'Con código de país, sin + ni espacios.\n' +
      'Ejemplo: _5491112345678_'
    );
    return;
  }

  if (text === '/pendientes') {
    await handlePendientes(message);
    return;
  }

  if (text.startsWith('/cancelar')) {
    await handleCancelar(message, text);
    return;
  }

  if (text === '/ayuda' || text === '/start') {
    await handleAyuda(message);
    return;
  }

  // --- Flujo conversacional de /agendar ---

  if (session.step === 'esperando_numero') {
    if (!/^\d{7,15}$/.test(text)) {
      await reply(message,
        '❌ Número inválido. Solo dígitos, sin + ni espacios.\n' +
        'Ejemplo: _5491112345678_'
      );
      return;
    }
    sessions[senderId] = { step: 'esperando_mensaje', data: { phone: text } };
    await reply(message, '💬 ¿Cuál es el mensaje que querés enviar?');
    return;
  }

  if (session.step === 'esperando_mensaje') {
    if (text.length === 0) {
      await reply(message, '❌ El mensaje no puede estar vacío.');
      return;
    }
    sessions[senderId] = {
      step: 'esperando_fecha',
      data: { ...session.data, message: text },
    };
    await reply(message,
      '🕐 ¿Cuándo querés enviarlo?\n' +
      'Formato: _DD/MM/YYYY HH:MM_\n' +
      'Ejemplo: _28/02/2026 09:00_'
    );
    return;
  }

  if (session.step === 'esperando_fecha') {
    const scheduledAt = parseFecha(text);
    if (!scheduledAt) {
      await reply(message,
        '❌ Fecha inválida. Usá el formato: _DD/MM/YYYY HH:MM_\n' +
        'Ejemplo: _28/02/2026 09:00_'
      );
      return;
    }
    if (scheduledAt <= new Date()) {
      await reply(message, '❌ La fecha debe ser futura.');
      return;
    }

    // Guardar en BD
    const { phone, message: msgText } = session.data;
    const newMsg = db.createMessage(phone, msgText, scheduledAt.toISOString());

    // Limpiar sesión
    sessions[senderId] = { step: 'idle', data: {} };

    await reply(message,
      `✅ *Mensaje programado correctamente*\n\n` +
      `📱 Para: ${phone}\n` +
      `💬 Mensaje: ${msgText}\n` +
      `🕐 Envío: ${formatFecha(scheduledAt)}\n` +
      `🔖 ID: #${newMsg.id}`
    );
    return;
  }

  // Si no coincide con nada, mostrar ayuda
  await handleAyuda(message);
}

// --- Handlers de comandos ---

async function handlePendientes(message) {
  const pendientes = db.getPendingMessagesList();

  if (pendientes.length === 0) {
    await reply(message, '📋 No tenés mensajes pendientes.');
    return;
  }

  const lines = pendientes.map((m) => {
    const fecha = formatFecha(new Date(m.scheduled_at));
    return `🔖 *#${m.id}* → ${m.phone}\n💬 ${m.message}\n🕐 ${fecha}`;
  });

  await reply(message,
    `📋 *Mensajes pendientes (${pendientes.length}):*\n\n` +
    lines.join('\n\n')
  );
}

async function handleCancelar(message, text) {
  const parts = text.split(' ');
  const id = parseInt(parts[1], 10);

  if (isNaN(id)) {
    await reply(message, '❌ Uso correcto: /cancelar _<id>_\nEjemplo: /cancelar 3');
    return;
  }

  const msg = db.getMessageById(id);

  if (!msg) {
    await reply(message, `❌ No existe ningún mensaje con ID #${id}.`);
    return;
  }

  if (msg.status === 'sent') {
    await reply(message, `❌ El mensaje #${id} ya fue enviado, no se puede cancelar.`);
    return;
  }

  if (msg.status === 'failed') {
    await reply(message, `❌ El mensaje #${id} ya está marcado como fallido.`);
    return;
  }

  db.deleteMessage(id);
  await reply(message, `🗑️ Mensaje *#${id}* cancelado correctamente.`);
}

async function handleAyuda(message) {
  await reply(message,
    `🤖 *WhatsApp Scheduler Bot*\n\n` +
    `Comandos disponibles:\n\n` +
    `📅 */agendar* — Programar un mensaje nuevo\n` +
    `📋 */pendientes* — Ver mensajes programados\n` +
    `🗑️ */cancelar <id>* — Cancelar un mensaje\n` +
    `❓ */ayuda* — Mostrar este menú`
  );
}

// --- Utilidades ---

function reply(message, text) {
    // Enviar al chat del usuario sin usar el método reply para evitar el loop infinito
    return message.getChat().then(chat => chat.sendMessage(text));
}

/**
 * Convierte "28/02/2026 09:00" a objeto Date.
 * Retorna null si el formato es inválido.
 */
function parseFecha(text) {
  // Acepta DD/MM/YYYY HH:MM o DD/MM/YYYY HH:MM:SS
  const match = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return null;

  const [, dd, mm, yyyy, hh, min, ss = '00'] = match;
  const date = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`);

  // Verificar que la fecha sea válida (ej: 31/02 daría Invalid Date)
  if (isNaN(date.getTime())) return null;

  return date;
}

/**
 * Formatea un objeto Date a "28/02/2026 09:00"
 */
function formatFecha(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

module.exports = { handleMessage, setOwnerNumber };