const cron = require('node-cron');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');
const db = require('./db');
const { sendMessage, isClientReady, getClient } = require('./whatsapp');

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 30 * 1000; // 30 seconds

const sseClients = new Set();

function addSseClient(res) {
  sseClients.add(res);
}

function removeSseClient(res) {
  sseClients.delete(res);
}

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

async function sendWhatsappMessage(msg) {
  if (msg.attachment_path && fs.existsSync(msg.attachment_path)) {
    const media = MessageMedia.fromFilePath(msg.attachment_path);
    const client = getClient();
    const chatId = `${msg.phone}@c.us`;
    await client.sendMessage(chatId, media, { caption: msg.message });
  } else {
    await sendMessage(msg.phone, msg.message);
  }
}

async function attemptSend(msg) {
  const retryCount = db.getRetryCount(msg.id);

  try {
    await sendWhatsappMessage(msg);
    db.markAsSent(msg.id);
    console.log(`✅ Message #${msg.id} sent to ${msg.phone}`);
    emitEvent('sent', { id: msg.id, phone: msg.phone, message: msg.message });

  } catch (error) {
    console.error(`❌ Message #${msg.id} failed (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error.message);

    if (retryCount < MAX_RETRIES) {
      db.incrementRetry(msg.id);
      db.markAsRetrying(msg.id); // cron ignores 'retrying' messages
      console.log(`🔄 Message #${msg.id} will retry in 30 seconds...`);

      setTimeout(async () => {
        const freshMsg = db.getMessageById(msg.id);
        // Only retry if still in retrying state (not manually deleted)
        if (freshMsg && freshMsg.status === 'retrying') {
          await attemptSend(freshMsg);
        }
      }, RETRY_DELAY_MS);

    } else {
      db.markAsFailed(msg.id);
      console.error(`💀 Message #${msg.id} permanently failed after ${MAX_RETRIES + 1} attempts.`);
      emitEvent('failed', { id: msg.id, phone: msg.phone, error: error.message });
    }
  }
}

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    if (!isClientReady()) return;

    const pending = db.getPendingMessages();
    if (pending.length === 0) return;

    console.log(`⏰ Scheduler: ${pending.length} message(s) to send.`);

    for (const msg of pending) {
      await attemptSend(msg);
      await sleep(2000);
    }
  });

  console.log('⏱️  Scheduler started (checking every minute).');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { startScheduler, addSseClient, removeSseClient };