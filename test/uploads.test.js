'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cleanupOrphanUploads } = require('../src/uploads');

function makeTempUploadsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-uploads-'));
  return dir;
}

test('elimina solo los uploads no referenciados por la base', () => {
  const dir = makeTempUploadsDir();

  try {
    fs.writeFileSync(path.join(dir, 'referenciado.jpg'), 'keep');
    fs.writeFileSync(path.join(dir, 'huerfano.pdf'), 'delete');
    fs.mkdirSync(path.join(dir, 'subdir'));

    const { removed } = cleanupOrphanUploads(dir, [
      { attachment_path: '/state/uploads/referenciado.jpg' },
      { attachment_path: null },
    ]);

    assert.deepEqual(removed, ['huerfano.pdf']);
    assert.equal(fs.existsSync(path.join(dir, 'referenciado.jpg')), true);
    assert.equal(fs.existsSync(path.join(dir, 'huerfano.pdf')), false);
    assert.equal(fs.existsSync(path.join(dir, 'subdir')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no falla si el directorio de uploads no existe', () => {
  const dir = path.join(os.tmpdir(), `wa-uploads-missing-${Date.now()}`);

  const { removed } = cleanupOrphanUploads(dir, []);

  assert.deepEqual(removed, []);
});

test('elimina archivos cuando no hay mensajes que los referencien', () => {
  const dir = makeTempUploadsDir();

  try {
    fs.writeFileSync(path.join(dir, 'a.jpg'), 'a');

    const { removed } = cleanupOrphanUploads(dir, []);

    assert.deepEqual(removed, ['a.jpg']);
    assert.equal(fs.existsSync(path.join(dir, 'a.jpg')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
