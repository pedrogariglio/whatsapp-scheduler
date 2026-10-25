'use strict';

const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'whatsapp-web.js',
  'src',
  'util',
  'Injected',
  'AuthStore',
  'AuthStore.js'
);
const marker = 'whatsapp-scheduler: wait for WAWebSocketModel';

if (!fs.existsSync(target)) {
  throw new Error(`No se encontró el archivo de whatsapp-web.js: ${target}`);
}

const source = fs.readFileSync(target, 'utf8');
if (source.includes(marker)) {
  process.stdout.write('whatsapp-web.js AuthStore ya parcheado.\n');
  process.exit(0);
}

const original = "exports.ExposeAuthStore = () => {\n    window.AuthStore = {};\n    window.AuthStore.AppState = window.require('WAWebSocketModel').Socket;";
const replacement = `exports.ExposeAuthStore = async () => {
    // ${marker}
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

if (!source.includes(original)) {
  throw new Error('La estructura esperada de AuthStore.js cambió; no se aplica el parche.');
}

fs.writeFileSync(target, source.replace(original, replacement));
process.stdout.write('whatsapp-web.js AuthStore parcheado para esperar WAWebSocketModel.\n');
