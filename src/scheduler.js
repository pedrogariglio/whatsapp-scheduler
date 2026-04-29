const cron = require('node-cron');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');
const db = require('./db');
const { sendMessage, isClientReady, getClient } = require('./whatsapp');

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 30 * 1000; // 30 seconds
let schedulerRunning = false;

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
  if (msg.attachment_path) {
    if (!fs.existsSync(msg.attachment_path)) {
      throw new Error('Attachment file not found');
    }
    const media = MessageMedia.fromFilePath(msg.attachment_path);
    const client = getClient();
    const chatId = `${msg.phone}@c.us`;
    await client.sendMessage(chatId, media, { caption: msg.message });
  } else {
    await sendMessage(msg.phone, msg.message);
  }
}

function cleanupAttachment(msg) {
  if (!msg.attachment_path || !fs.existsSync(msg.attachment_path)) return;

  try {
    fs.unlinkSync(msg.attachment_path);
  } catch (error) {
    console.warn(`⚠️  Could not remove attachment for message #${msg.id}:`, error.message);
  }
}

async function attemptSend(msg) {
  const retryCount = db.getRetryCount(msg.id);

  try {
    await sendWhatsappMessage(msg);
    db.markAsSent(msg.id);
    cleanupAttachment(msg);
    console.log(`✅ Message #${msg.id} sent to ${msg.phone}`);
    emitEvent('sent', { id: msg.id, phone: msg.phone, message: msg.message });

  } catch (error) {
    console.error(`❌ Message #${msg.id} failed (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error.message);

    if (retryCount < MAX_RETRIES) {
      const nextRetryAt = new Date(Date.now() + RETRY_DELAY_MS).toISOString();
      db.scheduleRetry(msg.id, nextRetryAt);
      console.log(`🔄 Message #${msg.id} scheduled to retry at ${nextRetryAt}.`);

    } else {
      db.markAsFailed(msg.id);
      cleanupAttachment(msg);
      console.error(`💀 Message #${msg.id} permanently failed after ${MAX_RETRIES + 1} attempts.`);
      emitEvent('failed', { id: msg.id, phone: msg.phone, error: error.message });
    }
  }
}

async function processDueMessages() {
  if (schedulerRunning || !isClientReady()) return;

  schedulerRunning = true;
  try {
    const pending = db.getDispatchableMessages();
    if (pending.length === 0) return;

    console.log(`⏰ Scheduler: ${pending.length} message(s) to send.`);

    for (const msg of pending) {
      const freshMsg = db.getMessageById(msg.id);
      if (!freshMsg || !['pending', 'retrying'].includes(freshMsg.status)) continue;

      if (freshMsg.status === 'retrying') {
        db.markAsPending(freshMsg.id);
      }

      await attemptSend({ ...freshMsg, status: 'pending', next_retry_at: null });
      await sleep(2000);
    }
  } finally {
    schedulerRunning = false;
  }
}

function startScheduler() {
  cron.schedule('*/15 * * * * *', processDueMessages);
  setTimeout(() => {
    processDueMessages().catch(err => console.error('❌ Scheduler bootstrap failed:', err.message));
  }, 3000);

  console.log('⏱️  Scheduler started (checking every 15 seconds).');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { startScheduler, addSseClient, removeSseClient };
