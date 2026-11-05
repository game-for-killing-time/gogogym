import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, input, tick, sessionResult, releaseInputs } from '../src/session.mjs';

const categories = ['push', 'pull', 'legs', 'core', 'cardio'];
function advance(s, duration) {
  const target = s.time + duration;
  for (let i = 0; s.time < target && !s.done && i < 10000; i++) tick(s, Math.min(.01, target - s.time));
}
function completeReps(category, target = .78) {
  const s = createSession(category);
  const action = category === 'pull' ? 'row' : 'squat';
  const field = category === 'pull' ? 'extension' : 'depth';
  for (let rep = 0; rep < 6; rep++) {
    input(s, action, true);
    while (s[field] < target) tick(s, .01);
    input(s, action, false);
    const points = s.points;
    input(s, action, true);
    input(s, action, false);
    assert.equal(s.points, points, 'inputs during recovery cannot score again');
    while (s.rep === rep && !s.done) tick(s, .01);
  }
  return s;
}
function balanceActively(s) {
  let direction = 0;
  while (!s.done) {
    if ((direction === -1 && s.balance < 0) || (direction === 1 && s.balance > 0)) direction = 0;
    if (!direction && s.balance > .12) direction = -1;
    if (!direction && s.balance < -.12) direction = 1;
    input(s, 'left', direction === -1);
    input(s, 'right', direction === 1);
    tick(s, .01);
  }
}

test('all five sessions finish without input and grant no idle reward', () => {
  for (const category of categories) {
    const s = createSession(category);
    advance(s, 60);
    assert.equal(s.done, true, category);
    assert.deepEqual(sessionResult(s), { score: 0, qualified: false }, category);
  }
  assert.throws(() => createSession('unknown'), RangeError);
  assert.throws(() => createSession(), RangeError);
});

test('rowing completes six separately scored pulls and automatic recoveries', () => {
  const s = completeReps('pull');
  assert.equal(s.rep, 6);
  assert.equal(s.attempts, 6);
  assert.equal(s.extension, 0);
  assert.equal(sessionResult(s).qualified, true);
  assert.ok(sessionResult(s).score > .98);
  assert.ok(s.time > 14 && s.time < 17);
  const early = completeReps('pull', .2);
  assert.ok(sessionResult(early).score < .2, 'early release loses technique points');
});

test('squats score depth and controlled descent, then rise without a catch input', () => {
  const s = completeReps('legs');
  assert.equal(s.rep, 6);
  assert.equal(s.attempts, 6);
  assert.equal(s.depth, 0);
  assert.equal(sessionResult(s).qualified, true);
  assert.ok(sessionResult(s).score > .98);
  assert.ok(s.time > 19 && s.time < 21);
  const shallow = completeReps('legs', .2);
  assert.ok(sessionResult(shallow).score < .2);
  const lingering = createSession('legs');
  input(lingering, 'squat');
  advance(lingering, 4);
  input(lingering, 'squat', false);
  assert.equal(lingering.phase, 'rise');
  assert.ok(lingering.points < .5, 'lingering below the target loses control points');
});

test('held rowing and squat inputs time out, release controls and cannot stall a session', () => {
  for (const category of ['pull', 'legs']) {
    const s = createSession(category);
    input(s, category === 'pull' ? 'row' : 'squat');
    advance(s, 5.2);
    assert.equal(s.held, false);
    assert.equal(s.points, 0);
    assert.equal(s.phase, category === 'pull' ? 'recover' : 'rise');
    advance(s, 60);
    assert.equal(s.done, true);
    assert.equal(sessionResult(s).qualified, false);
  }
});

test('core balance responds to deliberate held corrections with deterministic drift', () => {
  const first = createSession('core');
  const second = createSession('core');
  balanceActively(first);
  balanceActively(second);
  assert.deepEqual(first, second);
  assert.equal(first.time, 25);
  assert.ok(first.attempts >= 3);
  assert.ok(first.activeTime >= 1.5);
  assert.ok(first.stableTime > 23);
  assert.ok(sessionResult(first).score > .92);
  assert.equal(sessionResult(first).qualified, true);
  assert.equal(first.leftHeld, false);
  assert.equal(first.rightHeld, false);
});

test('core repeated keydowns, simultaneous directions and instant taps do not qualify', () => {
  const repeated = createSession('core');
  while (!repeated.done) { input(repeated, 'left'); tick(repeated, .01); }
  assert.equal(repeated.attempts, 1);
  assert.equal(sessionResult(repeated).qualified, false);
  assert.equal(repeated.balance, -1);
  const both = createSession('core');
  input(both, 'left');
  input(both, 'right');
  advance(both, 30);
  assert.equal(both.attempts, 0);
  assert.deepEqual(sessionResult(both), { score: 0, qualified: false });
  const taps = createSession('core');
  for (let i = 0; i < 20; i++) { input(taps, 'left'); input(taps, 'left', false); tick(taps, .01); }
  advance(taps, 30);
  assert.equal(taps.attempts, 0);
  assert.equal(sessionResult(taps).qualified, false);
});

test('pause clearing neither releases a repetition nor awards points, and resumes the same attempt', () => {
  for (const [category, action, field] of [['push', 'lift', 'height'], ['pull', 'row', 'extension'], ['legs', 'squat', 'depth']]) {
    const s = createSession(category);
    input(s, action);
    advance(s, .5);
    const before = { phase: s.phase, points: s.points, position: s[field], time: s.time, phaseTime: s.phaseTime, attempts: s.attempts };
    releaseInputs(s);
    assert.equal(s.held, false);
    assert.deepEqual({ phase: s.phase, points: s.points, position: s[field], time: s.time, phaseTime: s.phaseTime, attempts: s.attempts }, before);
    input(s, action);
    assert.equal(s.attempts, 1, 'resuming the same rep does not inflate participation');
    advance(s, .1);
    assert.ok(s[field] > before.position);
  }
  const core = createSession('core');
  input(core, 'left');
  advance(core, .2);
  const before = [core.time, core.balance, core.points, core.activeTime, core.attempts];
  releaseInputs(core);
  assert.deepEqual([core.time, core.balance, core.points, core.activeTime, core.attempts], before);
  assert.equal(core.leftHeld, false);
  const cardio = createSession('cardio');
  input(cardio, 'sprint');
  releaseInputs(cardio);
  assert.equal(cardio.sprint, false);
});

test('all sessions ignore invalid frame durations and remain immutable after completion', () => {
  for (const category of categories) {
    const s = createSession(category);
    const initial = structuredClone(s);
    for (const dt of [NaN, Infinity, -1, 0]) tick(s, dt);
    input(s, 'invalid-action');
    assert.deepEqual(s, initial);
    advance(s, 60);
    const finished = structuredClone(s);
    for (const action of ['left', 'right', 'sprint', 'lift', 'row', 'squat']) input(s, action);
    tick(s, .1);
    assert.deepEqual(s, finished);
  }
});
