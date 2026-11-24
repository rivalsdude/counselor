// All browser saving lives here. Swap this file for a database later.
const STORAGE_KEY = 'counselor.ideas.v1';

const SAMPLE_IDEAS = [
  {
    id: 'sample-dog-walking',
    title: 'Start a weekend dog-walking service',
    mode: 'pros-cons',
    answer: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sample-robotics-club',
    title: 'Join the school robotics club',
    mode: 'challenge',
    answer: '',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'sample-board-game-night',
    title: 'Plan a family board-game night',
    mode: 'risks',
    answer: '',
    updatedAt: '2026-01-03T00:00:00.000Z',
  },
];

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(ideas) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
    return true;
  } catch {
    return false;
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idea-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function listIdeas() {
  const stored = readStored();
  if (stored) return stored;

  const samples = SAMPLE_IDEAS.map((idea) => ({ ...idea }));
  writeStored(samples);
  return samples;
}

export function saveIdea({ id, title, mode, answer }) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return null;

  const ideas = listIdeas();
  const ideaId = id || newId();
  const next = {
    id: ideaId,
    title: cleanTitle,
    mode: String(mode || 'pros-cons'),
    answer: String(answer || ''),
    updatedAt: new Date().toISOString(),
  };

  const index = ideas.findIndex((idea) => idea.id === ideaId);
  if (index >= 0) {
    ideas[index] = { ...ideas[index], ...next };
  } else {
    ideas.unshift(next);
  }

  return writeStored(ideas) ? next : null;
}

export function deleteIdea(id) {
  const ideas = listIdeas().filter((idea) => idea.id !== id);
  writeStored(ideas);
  return ideas;
}
