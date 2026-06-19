// Global error handler — turns everything into consistent JSON.
// Shape: { error: "human-readable", code: "machine_code", requestId: "uuid", details?: ... }

'use strict';

const config = require('../config');
const { AppError, BadRequest, PayloadTooLarge } = require('../errors');

function buildBody(err, requestId) {
  const body = {
    error: err.expose === false ? 'internal server error' : (err.message || 'internal server error'),
    code: err.code || 'internal_error',
    requestId,
  };
  if (err.details !== undefined) body.details = err.details;
  // Include stack only in development
  if (config.nodeEnv !== 'production' && err.stack) {
    body.stack = err.stack.split('\n').slice(0, 5).join('\n');
  }
  return body;
}

// Map body-parser / express errors to typed AppErrors.
function mapKnownErrors(err) {
  if (err && err.type === 'entity.too.large') {
    return new PayloadTooLarge('request body is too large', { limit: err.limit });
  }
  if (err && err.type === 'entity.parse.failed') {
    return new BadRequest('invalid JSON in request body');
  }
  if (err && err.type === 'charset.unsupported') {
    return new BadRequest('unsupported charset in request body');
  }
  return err;
}

module.exports = function errorHandler() {
  // 4 args required for Express to recognize as error middleware
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    err = mapKnownErrors(err);
    const isProd = config.nodeEnv === 'production';
    let appErr;
    if (err instanceof AppError) {
      appErr = err;
    } else {
      // For unknown errors: in production, hide everything; in dev, expose message
      const expose = isProd ? false : (err.expose !== false);
      const message = expose ? (err.message || 'internal server error') : 'internal server error';
      appErr = new AppError(message, { status: 500, code: 'internal_error', expose });
    }

    if (appErr.status >= 500) {
      console.error(`[error] ${req.id} ${req.method} ${req.originalUrl}`, err);
    }

    res.status(appErr.status).json(buildBody(appErr, req.id));
  };
};
