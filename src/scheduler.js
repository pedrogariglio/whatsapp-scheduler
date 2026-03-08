const cron = require('node-cron');
const db = require('./db');
const { sendMessage, isClientReady } = require('./whatsapp');

// Clientes SSE conectados (cada pestaña del navegador es un cliente)
const sseClients = new Set();

function addSseClient(res) {
  sseClients.add(res);
}

function removeSseClient(res) {
  sseClients.delete(res);
}

// Emitir evento a todos los clientes conectados
function emitEvent(type, data) {
  const payload = `data: ${JSON.stringify({ type, ...data })}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  });
}

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    if (!isClientReady()) return;

    const pending = db.getPendingMessages();
    if (pending.length === 0) return;

    console.log(`⏰ Scheduler: ${pending.length} mensaje(s) para enviar.`);

    for (const msg of pending) {
      try {
        await sendMessage(msg.phone, msg.message);
        db.markAsSent(msg.id);
        console.log(`✅ Mensaje #${msg.id} enviado a ${msg.phone}`);

        // Notificar éxito a la Web UI
        emitEvent('sent', {
          id: msg.id,
          phone: msg.phone,
          message: msg.message,
        });

      } catch (error) {
        db.markAsFailed(msg.id);
        console.error(`❌ Mensaje #${msg.id} falló:`, error.message);

        // Notificar fallo a la Web UI
        emitEvent('failed', {
          id: msg.id,
          phone: msg.phone,
          error: error.message,
        });
      }

      await sleep(2000);
    }
  });

  console.log('⏱️  Scheduler iniciado (revisión cada minuto).');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { startScheduler, addSseClient, removeSseClient };