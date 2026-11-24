'use strict';

const { askAI } = require('../lib/ask-ai');

function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

// Vercel serverless endpoint. Only this server code calls getKey();
// the browser receives just the answer or error.message.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed.' } });
    return;
  }

  const payload = bodyOf(req);
  const message = String(payload.message || '').trim();
  const mode = String(payload.mode || 'pros-cons');

  if (!message) {
    res.status(400).json({ error: { message: 'Please type an idea or question first.' } });
    return;
  }

  try {
    const answer = await askAI({ mode, message });
    res.status(200).json({ answer });
  } catch (error) {
    // error.fix is written to the logs by lib/ai.js; the page only sees the message.
    res.status(502).json({ error: { message: error.message } });
  }
};
