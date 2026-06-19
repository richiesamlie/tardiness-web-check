// Request ID middleware.
// Attaches a unique ID to every request, available on req.id and in the X-Request-Id response header.
// Makes errors traceable in logs.

'use strict';

const { randomUUID } = require('node:crypto');

module.exports = function requestId() {
  return (req, res, next) => {
    const incoming = req.get('X-Request-Id');
    req.id = (incoming && /^[\w-]{8,64}$/.test(incoming)) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  };
};
