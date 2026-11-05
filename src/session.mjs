const clamp = value => Math.max(0, Math.min(1, value));
const categories = new Set(['push', 'pull', 'legs', 'core', 'cardio']);
const openingFeedback = {
  push: '按住發力，進入右方綠區時放開',
  pull: '按住拉動，指標進入綠區時放開，讓手柄平穩回收',
  legs: '按住慢慢下蹲，到達綠區時放開起身',
  core: '按住左或右修正重心，留在中央綠區',
  cardio: '等腳印到達中線，交替按左、右踏步',
};

export function createSession(category) {
  if (!categories.has(category)) throw new RangeError(`Unknown training category: ${category}`);
  return {
    category, time: 0, points: 0, attempts: 0, done: false,
    feedback: openingFeedback[category], stamina: 100, sprint: false,
    beats: Array.from({ length: 24 }, (_, i) => ({ at: 3 + i * .9, side: i % 2 ? 'right' : 'left', hit: false })),
    rep: 0, phase: { push: 'charge', pull: 'pull', legs: 'descend', core: 'balance', cardio: 'running' }[category],
    height: 0, held: false, phaseTime: 0, lift: 0, repStarted: false,
    extension: 0, depth: 0, holdTime: 0, returnFrom: 0,
    balance: 0, leftHeld: false, rightHeld: false, stableTime: 0, activeTime: 0,
    controlDirection: 0, controlTime: 0, controlCounted: false,
  };
}

// Losing focus or pausing must clear keys without interpreting them as a release action.
export function releaseInputs(s) {
  s.held = false;
  s.sprint = false;
  s.leftHeld = false;
  s.rightHeld = false;
  s.controlDirection = 0;
  s.controlTime = 0;
  s.controlCounted = false;
}

function startHold(s) {
  s.held = true;
  if (!s.repStarted) {
    s.repStarted = true;
    s.attempts++;
  }
}

function changePhase(s, phase) {
  s.phase = phase;
  s.phaseTime = 0;
  s.held = false;
}

function finish(s) {
  s.done = true;
  releaseInputs(s);
}

function nextRep(s, phase) {
  s.rep++;
  changePhase(s, phase);
  s.height = s.extension = s.depth = s.holdTime = 0;
  s.repStarted = false;
  if (s.rep >= 6) finish(s);
  else s.feedback = openingFeedback[s.category];
}

export function input(s, action, down = true) {
  if (s.done) return;
  if (s.category === 'cardio') {
    if (action === 'sprint') { s.sprint = down; return; }
    if (!down || !['left', 'right'].includes(action)) return;
    const beat = s.beats.find(b => !b.hit && Math.abs(b.at - s.time) <= .32);
    if (!beat) { s.feedback = '等腳印到達中線再踏步'; return; }
    beat.hit = true;
    s.attempts++;
    const quality = beat.side === action ? clamp(1 - Math.abs(beat.at - s.time) / .32) : 0;
    s.points += clamp(quality * (s.stamina < 15 ? .7 : 1) + (quality > .25 && s.sprint && s.stamina > 15 ? .12 : 0));
    s.feedback = quality > .8 ? '完美踏步！' : quality > .25 ? '跟得上！' : '留意左右腳同時機';
    return;
  }
  if (s.category === 'core') {
    if (action === 'left') s.leftHeld = down;
    if (action === 'right') s.rightHeld = down;
    return;
  }
  if (s.category === 'pull' || s.category === 'legs') {
    const isPull = s.category === 'pull';
    if (action !== (isPull ? 'row' : 'squat') || s.phase !== (isPull ? 'pull' : 'descend')) return;
    if (down && !s.held) startHold(s);
    else if (!down && s.held) {
      const position = isPull ? s.extension : s.depth;
      const positionScore = clamp(1 - Math.abs(position - .78) / .4);
      // Squats also reward a controlled descent instead of lingering at full depth.
      const controlScore = clamp(1 - Math.abs(s.holdTime - .78 / .42) / 1.4);
      const score = isPull ? positionScore : positionScore * .75 + controlScore * .25;
      s.points += score;
      s.returnFrom = position;
      changePhase(s, isPull ? 'recover' : 'rise');
      s.feedback = isPull
        ? (score > .8 ? '拉得穩！放鬆讓手柄回收' : '手柄回收中，下次在綠區放開')
        : (score > .8 ? '深度剛好！穩定起身中' : '穩定起身中，下次在綠區放開');
    }
    return;
  }
  if (action !== 'lift') return;
  if (s.phase === 'charge') {
    if (down && !s.held) startHold(s);
    else if (!down && s.held) {
      s.lift = clamp(1 - Math.abs(s.height - .78) / .55);
      changePhase(s, 'lower');
      s.feedback = '回落中：接近左方綠區，再按一下接住';
    }
  } else if (s.phase === 'lower' && down) {
    const catchScore = clamp(1 - Math.abs(s.height - .17) / .24);
    s.points += (s.lift + catchScore) / 2;
    s.feedback = catchScore > .65 ? '接得穩！' : '下一組再調整回落時機';
    changePhase(s, 'rest');
  }
}

