const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

const BCRYPT_ROUNDS = 10;

// PIN: 4-8 digits
async function hashPin(pin) {
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN must be 4-8 digits');
  return bcrypt.hash(String(pin), BCRYPT_ROUNDS);
}

async function verifyPin(pin, hash) {
  if (!hash) return false;
  try { return await bcrypt.compare(String(pin), hash); } catch { return false; }
}

// Recovery code: 16 chars from unambiguous alphabet (no 0/O/1/I), grouped XXXX-XXXX-XXXX-XXXX
function generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // 32 chars, no 0/1/I/O
  const group = () => Array.from(crypto.randomBytes(4), b => alphabet[b % alphabet.length]).join('');
  return `${group()}-${group()}-${group()}-${group()}`;
}

async function hashRecoveryCode(code) {
  return bcrypt.hash(code.toUpperCase(), BCRYPT_ROUNDS);
}

async function verifyRecoveryCode(code, hash) {
  if (!hash || !code) return false;
  try { return await bcrypt.compare(String(code).toUpperCase(), hash); } catch { return false; }
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
};
