'use strict';

const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

class FileSessionStore extends session.Store {
  constructor({
    dir,
    ttlMs = DEFAULT_TTL_MS,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
    logger = console,
  } = {}) {
    super();

    if (!dir) throw new Error('FileSessionStore requiere un directorio');

    this.dir = dir;
    this.ttlMs = ttlMs;
    this.logger = logger;

    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });

    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((err) => {
        this.logger.warn('⚠️  No se pudo limpiar sesiones vencidas:', err.message);
      });
    }, cleanupIntervalMs);
    this.cleanupTimer.unref?.();
  }

  fileFor(sid) {
    const hash = crypto.createHash('sha256').update(String(sid)).digest('hex');
    return path.join(this.dir, `${hash}.json`);
  }

  expiryFor(sess) {
    const expires = sess && sess.cookie && sess.cookie.expires;
    if (expires) {
      const timestamp = new Date(expires).getTime();
      if (!Number.isNaN(timestamp)) return timestamp;
    }
    return Date.now() + this.ttlMs;
  }

  get(sid, callback) {
    fsp.readFile(this.fileFor(sid), 'utf8')
      .then((raw) => {
        const record = JSON.parse(raw);

        if (!record || !record.session || !record.expiresAt || record.expiresAt <= Date.now()) {
          return this.destroy(sid, () => callback(null, null));
        }

        const sess = record.session;
        if (sess.cookie) {
          sess.cookie.expires = new Date(record.expiresAt);
        }

        return callback(null, sess);
      })
      .catch((err) => {
        if (err.code === 'ENOENT') return callback(null, null);
        return callback(err);
      });
  }

  set(sid, sess, callback) {
    const target = this.fileFor(sid);
    const tmp = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const record = {
      sid,
      expiresAt: this.expiryFor(sess),
      session: sess,
    };

    fsp.mkdir(this.dir, { recursive: true, mode: 0o700 })
      .then(() => fsp.writeFile(tmp, JSON.stringify(record), { mode: 0o600 }))
      .then(() => fsp.rename(tmp, target))
      .then(() => callback && callback(null))
      .catch((err) => {
        fsp.unlink(tmp).catch(() => {});
        if (callback) callback(err);
      });
  }

  destroy(sid, callback) {
    fsp.unlink(this.fileFor(sid))
      .then(() => callback && callback(null))
      .catch((err) => {
        if (err.code === 'ENOENT') return callback && callback(null);
        return callback && callback(err);
      });
  }

  touch(sid, sess, callback) {
    this.set(sid, sess, callback);
  }

  length(callback) {
    fsp.readdir(this.dir)
      .then((files) => callback(null, files.filter(file => file.endsWith('.json')).length))
      .catch((err) => callback(err));
  }

  clear(callback) {
    fsp.readdir(this.dir)
      .then(async (files) => {
        await Promise.all(
          files
            .filter(file => file.endsWith('.json'))
            .map(file => fsp.unlink(path.join(this.dir, file)).catch(() => {}))
        );
        if (callback) callback(null);
      })
      .catch((err) => callback && callback(err));
  }

  async cleanup() {
    const files = await fsp.readdir(this.dir);
    const now = Date.now();

    await Promise.all(files.map(async (file) => {
      const fullPath = path.join(this.dir, file);

      if (file.endsWith('.tmp')) {
        try {
          const stat = await fsp.stat(fullPath);
          if (now - stat.mtimeMs > this.ttlMs) await fsp.unlink(fullPath);
        } catch {
          // Otro proceso pudo haberlo eliminado.
        }
        return;
      }

      if (!file.endsWith('.json')) return;

      try {
        const record = JSON.parse(await fsp.readFile(fullPath, 'utf8'));
        if (!record.expiresAt || record.expiresAt <= now) {
          await fsp.unlink(fullPath);
        }
      } catch {
        await fsp.unlink(fullPath).catch(() => {});
      }
    }));
  }

  close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

module.exports = { FileSessionStore, DEFAULT_TTL_MS };
