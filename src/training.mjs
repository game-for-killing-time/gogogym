export const CATEGORIES = Object.freeze(['push', 'pull', 'legs', 'core', 'cardio']);
const DAY = 86400000;

// Hong Kong 04:00 is UTC 20:00 on the preceding calendar date.
export function periodKeys(now) {
  const timestamp = new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Invalid time');
  const shifted = new Date(timestamp + 4 * 3600000);
  const day = shifted.toISOString().slice(0, 10);
  const monday = new Date(Date.parse(`${day}T00:00:00Z`) - ((shifted.getUTCDay() + 6) % 7) * DAY);
  return { day, week: monday.toISOString().slice(0, 10) };
}

export function newPlayer() {
  return {
    abilities: Object.fromEntries(CATEGORIES.map(c => [c, 0])),
    mastery: Object.fromEntries(CATEGORIES.map(c => [c, 0])),
    daily: { key: null, categories: [] },
    weekly: { key: null, days: [], categories: [], contributions: 0 },
    receipts: {},
  };
}

// Pure local prototype. Production must validate sessions and persist atomically on a server.
export function completeTraining(player, { id, category, score, now, practice = false }) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid session');
  if (!CATEGORIES.includes(category)) throw new Error('Invalid category');
  if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('Invalid score');
  const keys = periodKeys(now);
  if (practice) return { player, reward: { xp: 0, contribution: 0 }, status: 'practice' };
  if (Object.hasOwn(player.receipts, id)) {
    return { player, reward: player.receipts[id], status: 'already-completed' };
  }
  const next = structuredClone(player);
  if (next.daily.key !== keys.day) next.daily = { key: keys.day, categories: [] };
  if (next.weekly.key !== keys.week) {
    next.weekly = { key: keys.week, days: [], categories: [], contributions: 0 };
  }
  if (next.daily.categories.length >= 3) throw new Error('Daily limit reached');
  if (next.daily.categories.includes(category)) throw new Error('Category already trained today');
  const xp = 100 + Math.round(score * 20);
  const contribution = next.weekly.contributions < 12 ? 1 : 0;
  next.abilities[category] += xp;
  next.mastery[category] += 1;
  next.daily.categories.push(category);
  if (!next.weekly.days.includes(keys.day)) next.weekly.days.push(keys.day);
  if (!next.weekly.categories.includes(category)) next.weekly.categories.push(category);
  next.weekly.contributions += contribution;
  next.lastTraining = {category, xp, at: new Date(now).toISOString()};
  next.completedWeeks = [...new Set([...(Array.isArray(next.completedWeeks)?next.completedWeeks:[]), ...(next.weekly.days.length>=4?[keys.week]:[])])];
  const reward = { xp, contribution };
  Object.defineProperty(next.receipts, id, { value: reward, enumerable: true, configurable: true, writable: true });
  return { player: next, reward, status: 'completed' };
}

export function weeklyEligibility(player) {
  return { consistent: player.weekly.days.length >= 4, balanced: player.weekly.categories.length === 5 };
}

export function constructionTarget(activeMembers) {
  if (!Number.isInteger(activeMembers) || activeMembers < 0 || activeMembers > 12) throw new Error('Invalid member count');
  return Math.max(1, activeMembers) * 8;
}
