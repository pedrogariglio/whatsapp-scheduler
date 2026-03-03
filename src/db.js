const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Asegura que la carpeta data/ exista
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'scheduler.db'));

// Crea la tabla si no existe
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    phone     TEXT    NOT NULL,
    message   TEXT    NOT NULL,
    scheduled_at TEXT NOT NULL,   -- ISO 8601: "2025-03-15T09:00:00"
    status    TEXT    NOT NULL DEFAULT 'pending', -- pending | sent | failed
    created_at TEXT   NOT NULL DEFAULT (datetime('now')),
    sent_at   TEXT
  )
`);

// --- Queries reutilizables ---

function createMessage(phone, message, scheduledAt) {
  const stmt = db.prepare(
    'INSERT INTO messages (phone, message, scheduled_at) VALUES (?, ?, ?)'
  );
  const result = stmt.run(phone, message, scheduledAt);
  return getMessageById(result.lastInsertRowid);
}

function getAllMessages() {
  return db.prepare('SELECT * FROM messages ORDER BY scheduled_at ASC').all();
}

function getPendingMessages() {
  // Trae los pendientes cuya hora ya pasó o es ahora
  const now = new Date().toISOString();
  return db.prepare(
    "SELECT * FROM messages WHERE status = 'pending' AND scheduled_at <= ?"
  ).all(now);
}

function getPendingMessagesList() {
  return db.prepare(
    "SELECT * FROM messages WHERE status = 'pending' ORDER BY scheduled_at ASC"
  ).all();
}

function getMessageById(id) {
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

function markAsSent(id) {
  db.prepare(
    "UPDATE messages SET status = 'sent', sent_at = datetime('now') WHERE id = ?"
  ).run(id);
}

function markAsFailed(id) {
  db.prepare("UPDATE messages SET status = 'failed' WHERE id = ?").run(id);
}

function deleteMessage(id) {
  const result = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  return result.changes > 0;
}

module.exports = {
  createMessage,
  getAllMessages,
  getPendingMessages,
  getPendingMessagesList,
  getMessageById,
  markAsSent,
  markAsFailed,
  deleteMessage,
};