'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FileSessionStore } = require('../src/session-store');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wa-sessions-'));
}

function get(store, sid) {
  return new Promise((resolve, reject) => {
    store.get(sid, (err, session) => err ? reject(err) : resolve(session));
  });
}

function set(store, sid, session) {
  return new Promise((resolve, reject) => {
    store.set(sid, session, (err) => err ? reject(err) : resolve());
  });
}

function destroy(store, sid) {
  return new Promise((resolve, reject) => {
    store.destroy(sid, (err) => err ? reject(err) : resolve());
  });
}

function length(store) {
  return new Promise((resolve, reject) => {
    store.length((err, count) => err ? reject(err) : resolve(count));
  });
}

test('guarda y recupera una sesion', async () => {
  const dir = makeTempDir();
  const store = new FileSessionStore({ dir, cleanupIntervalMs: 60 * 60 * 1000 });

  try {
    const session = {
      cookie: { expires: new Date(Date.now() + 60000) },
      authenticated: true,
      user: 'pedro',
    };

    await set(store, 'sid-1', session);
    const restored = await get(store, 'sid-1');

    assert.equal(restored.authenticated, true);
    assert.equal(restored.user, 'pedro');
    assert.equal(restored.cookie.expires instanceof Date, true);
    assert.equal(await length(store), 1);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('devuelve null para una sesion inexistente', async () => {
  const dir = makeTempDir();
  const store = new FileSessionStore({ dir, cleanupIntervalMs: 60 * 60 * 1000 });

  try {
    assert.equal(await get(store, 'no-existe'), null);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('destruye una sesion', async () => {
  const dir = makeTempDir();
  const store = new FileSessionStore({ dir, cleanupIntervalMs: 60 * 60 * 1000 });

  try {
    await set(store, 'sid-2', {
      cookie: { expires: new Date(Date.now() + 60000) },
      authenticated: true,
    });

    await destroy(store, 'sid-2');

    assert.equal(await get(store, 'sid-2'), null);
    assert.equal(await length(store), 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no devuelve sesiones vencidas', async () => {
  const dir = makeTempDir();
  const store = new FileSessionStore({ dir, cleanupIntervalMs: 60 * 60 * 1000 });

  try {
    await set(store, 'sid-3', {
      cookie: { expires: new Date(Date.now() - 1000) },
      authenticated: true,
    });

    assert.equal(await get(store, 'sid-3'), null);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('touch renueva la expiracion', async () => {
  const dir = makeTempDir();
  const store = new FileSessionStore({ dir, cleanupIntervalMs: 60 * 60 * 1000 });

  try {
    await set(store, 'sid-4', {
      cookie: { expires: new Date(Date.now() + 1000) },
      authenticated: true,
    });

    await new Promise((resolve, reject) => {
      store.touch('sid-4', {
        cookie: { expires: new Date(Date.now() + 60000) },
        authenticated: true,
      }, (err) => err ? reject(err) : resolve());
    });

    const restored = await get(store, 'sid-4');
    assert.equal(restored.authenticated, true);
    assert.equal(restored.cookie.expires.getTime() > Date.now(), true);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanup elimina sesiones vencidas', async () => {
  const dir = makeTempDir();
  const store = new FileSessionStore({ dir, cleanupIntervalMs: 60 * 60 * 1000 });

  try {
    await set(store, 'sid-5', {
      cookie: { expires: new Date(Date.now() - 1000) },
      authenticated: true,
    });

    await store.cleanup();

    assert.equal(await length(store), 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
