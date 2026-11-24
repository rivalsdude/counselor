'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { before, after } = require('node:test');

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

function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(JSON.parse(body || '{}')));
  });
}

let keygen;

before(async () => {
  keygen = await listen((req, res) => {
    json(res, 200, {
      apiKey: 'test-key',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });
  process.env.KEYGEN_URL = keygen.url;
  process.env.KEYGEN_TOKEN = 'test-token';
});

after(async () => {
  await close(keygen.server);
});

test('sends the Counselor instructions with every message', async () => {
  let captured;
  const openai = await listen(async (req, res) => {
    captured = await readJson(req);
    json(res, 200, { choices: [{ message: { content: 'A balanced answer.' } }] });
  });

  process.env.OPENAI_BASE_URL = openai.url;
  const { askAI } = require('../lib/ask-ai');

  const answer = await askAI({
    mode: 'pros-cons',
    message: 'Start a dog-walking service.',
  });

  assert.equal(answer, 'A balanced answer.');
  assert.equal(captured.messages[0].role, 'system');
  assert.match(captured.messages[0].content, /Do not blindly agree/);
  assert.match(captured.messages[0].content, /988/);
  assert.match(captured.messages[0].content, /Current task: Give a balanced pros and cons list/);
  assert.equal(captured.messages[1].role, 'user');
  assert.equal(captured.messages[1].content, 'Start a dog-walking service.');

  await close(openai.server);
});

test('returns the safety message for a crisis message without calling OpenAI', async () => {
  let called = false;
  const openai = await listen((req, res) => {
    called = true;
    json(res, 200, { choices: [{ message: { content: 'This should not be used.' } }] });
  });

  process.env.OPENAI_BASE_URL = openai.url;
  const { askAI, SAFETY_MESSAGE } = require('../lib/ask-ai');

  const answer = await askAI({ mode: 'question', message: 'I want to hurt myself.' });

  assert.equal(answer, SAFETY_MESSAGE);
  assert.equal(called, false);
  await close(openai.server);
});

test('uses the challenge instructions for challenge mode', async () => {
  let captured;
  const openai = await listen(async (req, res) => {
    captured = await readJson(req);
    json(res, 200, { choices: [{ message: { content: 'Here are the assumptions.' } }] });
  });

  process.env.OPENAI_BASE_URL = openai.url;
  const { askAI } = require('../lib/ask-ai');

  await askAI({
    mode: 'challenge',
    message: 'I will finish my project in one weekend.',
  });

  assert.match(captured.messages[0].content, /Current task: Challenge the user's assumptions/);
  await close(openai.server);
});
