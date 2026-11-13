'use strict';

const fs = require('fs');
const path = require('path');

const injectedDir = path.join(
  __dirname,
  '..',
  'node_modules',
  'whatsapp-web.js',
  'src',
  'util',
  'Injected'
);

const authTarget = path.join(injectedDir, 'AuthStore', 'AuthStore.js');
const authMarker = 'whatsapp-scheduler: wait for WAWebSocketModel';

if (!fs.existsSync(authTarget)) {
  throw new Error(`No se encontró el archivo de whatsapp-web.js: ${authTarget}`);
}

let authSource = fs.readFileSync(authTarget, 'utf8');
if (authSource.includes(authMarker)) {
  process.stdout.write('whatsapp-web.js AuthStore ya parcheado.\n');
} else {
  const original = "exports.ExposeAuthStore = () => {\n    window.AuthStore = {};\n    window.AuthStore.AppState = window.require('WAWebSocketModel').Socket;";
  const replacement = `exports.ExposeAuthStore = async () => {
    // ${authMarker}
    const waitForModule = async (name, timeoutMs = 30000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const module = window.require(name);
                if (module) return module;
            } catch (_) {
                // WhatsApp Web can expose the module lazily during startup.
            }
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        throw new Error(\`WhatsApp Web module not available: \${name}\`);
    };

    window.AuthStore = {};
    const socketModel = await waitForModule('WAWebSocketModel');
    window.AuthStore.AppState = socketModel.Socket;`;

  if (!authSource.includes(original)) {
    throw new Error('La estructura esperada de AuthStore.js cambió; no se aplica el parche.');
  }

  authSource = authSource.replace(original, replacement);
  fs.writeFileSync(authTarget, authSource);
  process.stdout.write('whatsapp-web.js AuthStore parcheado para esperar WAWebSocketModel.\n');
}

const storeTarget = path.join(injectedDir, 'Store.js');
const storeMarker = 'whatsapp-scheduler: tolerate lazy WhatsApp modules';

if (!fs.existsSync(storeTarget)) {
  throw new Error(`No se encontró el archivo de whatsapp-web.js: ${storeTarget}`);
}

let storeSource = fs.readFileSync(storeTarget, 'utf8');
if (storeSource.includes(storeMarker)) {
  process.stdout.write('whatsapp-web.js Store ya parcheado.\n');
} else {
  const original = 'exports.ExposeStore = () => {\n';
  const replacement = `exports.ExposeStore = () => {
    // ${storeMarker}
    const safeRequire = (name) => {
        try {
            const module = window['require'](name);
            if (module) return module;
        } catch (_) {
            // Los módulos opcionales se cargan de forma diferida en WhatsApp Web.
        }
        return {};
    };

`;

  if (!storeSource.includes(original)) {
    throw new Error('La estructura esperada de Store.js cambió; no se aplica el parche.');
  }

  storeSource = storeSource.replace(original, replacement);
  storeSource = storeSource.replace(/window\.require\(/g, 'safeRequire(');
  fs.writeFileSync(storeTarget, storeSource);
  process.stdout.write('whatsapp-web.js Store parcheado para tolerar módulos diferidos.\n');
}
