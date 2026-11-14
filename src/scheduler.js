'use strict';

const cron = require('node-cron');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');
const realDb = require('./db');
const realWhatsapp = require('./whatsapp');

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 30 * 1000; // 30 seconds
const MESSAGE_DELAY_MS = 2000;

const sseClients = new Set();

function addSseClient(res) {
  sseClients.add(res);
}

function removeSseClient(res) {
  sseClients.delete(res);
}

function defaultEmitEvent(type, data) {
  const payload = `data: ${JSON.stringify({ type, ...data })}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  });
}

function createScheduler({
  db = realDb,
  sendMessage = realWhatsapp.sendMessage,
  isClientReady = realWhatsapp.isClientReady,
  getClient = realWhatsapp.getClient,
  sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  emitEvent = defaultEmitEvent,
  fsModule = fs,
  messageMedia = MessageMedia,
  logger = console,
  now = () => new Date(),
  retryDelayMs = RETRY_DELAY_MS,
  maxRetries = MAX_RETRIES,
  messageDelayMs = MESSAGE_DELAY_MS,
} = {}) {
  let schedulerRunning = false;

  async function sendWhatsappMessage(msg) {
    if (msg.attachment_path) {
      if (!fsModule.existsSync(msg.attachment_path)) {
        throw new Error('Attachment file not found');
      }
      const media = messageMedia.fromFilePath(msg.attachment_path);
      const client = getClient();
      const chatId = `${msg.phone}@c.us`;
      await client.sendMessage(chatId, media, { caption: msg.message });
    } else {
      await sendMessage(msg.phone, msg.message);
    }
  }

  function cleanupAttachment(msg) {
    if (!msg.attachment_path || !fsModule.existsSync(msg.attachment_path)) return;

    try {
      fsModule.unlinkSync(msg.attachment_path);
    } catch (error) {
      logger.warn(`⚠️  Could not remove attachment for message #${msg.id}:`, error.message);
    }
  }

  async function attemptSend(msg) {
    const retryCount = db.getRetryCount(msg.id);

    try {
      await sendWhatsappMessage(msg);
      db.markAsSent(msg.id);
      cleanupAttachment(msg);
      logger.log(`✅ Message #${msg.id} sent to ${msg.phone}`);
      emitEvent('sent', { id: msg.id, phone: msg.phone, message: msg.message });

    } catch (error) {
      logger.error(`❌ Message #${msg.id} failed (attempt ${retryCount + 1}/${maxRetries + 1}):`, error.message);

      if (retryCount < maxRetries) {
        const nextRetryAt = new Date(now().getTime() + retryDelayMs).toISOString();
        db.scheduleRetry(msg.id, nextRetryAt);
        logger.log(`🔄 Message #${msg.id} scheduled to retry at ${nextRetryAt}.`);

      } else {
        db.markAsFailed(msg.id);
        cleanupAttachment(msg);
        logger.error(`💀 Message #${msg.id} permanently failed after ${maxRetries + 1} attempts.`);
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

      logger.log(`⏰ Scheduler: ${pending.length} message(s) to send.`);

      for (const msg of pending) {
        const freshMsg = db.getMessageById(msg.id);
        if (!freshMsg || !['pending', 'retrying'].includes(freshMsg.status)) continue;

        if (freshMsg.status === 'retrying') {
          db.markAsPending(freshMsg.id);
        }

        await attemptSend({ ...freshMsg, status: 'pending', next_retry_at: null });
        await sleep(messageDelayMs);
      }
    } finally {
      schedulerRunning = false;
    }
  }

  return {
    processDueMessages,
    attemptSend,
    sendWhatsappMessage,
    cleanupAttachment,
    isRunning: () => schedulerRunning,
  };
}

const defaultScheduler = createScheduler();

function startScheduler() {
  cron.schedule('*/15 * * * * *', defaultScheduler.processDueMessages);
  setTimeout(() => {
    defaultScheduler.processDueMessages()
      .catch(err => console.error('❌ Scheduler bootstrap failed:', err.message));
  }, 3000);

  console.log('⏱️  Scheduler started (checking every 15 seconds).');
}

module.exports = {
  startScheduler,
  addSseClient,
  removeSseClient,
  createScheduler,
  MAX_RETRIES,
  RETRY_DELAY_MS,
};
