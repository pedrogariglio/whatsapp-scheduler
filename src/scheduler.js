const cron = require('node-cron');
const db = require('./db');
const { sendMessage, isClientReady } = require('./whatsapp');

/**
 * El scheduler corre cada minuto.
 * Busca mensajes con status='pending' cuya scheduled_at ya llegó
 * y los envía uno por uno.
 */
function startScheduler() {
  // '* * * * *' → cada minuto
  cron.schedule('* * * * *', async () => {
    if (!isClientReady()) {
      // No hacer nada si WhatsApp no está conectado aún
      return;
    }

    const pending = db.getPendingMessages();

    if (pending.length === 0) return;

    console.log(`⏰ Scheduler: ${pending.length} mensaje(s) para enviar.`);

    for (const msg of pending) {
      try {
        await sendMessage(msg.phone, msg.message);
        db.markAsSent(msg.id);
        console.log(`✅ Mensaje #${msg.id} enviado a ${msg.phone}`);
      } catch (error) {
        db.markAsFailed(msg.id);
        console.error(`❌ Mensaje #${msg.id} falló:`, error.message);
      }

      // Pequeña pausa entre mensajes para no disparar anti-spam de WhatsApp
      await sleep(2000);
    }
  });

  console.log('⏱️  Scheduler iniciado (revisión cada minuto).');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startScheduler };