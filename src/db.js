const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'scheduler.db');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

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
  };
}

function getAllMessages() {
  const result = db.exec('SELECT * FROM messages ORDER BY scheduled_at ASC');
  return parseRows(result);
}

function getPendingMessages() {
  const now = new Date().toISOString();
  const result = db.exec(
    "SELECT * FROM messages WHERE status = 'pending' AND scheduled_at <= ?",
    [now]
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
  db.run("UPDATE messages SET status = 'sent', sent_at = datetime('now') WHERE id = ?", [id]);
  saveToDisk();
}

function markAsFailed(id) {
  db.run("UPDATE messages SET status = 'failed' WHERE id = ?", [id]);
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

function incrementRetry(id) {
  db.run("UPDATE messages SET retry_count = retry_count + 1 WHERE id = ?", [id]);
  saveToDisk();
}

function getRetryCount(id) {
  const result = db.exec("SELECT retry_count FROM messages WHERE id = ?", [id]);
  if (!result.length) return 0;
  return result[0].values[0][0] || 0;
}

function markAsRetrying(id) {
  db.run("UPDATE messages SET status = 'retrying' WHERE id = ?", [id]);
  saveToDisk();
}

module.exports = {
  initDB,
  createMessage,
  getAllMessages,
  getPendingMessages,
  getPendingMessagesList,
  getMessageById,
  markAsSent,
  markAsFailed,
  deleteMessage,
  incrementRetry,
  getRetryCount,
  markAsRetrying,
};