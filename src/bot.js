const db = require('./db');

const sessions = {};
let ownerNumber = null;

function setOwnerNumber(number) {
  ownerNumber = number;
  console.log(`🤖 Bot activo. Escuchando mensajes de: ${number}`);
}

async function handleMessage(message, client) {
  const senderId = message.from.replace('@c.us', '').replace('@lid', '');

  if (!ownerNumber || senderId !== ownerNumber) return;
  if (message.from.includes('@g.us')) return;

  const text = message.body.trim();
  const session = sessions[senderId] || { step: 'idle', data: {} };

  if (text === '/agendar') {
    sessions[senderId] = { step: 'esperando_numero', data: {} };
    await reply(message, client,
      '📱 ¿A qué número querés enviar el mensaje?\n' +
      'Con código de país, sin + ni espacios.\n' +
      'Ejemplo: _5491112345678_'
    );
    return;
  }

  if (text === '/pendientes') {
    await handlePendientes(message, client);
    return;
  }

  if (text.startsWith('/cancelar')) {
    await handleCancelar(message, client, text);
    return;
  }

  if (text === '/ayuda' || text === '/start') {
    await handleAyuda(message, client);
    return;
  }

  if (session.step === 'esperando_numero') {
    if (!/^\d{7,15}$/.test(text)) {
      await reply(message, client,
        '❌ Número inválido. Solo dígitos, sin + ni espacios.\n' +
        'Ejemplo: _5491112345678_'
      );
      return;
    }
    sessions[senderId] = { step: 'esperando_mensaje', data: { phone: text } };
    await reply(message, client, '💬 ¿Cuál es el mensaje que querés enviar?');
    return;
  }

  if (session.step === 'esperando_mensaje') {
    if (text.length === 0) {
      await reply(message, client, '❌ El mensaje no puede estar vacío.');
      return;
    }
    sessions[senderId] = {
      step: 'esperando_fecha',
      data: { ...session.data, message: text },
    };
    await reply(message, client,
      '🕐 ¿Cuándo querés enviarlo?\n' +
      'Formato: _DD/MM/YYYY HH:MM_\n' +
      'Ejemplo: _28/02/2026 09:00_'
    );
    return;
  }

  if (session.step === 'esperando_fecha') {
    const scheduledAt = parseFecha(text);
    if (!scheduledAt) {
      await reply(message, client,
        '❌ Fecha inválida. Usá el formato: _DD/MM/YYYY HH:MM_\n' +
        'Ejemplo: _28/02/2026 09:00_'
      );
      return;
    }
    if (scheduledAt <= new Date()) {
      await reply(message, client, '❌ La fecha debe ser futura.');
      return;
    }

    const { phone, message: msgText } = session.data;
    const newMsg = db.createMessage(phone, msgText, scheduledAt.toISOString());
    sessions[senderId] = { step: 'idle', data: {} };

    await reply(message, client,
      `✅ *Mensaje programado correctamente*\n\n` +
      `📱 Para: ${phone}\n` +
      `💬 Mensaje: ${msgText}\n` +
      `🕐 Envío: ${formatFecha(scheduledAt)}\n` +
      `🔖 ID: #${newMsg.id}`
    );
    return;
  }

  if (session.step !== 'idle') {
    await reply(message, client, '❌ No entendí la respuesta. Escribí /ayuda para ver los comandos disponibles.');
    return;
  }

  if (text.startsWith('/')) {
    await handleAyuda(message, client);
  }
}

async function handlePendientes(message, client) {
  const pendientes = db.getPendingMessagesList();

  if (pendientes.length === 0) {
    await reply(message, client, '📋 No tenés mensajes pendientes.');
    return;
  }

  const lines = pendientes.map((m) => {
    const fecha = formatFecha(new Date(m.scheduled_at));
    return `🔖 *#${m.id}* → ${m.phone}\n💬 ${m.message}\n🕐 ${fecha}`;
  });

  await reply(message, client,
    `📋 *Mensajes pendientes (${pendientes.length}):*\n\n` +
    lines.join('\n\n')
  );
}

async function handleCancelar(message, client, text) {
  const parts = text.split(' ');
  const id = parseInt(parts[1], 10);

  if (isNaN(id)) {
    await reply(message, client, '❌ Uso correcto: /cancelar _<id>_\nEjemplo: /cancelar 3');
    return;
  }

  const msg = db.getMessageById(id);

  if (!msg) {
    await reply(message, client, `❌ No existe ningún mensaje con ID #${id}.`);
    return;
  }

  if (msg.status === 'sent') {
    await reply(message, client, `❌ El mensaje #${id} ya fue enviado, no se puede cancelar.`);
    return;
  }

  if (msg.status === 'failed') {
    await reply(message, client, `❌ El mensaje #${id} ya está marcado como fallido.`);
    return;
  }

  db.deleteMessage(id);
  await reply(message, client, `🗑️ Mensaje *#${id}* cancelado correctamente.`);
}

async function handleAyuda(message, client) {
  await reply(message, client,
    `🤖 *WhatsApp Scheduler Bot*\n\n` +
    `Comandos disponibles:\n\n` +
    `📅 */agendar* — Programar un mensaje nuevo\n` +
    `📋 */pendientes* — Ver mensajes programados\n` +
    `🗑️ */cancelar <id>* — Cancelar un mensaje\n` +
    `❓ */ayuda* — Mostrar este menú`
  );
}

function reply(message, client, text) {
  // Enviar siempre al chat propio usando el cliente directamente
  const ownChatId = message.from;
  return client.sendMessage(ownChatId, text);
}

function parseFecha(text) {
  const match = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return null;

  const [, dd, mm, yyyy, hh, min, ss = '00'] = match;
  const date = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`);

  if (isNaN(date.getTime())) return null;

  return date;
}

function formatFecha(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

module.exports = { handleMessage, setOwnerNumber };
