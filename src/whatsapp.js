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
const WA_WEB_VERSION = process.env.WA_WEB_VERSION;
const WA_WEB_CACHE_REMOTE_PATH = process.env.WA_WEB_CACHE_REMOTE_PATH;
const READY_TIMEOUT_MS = 90 * 1000;
const REINIT_DELAY_MS = 10 * 1000;
const MAX_STALL_RETRIES = 3;

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
const webVersionOptions = WA_WEB_VERSION
  ? {
      webVersion: WA_WEB_VERSION,
      webVersionCache: {
        type: 'remote',
        remotePath: WA_WEB_CACHE_REMOTE_PATH,
        strict: true,
      },
    }
  : { webVersionCache: { type: 'none' } };

const client = new Client({
  ...webVersionOptions,
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

const originalInitWebVersionCache = client.initWebVersionCache.bind(client);
client.initWebVersionCache = async function initWebVersionCacheFresh() {
  if (this.pupPage) {
    await this.pupPage.setBypassServiceWorker(true).catch((err) => {
      console.warn('⚠️  No se pudo desactivar el service worker:', err.message);
    });
    await this.pupPage.setCacheEnabled(false).catch((err) => {
      console.warn('⚠️  No se pudo desactivar la caché HTTP:', err.message);
    });
  }
  return originalInitWebVersionCache();
};

let isReady = false;
let ownerNumber = null;
let ownerLid = null;
let isInitializing = false;
let readyTimeout = null;
let reinitTimeout = null;
let stallRetryCount = 0;
let restartRequested = false;

// Cache de contactos en memoria — inicializar desde disco
let contactsCache = loadContactsCacheFromDisk();

function clearContactsCache() {
  contactsCache = null;
  // No borramos el archivo en disco — se conserva para el próximo arranque
}

function clearReadyTimeout() {
  if (readyTimeout) {
    clearTimeout(readyTimeout);
    readyTimeout = null;
  }
}

function clearReinitTimeout() {
  if (reinitTimeout) {
    clearTimeout(reinitTimeout);
    reinitTimeout = null;
  }
}

function scheduleReadyWatchdog(context) {
  clearReadyTimeout();
  readyTimeout = setTimeout(() => {
    if (isReady) return;

    stallRetryCount += 1;
    console.warn(
      `⚠️  WhatsApp quedó autenticado pero no listo tras ${READY_TIMEOUT_MS / 1000}s (${context}). Reintento ${stallRetryCount}/${MAX_STALL_RETRIES}.`
    );

    if (stallRetryCount > MAX_STALL_RETRIES) {
      console.error('❌ El cliente no logra llegar a ready luego de varios reintentos. Reiniciá el servicio y, si persiste, relinkeá la sesión.');
      return;
    }

    scheduleReinitialize('ready-timeout');
  }, READY_TIMEOUT_MS);
}

function scheduleReinitialize(reason, delayMs = REINIT_DELAY_MS) {
  if (reinitTimeout) return;

  clearReadyTimeout();
  reinitTimeout = setTimeout(() => {
    reinitTimeout = null;
    if (restartRequested) return;

    restartRequested = true;
    isReady = false;
    isInitializing = false;
    console.error(`🔄 Reiniciando proceso del contenedor (${reason})...`);

    // Reinitializing the same whatsapp-web.js Client after destroy() can leave
    // Puppeteer page bindings behind (for example onQRChangedEvent). A fresh
    // Node process guarantees a fresh Client and Chromium page instead.
    setTimeout(() => process.exit(1), 100);
  }, delayMs);
}

function installUnhandledRejectionListener(page, attempt = 0) {
  if (!page) return;
  page.evaluate(() => {
    if (window.__waSchedulerUnhandled) return;
    window.__waSchedulerUnhandled = true;
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const detail = reason && (reason.stack || reason.message || String(reason));
      console.error(`[wa-scheduler unhandledrejection] ${detail}`);
    });
  }).catch((err) => {
    if (attempt < 10) {
      setTimeout(() => installUnhandledRejectionListener(page, attempt + 1), 1000);
      return;
    }
    console.warn('⚠️  No se pudo instalar el listener de unhandledrejection:', describeError(err));
  });
}

