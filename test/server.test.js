const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');

test('GET /api/health returns { ok: true } with no db', async () => {
  const app = createApp();
  const res = await request(app).get('/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.ok, true);
});

test('GET /api/health includes DB stats when db is provided', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const res = await request(app).get('/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.ok(res.body.db, 'db field present');
    assert.strictEqual(typeof res.body.db.size_bytes, 'number');
    assert.strictEqual(typeof res.body.uptimeSeconds, 'number');
    assert.strictEqual(typeof res.body.app_version, 'string');
    assert.strictEqual(typeof res.body.node_env, 'string');
  } finally {
    db.close();
  }
});
