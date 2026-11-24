'use strict';

const { callOpenAI } = require('../lib/ai');

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

  const message = String(bodyOf(req).message || '').trim();
  if (!message) {
    res.status(400).json({ error: { message: 'Please type a question first.' } });
    return;
  }

  try {
    const answer = await callOpenAI([{ role: 'user', content: message }]);
    res.status(200).json({ answer });
  } catch (error) {
    // error.fix is written to the logs by lib/ai.js; the page only sees the message.
    res.status(502).json({ error: { message: error.message } });
  }
};
