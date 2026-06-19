// Gzip middleware — native implementation (replaces `compression`).
// Compresses responses >= threshold bytes when client sends Accept-Encoding: gzip.
// Skips already-encoded content types (images, archives).

'use strict';

const { createGzip, gzipSync } = require('node:zlib');

const THRESHOLD = 1024;          // only compress responses >= 1KB
const SKIP_TYPES = /^(image|video|audio|font)\//i;  // already compressed

function shouldCompress(req, res) {
  // Client must accept gzip
  const ae = String(req.headers['accept-encoding'] || '');
  if (!/\bgzip\b/.test(ae)) return false;
  // Don't compress streaming responses
  if (res.headersSent) return false;
  // Skip already-compressed content types
  const ct = res.getHeader('Content-Type') || '';
  if (SKIP_TYPES.test(String(ct))) return false;
  return true;
}

function getBodyLength(res) {
  const cl = res.getHeader('Content-Length');
  if (cl) return parseInt(cl, 10);
  // Look for common headers set by app
  const len = res.getHeader('Content-Length');
  return len || 0;
}

module.exports = function compressionMw(options = {}) {
  const threshold = options.threshold ?? THRESHOLD;

  return function gzipMiddleware(req, res, next) {
    if (!shouldCompress(req, res)) return next();

    // Intercept res.write and res.end to buffer small responses and stream large ones
    const chunks = [];
    let totalLength = 0;
    let useStreaming = false;
    let endCalled = false;

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const originalSetHeader = res.setHeader.bind(res);
    const originalRemoveHeader = res.removeHeader.bind(res);

    // Override setHeader/removeHeader to track Content-Length changes from upstream
    res.setHeader = function (name, value) {
      originalSetHeader(name, value);
    };
    res.removeHeader = function (name) {
      originalRemoveHeader(name);
    };

    res.write = function (chunk, encoding, cb) {
      if (chunk) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
        totalLength += buf.length;
        // Switch to streaming once we exceed threshold
        if (totalLength >= threshold && !useStreaming) {
          useStreaming = true;
          flushAsStream();
        }
        if (!useStreaming) {
          chunks.push(buf);
          if (cb) cb();
          return true;
        }
        // While streaming, delegate to original write
        return originalWrite(chunk, encoding, cb);
      }
      return true;
    };

    res.end = function (chunk, encoding, cb) {
      if (endCalled) return false;
      endCalled = true;

      if (chunk && !useStreaming) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
        chunks.push(buf);
        totalLength += buf.length;
      }

      if (useStreaming) {
        if (chunk) return originalEnd(chunk, encoding, cb);
        return originalEnd(cb);
      }

      // Below threshold — send uncompressed
      if (totalLength < threshold) {
        return originalEnd(Buffer.concat(chunks.length ? chunks : []), cb);
      }

      // Compress the buffered chunks
      try {
        const body = Buffer.concat(chunks);
        const gz = gzipSync(body, { level: options.level ?? 6 });
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Length', gz.length);
        res.setHeader('Vary', 'Accept-Encoding');
        // Remove any pre-set Content-Length that no longer matches
        return originalEnd(gz, cb);
      } catch (e) {
        return originalEnd(Buffer.concat(chunks), cb);
      }
    };

    function flushAsStream() {
      // We've been collecting but now want to stream-compress
      // Replay buffered chunks through a gzip stream
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      // Remove Content-Length since the compressed size is unknown
      res.removeHeader('Content-Length');
      const gz = createGzip({ level: options.level ?? 6 });
      // Pipe original response through gzip
      // Note: res is a writable stream; we wrap it
      gz.pipe(res);
      // Replay buffered chunks
      for (const chunk of chunks) gz.write(chunk);
      chunks.length = 0;
      // Replace res.write and res.end to write to gz
      res.write = function (chunk, encoding, cb) {
        if (chunk) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
          return gz.write(buf, cb);
        }
        return true;
      };
      res.end = function (chunk, encoding, cb) {
        if (chunk) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
          gz.write(buf);
        }
        gz.end(cb);
      };
    }

    next();
  };
};
