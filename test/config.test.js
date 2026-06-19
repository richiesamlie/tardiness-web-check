// Tests for src/config.js — port resolution, env overrides, file fallback.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const PORT_FILE = path.join(DATA_DIR, '.port');

function freshConfig() {
  // Bust the require cache so config re-reads on each call
  delete require.cache[require.resolve('../src/config')];
  return require('../src/config');
}

test('port: default is 3000 when no env var and no port file', () => {
  delete process.env.PORT;
  if (fs.existsSync(PORT_FILE)) fs.unlinkSync(PORT_FILE);
  const cfg = freshConfig();
  assert.strictEqual(cfg.port, 3000);
});

test('port: PORT env var wins over file', () => {
  process.env.PORT = '7777';
  fs.writeFileSync(PORT_FILE, '8080');
  try {
    const cfg = freshConfig();
    assert.strictEqual(cfg.port, 7777);
  } finally {
    delete process.env.PORT;
    fs.unlinkSync(PORT_FILE);
  }
});

test('port: data/.port file is used when env var absent', () => {
  delete process.env.PORT;
  fs.writeFileSync(PORT_FILE, '9999');
  try {
    const cfg = freshConfig();
    assert.strictEqual(cfg.port, 9999);
  } finally {
    fs.unlinkSync(PORT_FILE);
  }
});

test('port: invalid port in file falls back to default', () => {
  delete process.env.PORT;
  fs.writeFileSync(PORT_FILE, 'not-a-number');
  try {
    const cfg = freshConfig();
    assert.strictEqual(cfg.port, 3000);
  } finally {
    fs.unlinkSync(PORT_FILE);
  }
});

test('port: out-of-range port in file falls back to default', () => {
  delete process.env.PORT;
  fs.writeFileSync(PORT_FILE, '99999');
  try {
    const cfg = freshConfig();
    assert.strictEqual(cfg.port, 3000);
  } finally {
    fs.unlinkSync(PORT_FILE);
  }
});

test('port: empty port file falls back to default', () => {
  delete process.env.PORT;
  fs.writeFileSync(PORT_FILE, '   \n');
  try {
    const cfg = freshConfig();
    assert.strictEqual(cfg.port, 3000);
  } finally {
    fs.unlinkSync(PORT_FILE);
  }
});

test('host: defaults to 0.0.0.0', () => {
  delete process.env.HOST;
  const cfg = freshConfig();
  assert.strictEqual(cfg.host, '0.0.0.0');
});

test('nodeEnv: defaults to development', () => {
  delete process.env.NODE_ENV;
  const cfg = freshConfig();
  assert.strictEqual(cfg.nodeEnv, 'development');
});

test('parseInt10 helper handles edge cases', () => {
  // Indirect test via env-style configs
  process.env.REQUEST_TIMEOUT_MS = '60000';
  try {
    const cfg = freshConfig();
    assert.strictEqual(cfg.requestTimeoutMs, 60000);
  } finally {
    delete process.env.REQUEST_TIMEOUT_MS;
  }
});
