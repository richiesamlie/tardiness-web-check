// Typed error classes + helpers for consistent JSON error responses.
// All errors are catchable; the global errorHandler in src/middleware/errorHandler.js
// turns them into { error, message, requestId, ... } JSON.

'use strict';

class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error', details = undefined, expose = true } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = expose;  // if true, send to client; else log + 500
  }
}

class BadRequest extends AppError {
  constructor(message, details) { super(message, { status: 400, code: 'bad_request', details }); }
}

class Unauthorized extends AppError {
  constructor(message = 'unauthorized', details) { super(message, { status: 401, code: 'unauthorized', details }); }
}

class NotFound extends AppError {
  constructor(message = 'not found', details) { super(message, { status: 404, code: 'not_found', details }); }
}

class Conflict extends AppError {
  constructor(message, details) { super(message, { status: 409, code: 'conflict', details }); }
}

class PayloadTooLarge extends AppError {
  constructor(message = 'payload too large', details) { super(message, { status: 413, code: 'payload_too_large', details }); }
}

class RateLimited extends AppError {
  constructor(message = 'too many requests', details) { super(message, { status: 429, code: 'rate_limited', details }); }
}

class ServiceUnavailable extends AppError {
  constructor(message = 'service unavailable', details) { super(message, { status: 503, code: 'service_unavailable', details }); }
}

module.exports = {
  AppError,
  BadRequest,
  Unauthorized,
  NotFound,
  Conflict,
  PayloadTooLarge,
  RateLimited,
  ServiceUnavailable,
};
