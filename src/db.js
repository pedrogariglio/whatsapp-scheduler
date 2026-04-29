const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { stateDir } = require('./config');

const dataDir = path.join(stateDir, 'data');
const dbPath = path.join(dataDir, 'scheduler.db');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db;

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      phone           TEXT    NOT NULL,
      message         TEXT    NOT NULL,
      scheduled_at    TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      sent_at         TEXT,
      attachment_path TEXT    DEFAULT NULL
    )
  `);

  try {
    db.run("ALTER TABLE messages ADD COLUMN attachment_path TEXT DEFAULT NULL");
  } catch {
    // columna ya existe
  }
  try {
    db.run("ALTER TABLE messages ADD COLUMN retry_count INTEGER DEFAULT 0");
  } catch {
    // columna ya existe
  }
  try {
    db.run("ALTER TABLE messages ADD COLUMN next_retry_at TEXT DEFAULT NULL");
  } catch {
    // columna ya existe
  }

  saveToDisk();
  console.log('Base de datos lista.');
}

function saveToDisk() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function createMessage(phone, message, scheduledAt, attachmentPath = null) {
  db.run(
    'INSERT INTO messages (phone, message, scheduled_at, attachment_path) VALUES (?, ?, ?, ?)',
    [phone, message, scheduledAt, attachmentPath]
  );

  const result = db.exec('SELECT last_insert_rowid() as id');
  const id = result[0].values[0][0];

  saveToDisk();

  return {
    id,
    phone,
    message,
    scheduled_at: scheduledAt,
    status: 'pending',
    created_at: new Date().toISOString(),
    sent_at: null,
    attachment_path: attachmentPath,
    retry_count: 0,
    next_retry_at: null,
  };
}

function getAllMessages() {
  const result = db.exec('SELECT * FROM messages ORDER BY scheduled_at ASC');
  return parseRows(result);
}

function getDispatchableMessages() {
  const now = new Date().toISOString();
  const result = db.exec(
    `SELECT * FROM messages
     WHERE (status = 'pending' AND scheduled_at <= ?)
        OR (status = 'retrying' AND (next_retry_at IS NULL OR next_retry_at <= ?))
     ORDER BY scheduled_at ASC, id ASC`,
    [now, now]
  );
  return parseRows(result);
}

function getPendingMessagesList() {
  const result = db.exec(
    "SELECT * FROM messages WHERE status IN ('pending', 'retrying') ORDER BY scheduled_at ASC"
  );
  return parseRows(result);
}

function getMessageById(id) {
  const result = db.exec('SELECT * FROM messages WHERE id = ?', [id]);
  const rows = parseRows(result);
  return rows.length > 0 ? rows[0] : null;
}

function markAsSent(id) {
  db.run(
    "UPDATE messages SET status = 'sent', sent_at = datetime('now'), next_retry_at = NULL WHERE id = ?",
    [id]
  );
  saveToDisk();
}

function markAsFailed(id) {
  db.run("UPDATE messages SET status = 'failed', next_retry_at = NULL WHERE id = ?", [id]);
  saveToDisk();
}

function deleteMessage(id) {
  db.run('DELETE FROM messages WHERE id = ?', [id]);
  saveToDisk();
  return true;
}

function parseRows(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function scheduleRetry(id, nextRetryAt) {
  db.run(
    "UPDATE messages SET retry_count = retry_count + 1, status = 'retrying', next_retry_at = ? WHERE id = ?",
    [nextRetryAt, id]
  );
  saveToDisk();
}

function getRetryCount(id) {
  const result = db.exec("SELECT retry_count FROM messages WHERE id = ?", [id]);
  if (!result.length) return 0;
  return result[0].values[0][0] || 0;
}

function markAsPending(id) {
  db.run("UPDATE messages SET status = 'pending', next_retry_at = NULL WHERE id = ?", [id]);
  saveToDisk();
}

module.exports = {
  initDB,
  createMessage,
  getAllMessages,
  getDispatchableMessages,
  getPendingMessagesList,
  getMessageById,
  markAsSent,
  markAsFailed,
  deleteMessage,
  scheduleRetry,
  getRetryCount,
  markAsPending,
};
