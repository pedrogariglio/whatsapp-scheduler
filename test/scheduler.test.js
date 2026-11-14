'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createScheduler } = require('../src/scheduler');

function makeDb({ messages = [], retryCounts = {}, statusById = {} } = {}) {
  const calls = {
    sent: [],
    retries: [],
    failed: [],
    pending: [],
  };

  return {
    calls,
    getDispatchableMessages: () => messages,
    getMessageById: (id) => {
      const message = messages.find(item => item.id === id);
      if (!message) return null;
      if (statusById[id]) return { ...message, status: statusById[id] };
      return message;
    },
    getRetryCount: (id) => retryCounts[id] || 0,
    markAsSent: (id) => calls.sent.push(id),
    scheduleRetry: (id, at) => calls.retries.push({ id, at }),
    markAsFailed: (id) => calls.failed.push(id),
    markAsPending: (id) => calls.pending.push(id),
  };
}

function makeMessage(overrides = {}) {
  return {
    id: 1,
    phone: '5491112345678',
    message: 'Hola',
    status: 'pending',
    attachment_path: null,
    ...overrides,
  };
}

test('no procesa nada si WhatsApp no esta listo', async () => {
  const db = makeDb({ messages: [makeMessage()] });
  let sent = 0;
  const scheduler = createScheduler({
    db,
    isClientReady: () => false,
    sendMessage: async () => { sent += 1; },
    sleep: async () => {},
  });

  await scheduler.processDueMessages();

  assert.equal(sent, 0);
  assert.deepEqual(db.calls.sent, []);
});

test('envia un mensaje pendiente y lo marca como enviado', async () => {
  const db = makeDb({ messages: [makeMessage()] });
  const sent = [];
  const events = [];
  const scheduler = createScheduler({
    db,
    isClientReady: () => true,
    sendMessage: async (phone, message) => sent.push({ phone, message }),
    sleep: async () => {},
    emitEvent: (type, data) => events.push({ type, data }),
  });

  await scheduler.processDueMessages();

  assert.deepEqual(sent, [{ phone: '5491112345678', message: 'Hola' }]);
  assert.deepEqual(db.calls.sent, [1]);
  assert.deepEqual(events, [{ type: 'sent', data: { id: 1, phone: '5491112345678', message: 'Hola' } }]);
});

test('programa un retry cuando el envio falla', async () => {
  const db = makeDb({ messages: [makeMessage()], retryCounts: { 1: 0 } });
  const scheduler = createScheduler({
    db,
    isClientReady: () => true,
    sendMessage: async () => { throw new Error('boom'); },
    sleep: async () => {},
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    retryDelayMs: 30000,
  });

  await scheduler.processDueMessages();

  assert.deepEqual(db.calls.retries, [{ id: 1, at: '2026-01-01T00:00:30.000Z' }]);
  assert.deepEqual(db.calls.failed, []);
  assert.deepEqual(db.calls.sent, []);
});

test('marca como fallido y limpia el adjunto al agotar los retries', async () => {
  const db = makeDb({
    messages: [makeMessage({ attachment_path: '/tmp/a.jpg' })],
    retryCounts: { 1: 2 },
  });
  const unlinked = [];
  const scheduler = createScheduler({
    db,
    isClientReady: () => true,
    getClient: () => ({
      sendMessage: async () => { throw new Error('upload failed'); },
    }),
    messageMedia: { fromFilePath: (filePath) => ({ filePath }) },
    fsModule: {
      existsSync: () => true,
      unlinkSync: (filePath) => unlinked.push(filePath),
    },
    sleep: async () => {},
  });

  await scheduler.processDueMessages();

  assert.deepEqual(db.calls.failed, [1]);
  assert.deepEqual(unlinked, ['/tmp/a.jpg']);
  assert.deepEqual(db.calls.retries, []);
});

test('no procesa dos veces en paralelo', async () => {
  const db = makeDb({ messages: [makeMessage()] });
  let releaseSend;
  let startedResolve;
  const started = new Promise(resolve => { startedResolve = resolve; });
  let sends = 0;

  const scheduler = createScheduler({
    db,
    isClientReady: () => true,
    sendMessage: async () => {
      sends += 1;
      startedResolve();
      await new Promise(resolve => { releaseSend = resolve; });
    },
    sleep: async () => {},
  });

  const first = scheduler.processDueMessages();
  await started;
  const second = scheduler.processDueMessages();
  releaseSend();
  await Promise.all([first, second]);

  assert.equal(sends, 1);
  assert.deepEqual(db.calls.sent, [1]);
});

test('marca como pending un mensaje en retry antes de enviarlo', async () => {
  const db = makeDb({ messages: [makeMessage({ status: 'retrying' })] });
  let sent = 0;
  const scheduler = createScheduler({
    db,
    isClientReady: () => true,
    sendMessage: async () => { sent += 1; },
    sleep: async () => {},
  });

  await scheduler.processDueMessages();

  assert.deepEqual(db.calls.pending, [1]);
  assert.equal(sent, 1);
});

test('ignora mensajes que ya no estan pendientes o en retry', async () => {
  const db = makeDb({
    messages: [makeMessage()],
    statusById: { 1: 'sent' },
  });
  let sent = 0;
  const scheduler = createScheduler({
    db,
    isClientReady: () => true,
    sendMessage: async () => { sent += 1; },
    sleep: async () => {},
  });

  await scheduler.processDueMessages();

  assert.equal(sent, 0);
  assert.deepEqual(db.calls.sent, []);
});
