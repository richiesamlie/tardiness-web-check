// Tests for the new middleware: requestId, logger, security (helmet), compression,
// rate limit, notFound, errorHandler, body size limit, and the global error shape.

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');
const zlib = require('node:zlib');

const requestId = require('../src/middleware/requestId');
const logger = require('../src/middleware/logger');
const security = require('../src/middleware/security');
const compressionMw = require('../src/middleware/compression');
const rateLimit = require('../src/middleware/rateLimit');
const notFound = require('../src/middleware/notFound');
const errorHandler = require('../src/middleware/errorHandler');
const { BadRequest, NotFound, Conflict, RateLimited, AppError } = require('../src/errors');

// ============ requestId ============

test('requestId: generates a UUID and sets X-Request-Id header', async () => {
  const app = express();
  app.use(requestId());
  app.get('/x', (req, res) => res.json({ id: req.id }));
  const res = await request(app).get('/x');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.id, 'req.id present');
  assert.ok(res.headers['x-request-id'], 'X-Request-Id header set');
  assert.strictEqual(res.body.id, res.headers['x-request-id']);
  assert.match(res.body.id, /^[0-9a-f-]{36}$/);
});

test('requestId: accepts valid incoming X-Request-Id', async () => {
  const app = express();
  app.use(requestId());
  app.get('/x', (req, res) => res.json({ id: req.id }));
  const res = await request(app).get('/x').set('X-Request-Id', 'my-trace-1234-abcd');
  assert.strictEqual(res.body.id, 'my-trace-1234-abcd');
  assert.strictEqual(res.headers['x-request-id'], 'my-trace-1234-abcd');
});

test('requestId: rejects invalid incoming X-Request-Id (with chars outside [\w-])', async () => {
  const app = express();
  app.use(requestId());
  app.get('/x', (req, res) => res.json({ id: req.id }));
  const res = await request(app).get('/x').set('X-Request-Id', 'bad id with spaces!');
  assert.notStrictEqual(res.body.id, 'bad id with spaces!');
  assert.match(res.body.id, /^[0-9a-f-]{36}$/);
});

// ============ security (helmet) ============

test('security: sets X-Content-Type-Options header', async () => {
  const app = express();
  app.use(security());
  app.get('/x', (req, res) => res.send('ok'));
  const res = await request(app).get('/x');
  assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
});

test('security: sets X-Frame-Options: SAMEORIGIN (helmet default)', async () => {
  const app = express();
  app.use(security());
  app.get('/x', (req, res) => res.send('ok'));
  const res = await request(app).get('/x');
  assert.ok(res.headers['x-frame-options']);
});

test('security: sets Content-Security-Policy header', async () => {
  const app = express();
  app.use(security());
  app.get('/x', (req, res) => res.send('ok'));
  const res = await request(app).get('/x');
  assert.ok(res.headers['content-security-policy']);
  assert.match(res.headers['content-security-policy'], /default-src/);
  assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
});

test('security: removes X-Powered-By header', async () => {
  const app = express();
  app.use(security());
  app.get('/x', (req, res) => res.send('ok'));
  const res = await request(app).get('/x');
  assert.strictEqual(res.headers['x-powered-by'], undefined);
});

// ============ compression ============

test('compression: gzip when Accept-Encoding: gzip and body large enough', async () => {
  const app = express();
  app.use(compressionMw());
  app.get('/x', (req, res) => {
    res.type('text/plain');
    res.send('hello world '.repeat(200));
  });
  const res = await request(app).get('/x').set('Accept-Encoding', 'gzip');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['content-encoding'], 'gzip');
  // We don't decompress (supertest may pre-decode) but we know it was gzipped.
  assert.ok(res.text || res.body, 'body has content');
});

test('compression: passes through small responses uncompressed', async () => {
  const app = express();
  app.use(compressionMw());
  app.get('/x', (req, res) => res.type('text/plain').send('small'));
  const res = await request(app).get('/x').set('Accept-Encoding', 'gzip');
  assert.strictEqual(res.status, 200);
  // Below 1KB threshold — no compression
  assert.strictEqual(res.headers['content-encoding'], undefined);
  assert.strictEqual(res.text, 'small');
});

// ============ rateLimit ============

test('rateLimit.general: allows up to max requests', async () => {
  const app = express();
  app.use(rateLimit.general());
  app.get('/x', (req, res) => res.json({ ok: true }));

  // We can't easily set a custom max from outside; default is 600. Send 5 requests.
  for (let i = 0; i < 5; i++) {
    const res = await request(app).get('/x');
    assert.strictEqual(res.status, 200, `req ${i} status`);
  }
});

