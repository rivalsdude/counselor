'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

// Read .env without adding a package. Real environment variables win.
// On Vercel there is no .env file; values come from project settings.
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
  const line = `[${new Date().toISOString()}] ${message}`;
  // Vercel captures console output, so error.fix still reaches the logs there.
  console.error(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    // The console line above is the fallback when the filesystem is read-only.
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
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

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

module.exports = { getKey, callOpenAI, KeygenError };
