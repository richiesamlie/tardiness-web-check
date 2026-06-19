// 404 handler — always returns JSON, never HTML.

'use strict';

const { NotFound } = require('../errors');

module.exports = function notFound() {
  return (req, res, next) => {
    next(new NotFound(`route not found: ${req.method} ${req.originalUrl}`));
  };
};
