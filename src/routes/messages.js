const express = require('express');
const router = express.Router();
const db = require('../db');

// Validación mínima del body
function validateMessageBody(body) {
  const { phone, message, scheduledAt } = body;
  const errors = [];

  if (!phone || !/^\d{7,15}$/.test(phone)) {
    errors.push('phone: requerido, solo dígitos, sin + ni espacios (ej: 5491112345678)');
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    errors.push('message: requerido, texto no vacío');
  }
  if (!scheduledAt || isNaN(Date.parse(scheduledAt))) {
    errors.push('scheduledAt: requerido, formato ISO 8601 (ej: 2025-03-15T09:00:00)');
  }
  if (scheduledAt && new Date(scheduledAt) <= new Date()) {
    errors.push('scheduledAt: debe ser una fecha futura');
  }

  return errors;
}

// POST /api/messages — Crear mensaje programado
router.post('/', (req, res) => {
  const errors = validateMessageBody(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ ok: false, errors });
  }

  const { phone, message, scheduledAt } = req.body;

  try {
    const isoDate = new Date(scheduledAt).toISOString();
    const newMsg = db.createMessage(phone, message.trim(), isoDate);
    return res.status(201).json({ ok: true, message: newMsg });
  } catch (error) {
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
    return res.status(400).json({ ok: false, error: 'ID inválido' });
  }

  const existing = db.getMessageById(id);
  if (!existing) {
    return res.status(404).json({ ok: false, error: 'Mensaje no encontrado' });
  }

  if (existing.status === 'sent') {
    return res.status(409).json({ ok: false, error: 'No se puede eliminar un mensaje ya enviado' });
  }

  db.deleteMessage(id);
  return res.json({ ok: true, message: `Mensaje #${id} eliminado` });
});

module.exports = router;