let diagnosticsAttached = false;
function attachPageDiagnostics() {
  const page = client.pupPage;
  if (!page || diagnosticsAttached) return;
  diagnosticsAttached = true;

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    // Los módulos diferidos que safeRequire tolera generan ruido no fatal.
    if (text.includes('Requiring unknown module "')) return;
    if (type === 'error' || (process.env.WA_DEBUG === 'true' && type === 'warning')) {
      console.warn(`🖥️  [WhatsApp ${type}] ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    console.error('🖥️  [WhatsApp pageerror]', describeError(err));
  });

  installUnhandledRejectionListener(page);

  const snapshot = async (label) => {
    try {
      const state = await page.evaluate(() => {
        const appState = window.AuthStore && window.AuthStore.AppState;
        const store = window.Store;
        const wwebjs = window.WWebJS;
        const safeType = (value) => typeof value;
        const present = {};
        const relevantStoreKeys = [
          'User', 'Conn', 'Chat', 'Contact', 'Msg', 'GroupMetadata',
          'WAWebGroupMetadataCollection', 'ChatGetters', 'SendSeen',
          'ForwardUtils', 'BusinessProfile', 'NewsletterMetadataCollection',
          'WAWebNewsletterMetadataCollection', 'WAWebStreamModel',
        ];
        for (const key of relevantStoreKeys) {
          present[key] = Boolean(store && store[key]);
        }

        let connKeys = null;
        let connError = null;
        try {
          connKeys = store && store.Conn && store.Conn.serialize
            ? Object.keys(store.Conn.serialize()).length
            : null;
        } catch (err) {
          connError = err && (err.stack || err.message || String(err));
        }

        let mePnOk = null;
        let meLidOk = null;
        let userError = null;
        try {
          mePnOk = Boolean(store && store.User && store.User.getMaybeMePnUser && store.User.getMaybeMePnUser());
          meLidOk = Boolean(store && store.User && store.User.getMaybeMeLidUser && store.User.getMaybeMeLidUser());
        } catch (err) {
          userError = err && (err.stack || err.message || String(err));
        }

        return {
          version: (typeof window.Debug !== 'undefined' && window.Debug.VERSION) || null,
          appState: appState
            ? (typeof appState.state === 'function' ? 'function' : appState.state)
            : null,
          hasSynced: appState
            ? (typeof appState.hasSynced === 'function' ? 'function' : appState.hasSynced)
            : null,
          hasStore: typeof store !== 'undefined',
          storeKeys: typeof store !== 'undefined' ? Object.keys(store).length : 0,
          hasWWebJS: typeof wwebjs !== 'undefined',
          wwebjsKeys: typeof wwebjs !== 'undefined' ? Object.keys(wwebjs).length : 0,
          wwebjsFns: {
            getChats: safeType(wwebjs && wwebjs.getChats),
            getContacts: safeType(wwebjs && wwebjs.getContacts),
            getChatModel: safeType(wwebjs && wwebjs.getChatModel),
            getContactModel: safeType(wwebjs && wwebjs.getContactModel),
          },
          hasConn: Boolean(appState && window.AuthStore.Conn),
          connKeys,
          connError,
          present,
          mePnOk,
          meLidOk,
          userError,
        };
      });
      console.log(`🩺 WhatsApp estado (${label}):`, JSON.stringify(state));
    } catch (err) {
      console.warn(`⚠️  No se pudo leer el diagnóstico de WhatsApp (${label}):`, describeError(err));
    }
  };

  setTimeout(() => snapshot('5s'), 5000);
  setTimeout(() => snapshot('15s'), 15000);
  setTimeout(() => snapshot('30s'), 30000);
  setTimeout(() => snapshot('60s'), 60000);
}

client.on('qr', (qr) => {
  console.log('\n📱 Escaneá este QR con WhatsApp en tu celular:\n');
  qrcode.generate(qr, { small: true });
  console.log('\nRuta: WhatsApp > Dispositivos vinculados > Vincular dispositivo\n');
});

client.on('authenticated', () => {
  console.log('✅ Autenticado correctamente. Sesión guardada.');
  attachPageDiagnostics();
  installUnhandledRejectionListener(client.pupPage);
  scheduleReadyWatchdog('authenticated');
});

client.on('ready', () => {
  isReady = true;
  isInitializing = false;
  stallRetryCount = 0;
  clearReadyTimeout();
  clearReinitTimeout();
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
  isInitializing = false;
  clearContactsCache();
  clearReadyTimeout();
  console.warn('🔴 Cliente desconectado:', reason);

  if (reason === 'LOGOUT') {
    forceRemoveDir(AUTH_PATH);
    console.log('🗑️  Sesion eliminada. Reinicia para escanear el QR de nuevo.');
    return;
  }

  scheduleReinitialize(`disconnected-${reason}`);
});

client.on('auth_failure', (msg) => {
  isReady = false;
  isInitializing = false;
  clearReadyTimeout();
  console.error('❌ Error de autenticación:', msg);
  console.error('Borrá la carpeta .wwebjs_auth y reiniciá para escanear el QR de nuevo.');
});

client.on('change_state', (state) => {
  console.log(`🔁 Estado de WhatsApp Web: ${state}`);
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
  const ownLid = ownerLid || ownCus.replace('@c.us', '@lid');
  const remote = message.id.remote;
  const from = message.from;

  const isOwnChat =
    remote === ownCus ||
    remote === ownLid ||
    (from === ownCus && (message.to === ownCus || message.to === ownLid));

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

function describeError(err) {
  if (!err) return String(err);

  let message = err.message;
  if (!message) {
    try {
      message = JSON.stringify(err);
    } catch {
      message = String(err);
    }
  }

  const name = err.name && err.name !== 'Error' ? `${err.name}: ` : '';
  const stack = err.stack ? `\n${err.stack}` : '';
  return `${name}${message}${stack}`;
}

// Carga contactos frescos desde WhatsApp y hace merge con cache en disco.
// getChats() se omite: la versión actual de WhatsApp Web lo hace fallar con un
// error minificado ("r") y los grupos ya se descartan igual.
async function refreshContacts() {
  let contacts;
  try {
    contacts = await client.getContacts();
  } catch (err) {
    console.warn('⚠️  No se pudieron obtener contactos desde WhatsApp:', describeError(err));
    return contactsCache || loadContactsCacheFromDisk() || [];
  }

  console.log(`📒 Refresco de contactos: ${contacts.length} contactos.`);

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

  const merged = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (merged.length === 0) {
    console.warn('⚠️  El refresco de contactos quedó vacío; se conserva el cache existente.');
    return contactsCache || diskCache;
  }

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
  if (isInitializing) {
    console.log('ℹ️  Inicialización de WhatsApp ya en curso; se omite intento duplicado.');
    return;
  }

  isInitializing = true;
  clearReadyTimeout();
  clearReinitTimeout();

  const diagnosticsTimer = setInterval(() => {
    if (client.pupPage) {
      attachPageDiagnostics();
      clearInterval(diagnosticsTimer);
    }
  }, 200);

  try {
    console.log('🔄 Intentando inicializar cliente WhatsApp...');
    await client.initialize();
  } catch (err) {
    isInitializing = false;
    if (err.message && err.message.includes('Execution context was destroyed')) {
      console.warn('⚠️  Chromium crasheó durante la inicialización. Reintentando sin borrar la sesión...');
      scheduleReinitialize('execution-context-destroyed', 5000);
    } else {
      console.error('❌ Error iniciando cliente WhatsApp:', err.message);
      console.error(err.stack || err);
      try {
        const webVersion = await client.getWWebVersion();
        console.error(`ℹ️  WhatsApp Web cargado: ${webVersion}`);
      } catch (versionErr) {
        console.error('ℹ️  No se pudo obtener la versión de WhatsApp Web:', versionErr.message);
      }
      scheduleReinitialize('initialize-error');
    }
  } finally {
    clearInterval(diagnosticsTimer);
    attachPageDiagnostics();
  }
}

module.exports = { client, sendMessage, isClientReady, getClient, getContacts, getOwnerNumber: () => ownerNumber, initializeClient };
