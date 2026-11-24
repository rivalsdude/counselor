'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { askAI } = require('../lib/ask-ai');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error('Request is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function serveStatic(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    try {
      const raw = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(raw || '{}');
      } catch {
        return sendJson(res, 400, { error: { message: 'Please send valid JSON.' } });
      }

      const message = String(payload.message || '').trim();
      const mode = String(payload.mode || 'pros-cons');
      if (!message) {
        return sendJson(res, 400, { error: { message: 'Please type an idea or question first.' } });
      }

      try {
        const answer = await askAI({ mode, message });
        return sendJson(res, 200, { answer });
      } catch (error) {
        // error.fix is already in the log; the page only sees the message.
        return sendJson(res, 502, { error: { message: error.message } });
      }
    } catch {
      return sendJson(res, 400, { error: { message: 'Could not read the request.' } });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(res, url.pathname);
  }

  return sendJson(res, 405, { error: { message: 'Method not allowed.' } });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`Counselor is running at http://localhost:${port}`);
  });
}

module.exports = { server };
