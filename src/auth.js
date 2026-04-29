const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, passwordHash) {
  if (!passwordHash || typeof passwordHash !== 'string') return false;

  const [scheme, salt, storedHash] = passwordHash.split('$');
  if (scheme !== 'scrypt' || !salt || !storedHash) return false;

  const derivedHash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (storedBuffer.length !== derivedHash.length) return false;
  return crypto.timingSafeEqual(storedBuffer, derivedHash);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
