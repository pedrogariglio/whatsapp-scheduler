const { handleMessage, setOwnerNumber } = require('./bot');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

// LocalAuth guarda la sesión en .wwebjs_auth/
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '..', '.wwebjs_auth'),
  }),
  puppeteer: {
    headless: true,
    ...(process.platform === 'linux' && {
      executablePath: '/usr/bin/chromium-browser',
    }),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  },
});

let isReady = false;
let ownerNumber = null;
let ownerLid = null;

// Cache de contactos en memoria
let contactsCache = null;

function clearContactsCache() {
  contactsCache = null;
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
  ownerLid = client.info.wid._serialized.replace('@c.us', '@lid'); // puede no coincidir
  console.log('🟢 WhatsApp Web listo para enviar mensajes.');
  setOwnerNumber(ownerNumber);
  getContacts().then(c => console.log(`📒 ${c.length} contactos cargados en cache.`));
});

client.on('disconnected', (reason) => {
  isReady = false;
  clearContactsCache();
  console.warn('🔴 Cliente desconectado:', reason);

  // Si el usuario cerró sesión desde el móvil, borrar la sesión guardada
  if (reason === 'LOGOUT') {
    const authPath = path.join(__dirname, '..', '.wwebjs_auth');
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log('🗑️  Sesion eliminada. Reinicia para escanear el QR de nuevo.');
    }
    return; // No reconectar automaticamente tras logout
  }

  // Reconexión automática solo si fue desconexión inesperada
  setTimeout(() => {
    console.log('🔄 Intentando reconectar...');
    client.initialize();
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

// Flag para evitar loop: mientras el bot está respondiendo, ignorar nuevos mensajes
let botIsReplying = false;

client.on('message_create', async (message) => {
  if (!message.fromMe) return;
  if (message.hasQuotedMsg) return;
  if (botIsReplying) return;

  const ownCus = client.info.wid._serialized;
  const remote = message.id.remote;
  const from = message.from;

  // Es el chat con uno mismo si:
  // - remote es mi propio @c.us, O
  // - remote es cualquier @lid Y from es mi propio @c.us
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

async function getContacts() {
  if (!isReady) return [];

  // Devolver cache si ya existe
  if (contactsCache) return contactsCache;

  const [contacts, chats] = await Promise.all([
    client.getContacts(),
    client.getChats(),
  ]);

  const seen = new Map();

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

  contactsCache = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  return contactsCache;
}

module.exports = { client, sendMessage, isClientReady, getClient, getContacts, getOwnerNumber: () => ownerNumber };