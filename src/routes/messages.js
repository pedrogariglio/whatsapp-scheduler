const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');

// Carpeta de uploads
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Configuracion de multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}${ext}`);
  },
});

const allowedMimes = [
  'image/jpeg', 'image/png', 'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
];

const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB max
  fileFilter: (req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  },
});

// Validacion del body
function validateMessageBody(body) {
  const { phone, message, scheduledAt } = body;
  const errors = [];
  if (!phone || !/^\d{7,15}$/.test(phone)) {
    errors.push('phone: requerido, solo digitos, sin + ni espacios (ej: 5491112345678)');
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    errors.push('message: requerido, texto no vacio');
  }
  if (!scheduledAt || isNaN(Date.parse(scheduledAt))) {
    errors.push('scheduledAt: requerido, formato ISO 8601 (ej: 2025-03-15T09:00:00)');
  }
  if (scheduledAt && new Date(scheduledAt) <= new Date()) {
    errors.push('scheduledAt: debe ser una fecha futura');
  }
  return errors;
}

// POST /api/messages — Crear mensaje programado (con o sin adjunto)
router.post('/', upload.single('attachment'), (req, res) => {
  const errors = validateMessageBody(req.body);
  if (errors.length > 0) {
    // Si habia un archivo subido, borrarlo
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ ok: false, errors });
  }

  const { phone, message, scheduledAt } = req.body;
  const attachmentPath = req.file ? req.file.path : null;

  try {
    const isoDate = new Date(scheduledAt).toISOString();
    const newMsg = db.createMessage(phone, message.trim(), isoDate, attachmentPath);
    return res.status(201).json({ ok: true, message: newMsg });
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error('Error creando mensaje:', error);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /api/messages — Listar todos los mensajes
router.get('/', (req, res) => {
  const messages = db.getAllMessages();
  return res.json({ ok: true, count: messages.length, messages });
});

// GET /api/messages/pending — Solo los pendientes
router.get('/pending', (req, res) => {
  const messages = db.getPendingMessagesList();
  return res.json({ ok: true, count: messages.length, messages });
});

// DELETE /api/messages/:id — Eliminar mensaje
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ ok: false, error: 'ID invalido' });
  }
  const existing = db.getMessageById(id);
  if (!existing) {
    return res.status(404).json({ ok: false, error: 'Mensaje no encontrado' });
  }
  if (existing.status === 'sent') {
    return res.status(409).json({ ok: false, error: 'No se puede eliminar un mensaje ya enviado' });
  }

  // Borrar el archivo adjunto si existe
  if (existing.attachment_path && fs.existsSync(existing.attachment_path)) {
    fs.unlinkSync(existing.attachment_path);
  }

  db.deleteMessage(id);
  return res.json({ ok: true, message: `Mensaje #${id} eliminado` });
});

// GET /api/events — Server-Sent Events
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