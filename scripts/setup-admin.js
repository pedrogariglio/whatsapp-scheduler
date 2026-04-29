#!/usr/bin/env node

require('dotenv').config();

const readline = require('readline');
const { hashPassword } = require('../src/auth');
const { ensureConfig, saveConfig, configPath } = require('../src/config');

function ask(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    if (silent) {
      rl.stdoutMuted = true;
      rl._writeToOutput = function writeToOutput(stringToWrite) {
        if (rl.stdoutMuted) {
          rl.output.write('*');
        } else {
          rl.output.write(stringToWrite);
        }
      };
    }

    rl.question(question, (answer) => {
      rl.close();
      if (silent) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main() {
  const config = ensureConfig();

  const username = await ask('Usuario admin: ');
  if (username.length < 3) {
    console.error('El usuario debe tener al menos 3 caracteres.');
    process.exit(1);
  }

  const password = await ask('Contrasena: ', { silent: true });
  if (password.length < 10) {
    console.error('La contrasena debe tener al menos 10 caracteres.');
    process.exit(1);
  }

  const passwordConfirm = await ask('Confirmar contrasena: ', { silent: true });
  if (password !== passwordConfirm) {
    console.error('Las contrasenas no coinciden.');
    process.exit(1);
  }

  config.firstRun = false;
  config.auth = {
    username,
    passwordHash: hashPassword(password),
  };

  saveConfig(config);

  console.log(`Administrador guardado en ${configPath}`);
}

main().catch((error) => {
  console.error('No se pudo configurar el administrador:', error.message);
  process.exit(1);
});
