import test from 'node:test';
import assert from 'node:assert/strict';
import { newPlayer, completeTraining, periodKeys, weeklyEligibility, constructionTarget } from '../src/training.mjs';

const session = (id, category = 'push', now = '2026-11-04T12:00:00Z', score = 1) => ({ id, category, now, score });

test('three different categories; no duplicate or fourth reward; practice remains available', () => {
  const original = newPlayer();
  let p = completeTraining(original, session('a')).player;
  assert.equal(original.abilities.push, 0);
  assert.equal(p.abilities.push, 120);
  assert.throws(() => completeTraining(p, session('b')), /already trained/);
  p = completeTraining(p, session('b', 'pull')).player;
  p = completeTraining(p, session('c', 'legs')).player;
  assert.throws(() => completeTraining(p, session('d', 'core')), /Daily limit/);
  const practice = completeTraining(p, { ...session('d', 'core'), practice: true });
  assert.deepEqual(practice.reward, { xp: 0, contribution: 0 });
  assert.equal(practice.player, p);
});

test('retry never grants a second reward, including across day boundary', () => {
  const first = completeTraining(newPlayer(), session('a'));
  const retry = completeTraining(first.player, session('a', 'push', '2026-11-05T12:00:00Z'));
  assert.equal(retry.status, 'already-completed');
  assert.deepEqual(retry.player, first.player);
});

test('Hong Kong 04:00 resets day; Monday 04:00 resets week', () => {
  assert.deepEqual(periodKeys('2026-11-08T19:59:59Z'), { day: '2026-11-08', week: '2026-11-02' });
  assert.deepEqual(periodKeys('2026-11-08T20:00:00Z'), { day: '2026-11-09', week: '2026-11-09' });
  let p = completeTraining(newPlayer(), session('a', 'push', '2026-11-08T19:59:59Z')).player;
  p = completeTraining(p, session('b', 'push', '2026-11-08T20:00:00Z')).player;
  assert.equal(p.abilities.push, 240);
  assert.equal(p.mastery.push, 2);
  assert.equal(p.daily.categories.length, 1);
  assert.equal(p.weekly.contributions, 1);
});

test('weekly construction caps at 12 while growth continues; four days and five categories qualify', () => {
  let p = newPlayer();
  const groups = [['push', 'pull', 'legs'], ['core', 'cardio', 'push']];
  for (let d = 0; d < 5; d++) {
    for (const category of groups[d % 2]) {
      p = completeTraining(p, session(`d${d}-${category}`, category, `2026-11-0${2 + d}T12:00:00Z`, 0)).player;
    }
  }
  assert.equal(p.weekly.contributions, 12);
  assert.equal(Object.values(p.abilities).reduce((a, b) => a + b), 1500);
  assert.deepEqual(weeklyEligibility(p), { consistent: true, balanced: true });
  assert.equal(constructionTarget(12), 96);
  assert.equal(constructionTarget(0), 8);
  assert.throws(() => constructionTarget(13));
});

test('reject malformed input without consuming a ticket', () => {
  const p = newPlayer();
  for (const score of [NaN, Infinity, -1, 1.1]) assert.throws(() => completeTraining(p, session('a', 'push', undefined, score)));
  assert.throws(() => completeTraining(p, session('a', 'unknown')));
  assert.throws(() => completeTraining(p, session('a', 'push', 'bad-date')));
  assert.equal(p.daily.categories.length, 0);
});
