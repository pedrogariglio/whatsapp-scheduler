const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Carpeta y archivo de la base de datos
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'scheduler.db');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

let db; // instancia de la BD en memoria

/**
 * Inicializa sql.js, carga la BD desde disco si existe,
 * o crea una nueva. Debe llamarse antes de cualquier query.
 */
async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    // Cargar BD existente desde disco
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    // Crear BD nueva en memoria
    db = new SQL.Database();
  }

  // Crear tabla si no existe
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phone       TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      scheduled_at TEXT   NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'pending',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      sent_at     TEXT
    )
  `);

  // Guardar estado inicial en disco
  saveToDisk();

  console.log('🗄️  Base de datos lista.');
}

/**
 * Persiste la BD en memoria al archivo en disco.
 * Llamar después de cada operación de escritura.
 */
function saveToDisk() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// --- Queries ---

function createMessage(phone, message, scheduledAt) {
  db.run(
    'INSERT INTO messages (phone, message, scheduled_at) VALUES (?, ?, ?)',
    [phone, message, scheduledAt]
  );
  saveToDisk();

  // Obtener el último registro insertado
  const result = db.exec('SELECT last_insert_rowid() as id');
  const id = result[0].values[0][0];
  
  // Guardar la BD en disco después de obtener el ID
  saveToDisk();

  // Construir el objeto del mensaje creado sin una segunda consulta a la BD
  return {
    id,
    phone,
    message,
    scheduledAt,
    status: 'pending',
    createdAt: new Date().toISOString(),
    sentAt: null,
  }

  return getMessageById(id); // Devolver el mensaje creado
}

function getAllMessages() {
  const result = db.exec(
    'SELECT * FROM messages ORDER BY scheduled_at ASC'
  );
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
    "SELECT * FROM messages WHERE status = 'pending' ORDER BY scheduled_at ASC"
  );
  return parseRows(result);
}

function getMessageById(id) {
  const result = db.exec(
    'SELECT * FROM messages WHERE id = ?',
    [id]
  );
  const rows = parseRows(result);
  return rows.length > 0 ? rows[0] : null;
}

function markAsSent(id) {
  db.run(
    "UPDATE messages SET status = 'sent', sent_at = datetime('now') WHERE id = ?",
    [id]
  );
  saveToDisk();
}

function markAsFailed(id) {
  db.run(
    "UPDATE messages SET status = 'failed' WHERE id = ?",
    [id]
  );
  saveToDisk();
}

function deleteMessage(id) {
  db.run('DELETE FROM messages WHERE id = ?', [id]);
  saveToDisk();
  return true;
}

// --- Utilidad para convertir resultado de sql.js a array de objetos ---
function parseRows(result) {
  if (!result || result.length === 0) return [];

  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
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
};