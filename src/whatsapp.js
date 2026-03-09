const { handleMessage, setOwnerNumber } = require('./bot');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

// LocalAuth guarda la sesión en .wwebjs_auth/
// así no tenés que escanear el QR cada vez que reiniciás
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '..', '.wwebjs_auth'),
  }),
  puppeteer: {
    // headless: true → sin ventana del navegador
    // En Windows, headless: 'new' es más estable en versiones recientes
    headless: true,
    // En Linux utilizo el Chromium del sistema, en Windows el de Puppeteer
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

// Estado de conexión (para que el scheduler sepa si puede enviar)
let isReady = false;
// Número del propio usuario — el bot solo escucha mensajes de él mismo.
let ownerNumber = null;

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
    ownerNumber = client.info.wid.user; // guarda en variable del módulo
    console.log('🟢 WhatsApp Web listo para enviar mensajes.');
    // para debug, puedo ver el _serialized de mi propio número
    //console.log('wid completo:', JSON.stringify(client.info.wid)) 
    setOwnerNumber(ownerNumber);
  });

client.on('disconnected', (reason) => {
  isReady = false;
  console.warn('🔴 Cliente desconectado:', reason);
  // Intento de reconexión automática
  setTimeout(() => {
    console.log('🔄 Intentando reconectar...');
    client.initialize();
  }, 10000);
});

client.on('auth_failure', (msg) => {
  console.error('❌ Error de autenticación:', msg);
  console.error('Borrá la carpeta .wwebjs_auth y reiniciá para escanear el QR de nuevo.');
});

/**
 * Envía un mensaje de WhatsApp.
 * @param {string} phone - Número sin + ni espacios, con código de país. Ej: "5491112345678"
 * @param {string} message - Texto del mensaje
 * @returns {Promise<void>}
 */
async function sendMessage(phone, message) {
  if (!isReady) {
    throw new Error('El cliente de WhatsApp no está listo todavía.');
  }

  // whatsapp-web.js espera el formato: "5491112345678@c.us"
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
// Evento para detectar mensajes propios en el chat con uno mismo, si el mensaje es del scheduler, se procesa.
// Los chats con terceros usan id.remote en formato @c.us
// El chat con uno mismo tiene id.remote en formato @lid (identificador interno)
client.on('message_create', (message) => {
    if (!message.fromMe) return;
    if (message.hasQuotedMsg) return;

    const ownSerialized = client.info.wid._serialized;
    const ownLid = client.info.wid._serialized
      .replace('@c.us', '@lid');


  const remote = message.id.remote;
  const isOwnChat =
    remote === ownSerialized ||
    remote.endsWith('@lid') && message.from === ownSerialized;

  if (!isOwnChat) return;

  handleMessage(message, client);
});

function getClient() {
  return client;
}

async function getContacts() {
  if (!isReady) return [];

  const [contacts, chats] = await Promise.all([
    client.getContacts(),
    client.getChats(),
  ]);

  const seen = new Map(); // name → contact

  // Primero agregar contactos de agenda
  for (const c of contacts) {
    if (!c.name || c.isGroup || c.isMe || !c.number) continue;
    // Preferir números que empiecen con dígitos locales (descartar @lid internos)
    if (!seen.has(c.name) || c.number.length < seen.get(c.name).phone.length) {
      seen.set(c.name, { name: c.name, phone: c.number });
    }
  }

  // Luego agregar chats recientes que no estén en agenda
  for (const c of chats) {
    if (c.isGroup || !c.name || !c.id.user) continue;
    if (!seen.has(c.name)) {
      seen.set(c.name, { name: c.name, phone: c.id.user });
    }
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Inicializar el cliente
//client.initialize();

module.exports = { client, sendMessage, isClientReady, getClient, getContacts, getOwnerNumber: () => ownerNumber };