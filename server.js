'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

// Read .env without adding a package. Real environment variables win.
function loadEnv(file = path.join(ROOT, '.env')) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals === -1) continue;
    const name = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(name in process.env)) process.env[name] = value;
  }
}

loadEnv();

function log(message) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
  } catch (error) {
    console.error('Could not write the log file:', error.message);
  }
}

class KeygenError extends Error {
  constructor(message, fix) {
    super(message);
    this.name = 'KeygenError';
    this.fix = fix;
  }
}

let cachedKey = null;
let pendingLookup = null;

function keygenUrl() {
  return String(process.env.KEYGEN_URL || '').replace(/\/+$/, '');
}

function keygenToken() {
  return String(process.env.KEYGEN_TOKEN || '');
}

function expiryToMs(value) {
  if (typeof value === 'number') {
    return value < 1e12 ? value * 1000 : value;
  }
  const text = String(value ?? '').trim();
  if (/^\d+$/.test(text)) {
    const number = Number(text);
    return number < 1e12 ? number * 1000 : number;
  }
  return Date.parse(text);
}

function keyIsUsable(entry) {
  return Boolean(entry && entry.apiKey) && Date.now() < entry.expiresAt;
}

async function lookupKey() {
  const url = keygenUrl();
  const token = keygenToken();

  if (!url || !token || url === 'paste-here' || token === 'paste-here') {
    throw new KeygenError(
      'The AI service is not set up yet.',
      'Put your MindDo values in .env for KEYGEN_URL and KEYGEN_TOKEN, then restart the server.'
    );
  }

  let response;
  try {
    response = await fetch(`${url}/api/lookup-key`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    throw new KeygenError(
      'Could not reach the AI service.',
      `Check KEYGEN_URL and the internet connection. Details: ${error.message}`
    );
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  // One attempt only: an error reply is logged and shown, never retried.
  if (!response.ok || (body && body.error)) {
    const error = (body && body.error) || {};
    const message = error.message || `The AI service returned HTTP ${response.status}.`;
    const fix = error.fix || 'Check the MindDo key service settings.';
    log(`getKey failed: ${fix}`);
    throw new KeygenError(message, fix);
  }

  const apiKey = body && body.apiKey;
  const expiresAt = expiryToMs(body && body.expiresAt);
  if (!apiKey || !Number.isFinite(expiresAt)) {
    const fix = 'The key service reply must include apiKey and a valid expiresAt.';
    log(`getKey failed: ${fix}`);
    throw new KeygenError('The AI service sent an unexpected reply.', fix);
  }

  cachedKey = { apiKey, expiresAt };
  return cachedKey;
}

// Server-only. The browser never receives the MindDo token or the API key.
async function getKey({ refresh = false } = {}) {
  if (!refresh && keyIsUsable(cachedKey)) {
    return cachedKey.apiKey;
  }

  if (!pendingLookup) {
    pendingLookup = lookupKey().finally(() => {
      pendingLookup = null;
    });
  }

  const entry = await pendingLookup;
  return entry.apiKey;
}

async function callOpenAI(messages) {
  const base = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  async function ask(apiKey) {
    return fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages }),
    });
  }

  let apiKey = await getKey();
  let response = await ask(apiKey);

  // OpenAI turned the key down: get a fresh one, then try the AI call once more.
  if (response.status === 401 || response.status === 403) {
    apiKey = await getKey({ refresh: true });
    response = await ask(apiKey);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      (body && body.error && body.error.message) ||
      `The AI service returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  const answer =
    body &&
    body.choices &&
    body.choices[0] &&
    body.choices[0].message &&
    body.choices[0].message.content;
  if (!answer) {
    throw new Error('The AI service sent an empty answer.');
  }
  return answer;
}

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
      if (!message) {
        return sendJson(res, 400, { error: { message: 'Please type a question first.' } });
      }

      try {
        const answer = await callOpenAI([{ role: 'user', content: message }]);
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

module.exports = { getKey, callOpenAI, server, KeygenError };
