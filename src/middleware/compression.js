// Compression wrapper. Gzip responses > 1KB by default.

'use strict';

const compression = require('compression');

module.exports = function compressionMw() {
  return compression({
    threshold: 1024,
    level: 6,
  });
};