function tickCore(s, dt) {
  const direction = Number(s.rightHeld) - Number(s.leftHeld);
  if (direction !== s.controlDirection) {
    s.controlDirection = direction;
    s.controlTime = 0;
    s.controlCounted = false;
  }
  if (direction) {
    s.activeTime += dt;
    s.controlTime += dt;
    // Keyboard repeats and instantaneous taps are not separate corrections.
    if (!s.controlCounted && s.controlTime >= .12) {
      s.attempts++;
      s.controlCounted = true;
    }
  }
  const drift = .1 + Math.sin(s.time * 1.85) * .35 + Math.cos(s.time * .57) * .15;
  s.balance = Math.max(-1, Math.min(1, s.balance + dt * (drift + direction * .9)));
  if (Math.abs(s.balance) <= .25) {
    if (s.attempts > 0) s.stableTime += dt;
    s.feedback = '重心穩定！輕輕修正，保持在綠區';
  } else s.feedback = s.balance > 0 ? '向右傾了，按住左邊修正' : '向左傾了，按住右邊修正';
  s.points = s.stableTime;
  if (s.time >= 25) finish(s);
}

function tickPullOrLegs(s, dt) {
  const isPull = s.category === 'pull';
  const activePhase = isPull ? 'pull' : 'descend';
  const returnPhase = isPull ? 'recover' : 'rise';
  const field = isPull ? 'extension' : 'depth';
  if (s.phase === activePhase) {
    if (s.held) {
      s[field] = clamp(s[field] + dt * (isPull ? .6 : .42));
      s.holdTime += dt;
    }
    if (s.phaseTime >= 5) {
      s.returnFrom = s[field];
      changePhase(s, returnPhase);
      s.feedback = isPull ? '本次未完成拉動，下次在綠區放開' : '本次未完成深蹲，下次在綠區放開';
    }
  } else if (s.phase === returnPhase) {
    const duration = isPull ? .7 : .85;
    s[field] = s.returnFrom * (1 - clamp(s.phaseTime / duration));
    if (s.phaseTime >= duration) changePhase(s, 'rest');
  } else if (s.phase === 'rest' && s.phaseTime >= .55) nextRep(s, activePhase);
}

export function tick(s, dt) {
  if (s.done || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .1);
  if (s.category === 'cardio' || s.category === 'core') dt = Math.min(dt, Math.max(0, 25 - s.time));
  s.time += dt;
  if (s.category === 'cardio') {
    s.stamina = Math.max(0, Math.min(100, s.stamina + dt * (s.sprint ? -18 : 11)));
    if (s.time >= 25) finish(s);
    return;
  }
  if (s.category === 'core') { tickCore(s, dt); return; }
  s.phaseTime += dt;
  if (s.category === 'pull' || s.category === 'legs') { tickPullOrLegs(s, dt); return; }
  if (s.phase === 'charge') {
    if (s.held) s.height = Math.min(1, s.height + dt * .48);
    if (s.phaseTime > 5) {
      changePhase(s, 'rest');
      s.feedback = '先按住發力，再在右方綠區放開';
    }
  } else if (s.phase === 'lower') {
    s.height = Math.max(0, s.height - dt * .34);
    if (s.height === 0 || s.phaseTime > 4) {
      s.points += s.lift / 2;
      changePhase(s, 'rest');
      s.feedback = '錯過接住時機，下組再試';
    }
  } else if (s.phase === 'rest' && s.phaseTime > .85) nextRep(s, 'charge');
}

export function sessionResult(s) {
  const denominator = s.category === 'cardio' ? 24 : s.category === 'core' ? 25 : 6;
  return {
    score: clamp(s.points / denominator),
    qualified: s.done && s.attempts >= 3 && (s.category !== 'core' || s.activeTime >= 1.5),
  };
}
