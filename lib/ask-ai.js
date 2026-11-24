'use strict';

const { callOpenAI } = require('./ai');

const SAFETY_MESSAGE =
  "I can't help with this as a normal planning question. If you might hurt yourself or someone else, please call or text 988 right now and talk to a trusted adult immediately. If this is a medical, legal, or emergency issue, contact a qualified professional or local emergency services.";

const CRISIS_PATTERN =
  /\b(suicide|suicidal|self[- ]?harm|want to die|end my life|kill myself|hurt myself|cut myself|i (?:want|might|am going|plan) to (?:hurt|kill) (?:myself|someone|him|her|them))\b/i;

const SYSTEM_PROMPT = `You are Counselor, a second-opinion assistant for a middle-school student who is planning something. You talk to someone who may not want to ask other people for help. Be polite, calm, and helpful, like a business advisor with a law degree.

Your job:
- Answer the user's question and give practical suggestions.
- Be a real second opinion. Do not blindly agree. If the idea has weak points, say so clearly but respectfully.
- Use only the facts the user gives you and reliable, general knowledge. Do not invent specific statistics, names, or sources. If you are not sure, say "I'm not sure" instead of guessing.
- Never blame the user. Never be rude. Never suggest anything harmful, illegal, or dangerous.
- Do not give medical, legal, or emergency advice. For those, say you cannot advise and suggest a qualified professional or local emergency services.
- If the user mentions hurting themselves or someone else, tell them to call or text 988 now and talk to a trusted adult right away. Do not continue with normal planning advice.

How to answer an idea:
1. Start with one sentence that says how good or bad the idea looks overall.
2. Give a short list of pros and cons. Use plain language.
3. End with one sentence suggesting how to build on the idea or a safer alternative.

Use plain text. Put each list item on its own line starting with "- ". Do not use tables, code blocks, or markdown headings. Keep the whole answer short enough to read on one screen.

For a general question:
- Answer it directly and accurately first.
- If you are unsure, say so.
- If it relates to a plan, add a short "What this means for your plan" list.
- Keep it concise.

You are not ChatGPT. You are explicitly instructed to disagree when the plan has weak points.`;

const MODES = {
  'pros-cons': {
    label: 'Pros & cons',
    instruction:
      "Give a balanced pros and cons list for the user's idea. Include at least two pros and two cons. Do not pretend the idea is perfect.",
  },
  challenge: {
    label: 'Challenge my assumptions',
    instruction:
      "Challenge the user's assumptions. Name 3 to 5 assumptions in the plan, explain why each might be wrong, and suggest one small test for each. Be respectful, not harsh.",
  },
  risks: {
    label: 'Risks',
    instruction:
      "List the realistic risks of the idea, including who could be affected. For each risk, suggest one practical way to reduce it. Do not scare the user.",
  },
  question: {
    label: 'Ask a question',
    instruction:
      "Answer the user's question accurately and safely. If it is about a plan, connect the answer back to the plan and add a short next step.",
  },
};

async function askAI({ mode = 'pros-cons', message } = {}) {
  const text = String(message || '').trim();
  if (!text) {
    throw new Error('Please type an idea or question first.');
  }

  if (CRISIS_PATTERN.test(text)) {
    return SAFETY_MESSAGE;
  }

  const task = MODES[mode] || MODES['pros-cons'];
  const system = `${SYSTEM_PROMPT}\n\nCurrent task: ${task.instruction}`;

  return callOpenAI([
    { role: 'system', content: system },
    { role: 'user', content: text },
  ]);
}

module.exports = { askAI, MODES, SAFETY_MESSAGE, SYSTEM_PROMPT };
