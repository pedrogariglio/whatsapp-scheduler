const { handleMessage, setOwnerNumber } = require('./bot');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { stateDir } = require('./config');

const CONTACTS_CACHE_PATH = path.join(stateDir, 'data', 'contacts-cache.json');
const AUTH_PATH = path.join(stateDir, '.wwebjs_auth');
const CHROME_BIN = process.env.CHROME_BIN;

// Borrado robusto cross-platform
function forceRemoveDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  try {
    if (process.platform === 'win32') {
      execSync(`rmdir /s /q "${dirPath}"`, { stdio: 'ignore' });
    } else {
      execSync(`rm -rf "${dirPath}"`, { stdio: 'ignore' });
    }
    console.log(`🗑️  Carpeta eliminada: ${dirPath}`);
  } catch (err) {
    console.warn(`⚠️  No se pudo eliminar ${dirPath}:`, err.message);
  }
}

// Load contacts cache from disk on startup
function loadContactsCacheFromDisk() {
  try {
    if (fs.existsSync(CONTACTS_CACHE_PATH)) {
      const raw = fs.readFileSync(CONTACTS_CACHE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`📒 ${parsed.length} contactos cargados desde cache en disco.`);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('⚠️  No se pudo leer el cache de contactos:', err.message);
  }
  return null;
}

// Save contacts cache to disk
function saveContactsCacheToDisk(contacts) {
  try {
    const dataDir = path.join(stateDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(CONTACTS_CACHE_PATH, JSON.stringify(contacts, null, 2));
  } catch (err) {
    console.warn('⚠️  No se pudo guardar el cache de contactos:', err.message);
  }
}

// LocalAuth guarda la sesión en .wwebjs_auth/
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: AUTH_PATH,
  }),
  puppeteer: {
    headless: true,
    ...(CHROME_BIN ? { executablePath: CHROME_BIN } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--js-flags="--max-old-space-size=512"',
    ],
  },
});

let isReady = false;
let ownerNumber = null;
let ownerLid = null;

// Cache de contactos en memoria — inicializar desde disco
let contactsCache = loadContactsCacheFromDisk();

function clearContactsCache() {
  contactsCache = null;
  // No borramos el archivo en disco — se conserva para el próximo arranque
}

client.on('qr', (qr) => {
  console.log('\n📱 Escaneá este QR con WhatsApp en tu celular:\n');
  qrcode.generate(qr, { small: true });
  console.log('\nRuta: WhatsApp > Dispositivos vinculados > Vincular dispositivo\n');
});

client.on('authenticated', () => {
  console.log('✅ Autenticado correctamente. Sesión guardada.');
});

client.on('ready', () => {
  isReady = true;
  ownerNumber = client.info.wid.user;
  ownerLid = client.info.wid._serialized.replace('@c.us', '@lid');
  console.log('🟢 WhatsApp Web listo para enviar mensajes.');
  setOwnerNumber(ownerNumber);
  // Refrescar contactos desde WhatsApp y mergear con cache en disco
  setTimeout(() => {
    refreshContacts()
      .then(c => console.log(`📒 Cache actualizado: ${c.length} contactos.`))
      .catch(err => console.warn('⚠️  No se pudo actualizar contactos:', err.message));
  }, 5000);
});

client.on('disconnected', (reason) => {
  isReady = false;
  clearContactsCache();
  console.warn('🔴 Cliente desconectado:', reason);

  if (reason === 'LOGOUT') {
    forceRemoveDir(AUTH_PATH);
    console.log('🗑️  Sesion eliminada. Reinicia para escanear el QR de nuevo.');
    return;
  }

  // Reconexión automática solo si fue desconexión inesperada
  setTimeout(() => {
    console.log('🔄 Intentando reconectar...');
    client.initialize().catch(e => console.error('❌ Error reconectando:', e.message));
  }, 10000);
});

client.on('auth_failure', (msg) => {
  console.error('❌ Error de autenticación:', msg);
  console.error('Borrá la carpeta .wwebjs_auth y reiniciá para escanear el QR de nuevo.');
});

async function sendMessage(phone, message) {
  if (!isReady) {
    throw new Error('El cliente de WhatsApp no está listo todavía.');
  }
  const chatId = `${phone}@c.us`;
  try {
    await client.sendMessage(chatId, message);
    console.log(`📤 Mensaje enviado a ${phone}`);
  } catch (error) {
    console.error(`❌ Error enviando a ${phone}:`, error.message);
    throw error;
  }
}

function isClientReady() {
  return isReady;
}

// Flag para evitar loop
let botIsReplying = false;

client.on('message_create', async (message) => {
  if (!message.fromMe) return;
  if (message.hasQuotedMsg) return;
  if (botIsReplying) return;

  const ownCus = client.info.wid._serialized;
  const remote = message.id.remote;
  const from = message.from;

  const isOwnChat = remote === ownCus || (remote.endsWith('@lid') && from === ownCus);
  if (!isOwnChat) return;

  botIsReplying = true;
  try {
    await handleMessage(message, client);
  } finally {
    setTimeout(() => { botIsReplying = false; }, 1000);
  }
});

function getClient() {
  return client;
}

// Carga contactos frescos desde WhatsApp y hace merge con cache en disco
async function refreshContacts() {
  const [contacts, chats] = await Promise.all([
    client.getContacts(),
    client.getChats(),
  ]);

  const diskCache = loadContactsCacheFromDisk() || [];
  const seen = new Map();

  for (const c of diskCache) {
    seen.set(c.name, c);
  }

  for (const c of contacts) {
    if (!c.name || c.isGroup || c.isMe || !c.number) continue;
    if (!seen.has(c.name) || c.number.length < seen.get(c.name).phone.length) {
      seen.set(c.name, { name: c.name, phone: c.number });
    }
  }

  for (const c of chats) {
    if (c.isGroup || !c.name || !c.id.user) continue;
    if (!seen.has(c.name)) {
      seen.set(c.name, { name: c.name, phone: c.id.user });
    }
  }

  const merged = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  contactsCache = merged;
  saveContactsCacheToDisk(merged);
  return merged;
}

async function getContacts() {
  if (contactsCache) return contactsCache;
  if (isReady) return refreshContacts();
  const disk = loadContactsCacheFromDisk();
  if (disk) return disk;
  return [];
}

async function initializeClient() {
  try {
    await client.initialize();
  } catch (err) {
    if (err.message && err.message.includes('Execution context was destroyed')) {
      console.warn('⚠️  Chromium crasheó durante la inicialización. Limpiando sesión y reintentando...');
      forceRemoveDir(AUTH_PATH);
      setTimeout(() => {
        console.log('🔄 Reintentando inicialización...');
        client.initialize().catch(e => console.error('❌ Error en reintento:', e.message));
      }, 5000);
    } else {
      console.error('❌ Error iniciando cliente WhatsApp:', err.message);
    }
  }
}

module.exports = { client, sendMessage, isClientReady, getClient, getContacts, getOwnerNumber: () => ownerNumber, initializeClient };
