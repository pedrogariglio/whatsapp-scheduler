'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBot, parseFecha, formatFecha } = require('../src/bot');

const OWNER = '5493535626495';
const OWNER_CHAT = `${OWNER}@c.us`;

function makeDb(overrides = {}) {
  const calls = { created: [], deleted: [] };

  return {
    calls,
    createMessage: (...args) => {
      calls.created.push(args);
      return { id: 1 };
    },
    getPendingMessagesList: () => [],
    getMessageById: () => null,
    deleteMessage: (id) => {
      calls.deleted.push(id);
      return true;
    },
    ...overrides,
  };
}

function makeClient() {
  const sent = [];
  return {
    sent,
    sendMessage: async (chatId, text) => {
      sent.push({ chatId, text });
    },
  };
}

function makeMessage(body, overrides = {}) {
  return {
    from: OWNER_CHAT,
    to: OWNER_CHAT,
    body,
    ...overrides,
  };
}

test('formatea y parsea fechas validas', () => {
  const date = parseFecha('01/01/2099 10:30');
  assert.ok(date instanceof Date);
  assert.equal(formatFecha(date), '01/01/2099 10:30');
  assert.equal(parseFecha('31/12/2026 23:59:59') instanceof Date, true);
  assert.equal(parseFecha('fecha invalida'), null);
});

test('ignora mensajes de terceros y de grupos', async () => {
  const bot = createBot({ db: makeDb(), logger: { log() {} } });
  bot.setOwnerNumber(OWNER);

  const client = makeClient();
  await bot.handleMessage(makeMessage('/ayuda', { from: '5491111111111@c.us' }), client);
  await bot.handleMessage(makeMessage('/ayuda', { from: '123456789012345@g.us' }), client);

  assert.equal(client.sent.length, 0);
});

test('no responde hasta que se configura el owner', async () => {
  const bot = createBot({ db: makeDb(), logger: { log() {} } });
  const client = makeClient();

  await bot.handleMessage(makeMessage('/ayuda'), client);

  assert.equal(client.sent.length, 0);
});

test('responde /ayuda solo en el chat propio', async () => {
  const bot = createBot({ db: makeDb(), logger: { log() {} } });
  bot.setOwnerNumber(OWNER);
  const client = makeClient();

  await bot.handleMessage(makeMessage('/ayuda'), client);

  assert.equal(client.sent.length, 1);
  assert.equal(client.sent[0].chatId, OWNER_CHAT);
  assert.match(client.sent[0].text, /Comandos disponibles/);
});

test('completa el flujo /agendar y crea el mensaje', async () => {
  const db = makeDb();
  const bot = createBot({ db, logger: { log() {} } });
  bot.setOwnerNumber(OWNER);
  const client = makeClient();

  await bot.handleMessage(makeMessage('/agendar'), client);
  await bot.handleMessage(makeMessage('5491112345678'), client);
  await bot.handleMessage(makeMessage('Mensaje de prueba'), client);
  await bot.handleMessage(makeMessage('01/01/2099 10:00'), client);

  assert.equal(db.calls.created.length, 1);
  const [phone, message, scheduledAt] = db.calls.created[0];
  assert.equal(phone, '5491112345678');
  assert.equal(message, 'Mensaje de prueba');
  assert.equal(typeof scheduledAt, 'string');
  assert.match(client.sent.at(-1).text, /Mensaje programado correctamente/);
  assert.match(client.sent.at(-1).text, /#1/);
});

test('rechaza una fecha invalida sin crear el mensaje', async () => {
  const db = makeDb();
  const bot = createBot({ db, logger: { log() {} } });
  bot.setOwnerNumber(OWNER);
  const client = makeClient();

  await bot.handleMessage(makeMessage('/agendar'), client);
  await bot.handleMessage(makeMessage('5491112345678'), client);
  await bot.handleMessage(makeMessage('Mensaje'), client);
  await bot.handleMessage(makeMessage('no-es-fecha'), client);

  assert.equal(db.calls.created.length, 0);
  assert.match(client.sent.at(-1).text, /Fecha inválida/);
});

test('lista pendientes y cancela un mensaje pendiente', async () => {
  const db = makeDb({
    getPendingMessagesList: () => [
      { id: 7, phone: '5491112345678', message: 'Hola', scheduled_at: '2099-01-01T10:00:00.000Z' },
    ],
    getMessageById: () => ({ id: 7, status: 'pending' }),
  });
  const bot = createBot({ db, logger: { log() {} } });
  bot.setOwnerNumber(OWNER);
  const client = makeClient();

  await bot.handleMessage(makeMessage('/pendientes'), client);
  assert.match(client.sent.at(-1).text, /Mensajes pendientes \(1\)/);

  await bot.handleMessage(makeMessage('/cancelar 7'), client);
  assert.deepEqual(db.calls.deleted, [7]);
  assert.match(client.sent.at(-1).text, /cancelado correctamente/);
});

test('no cancela un mensaje ya enviado', async () => {
  const db = makeDb({
    getMessageById: () => ({ id: 8, status: 'sent' }),
  });
  const bot = createBot({ db, logger: { log() {} } });
  bot.setOwnerNumber(OWNER);
  const client = makeClient();

  await bot.handleMessage(makeMessage('/cancelar 8'), client);

  assert.deepEqual(db.calls.deleted, []);
  assert.match(client.sent.at(-1).text, /ya fue enviado/);
});
