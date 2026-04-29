const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { stateDir } = require('../config');

const MAX_MESSAGE_LENGTH = 4000;
const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

// Uploads folder
const uploadsDir = path.join(stateDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

const allowedMimeExtensions = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/msword': ['.doc'],
  'application/vnd.ms-excel': ['.xls'],
};

const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = allowedMimeExtensions[file.mimetype];

    if (allowedExtensions && allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  },
});

function safeUnlink(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;

  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    console.warn(`⚠️  No se pudo borrar archivo ${filePath}:`, error.message);
  }
}

function uploadAttachment(req, res, next) {
  upload.single('attachment')(req, res, (error) => {
    if (!error) return next();

    if (req.file) safeUnlink(req.file.path);

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ ok: false, error: 'El archivo supera el límite de 16MB' });
    }

    return res.status(400).json({ ok: false, error: error.message || 'No se pudo procesar el archivo adjunto' });
  });
}

// Sanitize phone: strip +, spaces, dashes
function sanitizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/[\s+\-]/g, '');
}

// Validate body
function validateMessageBody(body) {
  const errors = [];

  const phone = sanitizePhone(body.phone);
  if (!phone || !/^\d{10,15}$/.test(phone)) {
    errors.push('Número inválido — debe tener entre 10 y 15 dígitos con código de país (ej: 5491112345678)');
  }

  const message = body.message;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    errors.push('El mensaje no puede estar vacío');
  } else if (message.trim().length > MAX_MESSAGE_LENGTH) {
    errors.push(`El mensaje no puede superar los ${MAX_MESSAGE_LENGTH} caracteres (actual: ${message.trim().length})`);
  }

  const { scheduledAt } = body;
  if (!scheduledAt || isNaN(Date.parse(scheduledAt))) {
    errors.push('Fecha inválida — usá el formato ISO 8601 (ej: 2025-03-15T09:00:00)');
  } else {
    const scheduled = new Date(scheduledAt);
    const now = new Date();
    if (scheduled <= now) {
      errors.push('La fecha de envío debe ser futura');
    }
    if (scheduled - now > MAX_SCHEDULE_AHEAD_MS) {
      errors.push('No se puede programar un mensaje con más de 1 año de anticipación');
    }
  }

  return { errors, sanitizedPhone: phone };
}

// POST /api/messages
router.post('/', uploadAttachment, (req, res) => {
  const { errors, sanitizedPhone } = validateMessageBody(req.body);
  if (errors.length > 0) {
    if (req.file) safeUnlink(req.file.path);
    return res.status(400).json({ ok: false, errors });
  }

  const { message, scheduledAt } = req.body;
  const attachmentPath = req.file ? req.file.path : null;

  try {
    const isoDate = new Date(scheduledAt).toISOString();
    const newMsg = db.createMessage(sanitizedPhone, message.trim(), isoDate, attachmentPath);
    return res.status(201).json({ ok: true, message: newMsg });
  } catch (error) {
    if (req.file) safeUnlink(req.file.path);
    console.error('Error creating message:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// GET /api/messages
router.get('/', (req, res) => {
  const messages = db.getAllMessages();
  return res.json({ ok: true, count: messages.length, messages });
});

// GET /api/messages/pending
router.get('/pending', (req, res) => {
  const messages = db.getPendingMessagesList();
  return res.json({ ok: true, count: messages.length, messages });
});

// DELETE /api/messages/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ ok: false, error: 'ID inválido' });
  }
  const existing = db.getMessageById(id);
  if (!existing) {
    return res.status(404).json({ ok: false, error: 'Mensaje no encontrado' });
  }
  if (existing.status === 'sent') {
    return res.status(409).json({ ok: false, error: 'No se puede eliminar un mensaje ya enviado' });
  }
  if (existing.attachment_path && fs.existsSync(existing.attachment_path)) {
    safeUnlink(existing.attachment_path);
  }
  db.deleteMessage(id);
  return res.json({ ok: true, message: `Mensaje #${id} eliminado` });
});

// GET /api/events — SSE
const { addSseClient, removeSseClient } = require('../scheduler');
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  addSseClient(res);

  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); }
    catch { clearInterval(keepAlive); }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    removeSseClient(res);
  });
});

module.exports = router;
