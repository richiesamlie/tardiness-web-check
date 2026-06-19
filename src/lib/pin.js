// PIN + recovery code hashing using Node's built-in crypto.scrypt.
// scrypt is memory-hard (GPU-resistant), faster than bcryptjs (10-50×), and
// has no npm dependency. Also supports bcrypt hashes for backward compat
// (verifier transparently accepts both formats — re-hashes on next save).

'use strict';

const crypto = require('node:crypto');

// scrypt parameters. N=2^15 is OWASP-recommended for interactive auth.
const SCRYPT_N = 1 << 15;   // 32768
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;

function isBcryptHash(s) {
  return typeof s === 'string' && /^\$2[aby]\$\d{2}\$/.test(s);
}

function scryptHash(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
    crypto.scrypt(String(password), salt, SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 128 * SCRYPT_N * SCRYPT_R * 2 },
      (err, derived) => {
        if (err) return reject(err);
        // Format: scrypt$N$r$p$saltHex$keyHex
        resolve(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`);
      });
  });
}

function scryptVerify(password, stored) {
  return new Promise((resolve) => {
    try {
      const parts = stored.split('$');
      // parts: ['scrypt', N, r, p, saltHex, keyHex]
      if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);
      const N = parseInt(parts[1], 10);
      const r = parseInt(parts[2], 10);
      const p = parseInt(parts[3], 10);
      const salt = Buffer.from(parts[4], 'hex');
      const expected = Buffer.from(parts[5], 'hex');
      crypto.scrypt(String(password), salt, expected.length,
        { N, r, p, maxmem: 128 * N * r * 2 },
        (err, derived) => {
          if (err) return resolve(false);
          // Constant-time comparison
          if (derived.length !== expected.length) return resolve(false);
          resolve(crypto.timingSafeEqual(derived, expected));
        });
    } catch {
      resolve(false);
    }
  });
}

// PIN: 4-8 digits
async function hashPin(pin) {
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN must be 4-8 digits');
  return scryptHash(String(pin));
}

async function verifyPin(pin, hash) {
  if (!hash) return false;
  if (isBcryptHash(hash)) {
    // Legacy bcrypt hash — accept it but flag for migration
    try {
      const bcrypt = require('bcryptjs');
      return await bcrypt.compare(String(pin), hash);
    } catch { return false; }
  }
  return scryptVerify(pin, hash);
}

// Recovery code: 16 chars from unambiguous alphabet (no 0/O/1/I), grouped XXXX-XXXX-XXXX-XXXX
function generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // 32 chars, no 0/1/I/O
  const group = () => Array.from(crypto.randomBytes(4), b => alphabet[b % alphabet.length]).join('');
  return `${group()}-${group()}-${group()}-${group()}`;
}

async function hashRecoveryCode(code) {
  return scryptHash(code.toUpperCase());
}

async function verifyRecoveryCode(code, hash) {
  if (!hash || !code) return false;
  if (isBcryptHash(hash)) {
    try {
      const bcrypt = require('bcryptjs');
      return await bcrypt.compare(String(code).toUpperCase(), hash);
    } catch { return false; }
  }
  return scryptVerify(code.toUpperCase(), hash);
}

const WEAK_PINS = new Set([
  '1234', '1111', '0000', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '12345', '123456', '1234567', '12345678', '11111', '111111', '1111111', '11111111',
  '00000', '000000', '0000000', '00000000', '54321', '987654',
]);
function isWeakPin(pin) { return WEAK_PINS.has(String(pin)); }

module.exports = {
  hashPin, verifyPin,
  generateRecoveryCode, hashRecoveryCode, verifyRecoveryCode,
  isWeakPin,
  // Exposed for tests / migration:
  isBcryptHash, scryptHash, scryptVerify,
};