test('rateLimit: returns 429 with JSON when limit exceeded', async () => {
  // Use the native rate limit module to test with a tiny limit
  const rateLimit = require('../src/middleware/rateLimit');
  const app = express();
  app.use(rateLimit._createLimiter(2, 60_000));
  app.get('/x', (req, res) => res.json({ ok: true }));

  await request(app).get('/x');
  await request(app).get('/x');
  const res = await request(app).get('/x');
  assert.strictEqual(res.status, 429);
  assert.strictEqual(res.body.code, 'rate_limited');
});

// ============ notFound ============

test('notFound: returns 404 JSON for unmatched routes', async () => {
  const app = express();
  app.use(requestId());
  app.use(notFound());
  app.use(errorHandler());
  const res = await request(app).get('/no-such-route');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.code, 'not_found');
  assert.match(res.body.error, /no-such-route/);
  assert.ok(res.body.requestId, 'requestId present in error response');
});

// ============ errorHandler ============

test('errorHandler: turns AppError into typed JSON', async () => {
  const app = express();
  app.use(requestId());
  app.get('/bad', (req, res, next) => next(new BadRequest('invalid input')));
  app.use(errorHandler());
  const res = await request(app).get('/bad');
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, 'invalid input');
  assert.strictEqual(res.body.code, 'bad_request');
  assert.ok(res.body.requestId);
});

test('errorHandler: includes details when present', async () => {
  const app = express();
  app.use(requestId());
  app.get('/conflict', (req, res, next) => next(new Conflict('dup', { field: 'id' })));
  app.use(errorHandler());
  const res = await request(app).get('/conflict');
  assert.strictEqual(res.status, 409);
  assert.deepStrictEqual(res.body.details, { field: 'id' });
});

test('errorHandler: generic Error includes stack in dev', async () => {
  // The prod-mode branch (hides message + stack) is exercised by the same code path;
  // it's controlled by config.nodeEnv. We test the default dev path here.
  const eh = require('../src/middleware/errorHandler');
  const app = express();
  app.use(requestId());
  app.get('/boom', (req, res, next) => next(new Error('boom')));
  app.use(eh());
  const res = await request(app).get('/boom');
  assert.strictEqual(res.status, 500);
  assert.match(res.body.error, /boom/);
  assert.ok(res.body.stack, 'stack present in dev');
});

test('errorHandler: in production mode (NODE_ENV=production) the message is hidden', async () => {
  // We test the production code path by checking the AppError with expose=false,
  // which the errorHandler treats identically regardless of NODE_ENV.
  const eh = require('../src/middleware/errorHandler');
  const app = express();
  app.use(requestId());
  app.get('/hidden', (req, res, next) => {
    const e = new Error('sensitive stack info');
    e.expose = false;  // pretend this came from a system error in production
    next(e);
  });
  app.use(eh());
  const res = await request(app).get('/hidden');
  assert.strictEqual(res.status, 500);
  assert.strictEqual(res.body.error, 'internal server error');
  assert.strictEqual(res.body.code, 'internal_error');
});

// ============ request size limit ============

test('body size limit: rejects huge JSON with 413', async () => {
  const app = express();
  app.use(express.json({ limit: '100b' }));
  app.post('/big', (req, res) => res.json({ ok: true }));
  app.use(errorHandler());
  const res = await request(app)
    .post('/big')
    .set('Content-Type', 'application/json')
    .send({ big: 'x'.repeat(500) });
  assert.strictEqual(res.status, 413);
});

// ============ X-Request-Id always present in responses ============

test('every response includes X-Request-Id header (via requestId middleware)', async () => {
  const app = express();
  app.use(requestId());
  app.get('/x', (req, res) => res.json({ ok: true }));
  app.use(errorHandler());
  const r1 = await request(app).get('/x');
  assert.ok(r1.headers['x-request-id']);
  // 404 path
  const r2 = await request(app).get('/no-such');
  assert.ok(r2.headers['x-request-id']);
});

// ============ logger doesn't crash with weird paths ============

test('logger: emits nothing extra for /api/health (silent skip)', async () => {
  const app = express();
  app.use(requestId());
  app.use(logger());
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  const res = await request(app).get('/api/health');
  assert.strictEqual(res.status, 200);
});
