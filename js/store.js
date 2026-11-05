// Persistence: everything lives in this browser's localStorage.
const KEY = 'game-night-leaderboard-v1';

export const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function defaultState() {
  return { version: 1, settings: { currency: '$' }, players: [], tournaments: [] };
}

export function normalize(s) {
  const d = defaultState();
  if (!s || typeof s !== 'object') return d;
  return {
    ...d,
    ...s,
    settings: { ...d.settings, ...(s.settings || {}) },
    players: Array.isArray(s.players) ? s.players : [],
    tournaments: (Array.isArray(s.tournaments) ? s.tournaments : []).map((t) => ({
      status: 'active',
      points: [10, 7, 5, 3, 1],
      participationPoints: 0,
      gameBuyIn: 0,
      games: [],
      playerIds: [],
      createdAt: Date.now(),
      ...t,
      pot: { enabled: false, buyIn: 0, payout: [100], entries: [], ...(t.pot || {}) },
    })),
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not load saved data', e);
  }
  return defaultState();
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('Could not save', e);
    return false;
  }
}
