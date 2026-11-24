'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

test('reuses the same key until it expires', async () => {
  let lookups = 0;
  const keygen = await listen((req, res) => {
    lookups += 1;
    json(res, 200, {
      apiKey: 'key-one',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  process.env.KEYGEN_URL = keygen.url;
  process.env.KEYGEN_TOKEN = 'test-token';
  const { getKey } = require('../server');

  assert.equal(await getKey({ refresh: true }), 'key-one');
  assert.equal(await getKey(), 'key-one');
  assert.equal(lookups, 1);

  await close(keygen.server);
});

test('asks for a new key after expiresAt', async () => {
  let lookups = 0;
  const keygen = await listen((req, res) => {
    lookups += 1;
    const expiresAt =
      lookups === 1
        ? new Date(Date.now() - 1_000).toISOString()
        : new Date(Date.now() + 60_000).toISOString();
    json(res, 200, { apiKey: `key-${lookups}`, expiresAt });
  });

  process.env.KEYGEN_URL = keygen.url;
  const { getKey } = require('../server');

  assert.equal(await getKey({ refresh: true }), 'key-1');
  assert.equal(await getKey(), 'key-2');
  assert.equal(lookups, 2);

  await close(keygen.server);
});

test('shows error.message, logs error.fix, and tries only once', async () => {
  let lookups = 0;
  const keygen = await listen((req, res) => {
    lookups += 1;
    json(res, 500, {
      error: {
        message: 'MindDo could not issue a key.',
        fix: 'Check the MindDo project settings.',
      },
    });
  });

  process.env.KEYGEN_URL = keygen.url;
  const { getKey, KeygenError } = require('../server');
  const logFile = path.join(__dirname, '..', 'logs', 'server.log');
  const before = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';

  await assert.rejects(
    () => getKey({ refresh: true }),
    (error) => {
      assert.ok(error instanceof KeygenError);
      assert.equal(error.message, 'MindDo could not issue a key.');
      return true;
    }
  );

  assert.equal(lookups, 1);
  const after = fs.readFileSync(logFile, 'utf8');
  assert.ok(after.slice(before.length).includes('Check the MindDo project settings.'));

  await close(keygen.server);
});

test('refreshes the key when OpenAI rejects it', async () => {
  let lookups = 0;
  const keygen = await listen((req, res) => {
    lookups += 1;
    json(res, 200, {
      apiKey: `key-${lookups}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  let aiCalls = 0;
  const openai = await listen((req, res) => {
    aiCalls += 1;
    if (aiCalls === 1) {
      json(res, 401, { error: { message: 'Incorrect API key provided.' } });
      return;
    }
    json(res, 200, { choices: [{ message: { content: 'Try three small steps.' } }] });
  });

  process.env.KEYGEN_URL = keygen.url;
  process.env.OPENAI_BASE_URL = openai.url;
  const { getKey, callOpenAI } = require('../server');

  await getKey({ refresh: true });
  assert.equal(
    await callOpenAI([{ role: 'user', content: 'Hello' }]),
    'Try three small steps.'
  );
  assert.equal(lookups, 2);
  assert.equal(aiCalls, 2);

  await close(keygen.server);
  await close(openai.server);
});
