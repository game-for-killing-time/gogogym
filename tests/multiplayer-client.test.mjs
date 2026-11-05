import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerClient } from '../src/multiplayer.mjs';

const CODE = 'GYM123', TOKEN = 'private-session-token-for-player-one';
const KEY = 'pixel-gym.room-session.v1';
const memoryStorage = () => {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
};
function timers() {
  let id = 0;
  const pending = new Map();
  return {
    setTimer(fn, delay) { pending.set(++id, { fn, delay }); return id; },
    clearTimer(id) { pending.delete(id); },
    fire(delay) {
      const item = [...pending].find(([, v]) => v.delay === delay);
      assert.ok(item, `expected timer after ${delay}ms`);
      pending.delete(item[0]); item[1].fn();
    },
    delays: () => [...pending.values()].map(v => v.delay),
  };
}
function snapshot(time = 1, exercise = null) {
  return { roomCode: CODE, capacity: 12, serverTime: time, players: [{ id: 'p1', name: '阿晴', color: '#81e8bb', x: 1050, y: 592, dir: 0, moving: false, emote: null, exercise, connected: true }] };
}
const joined = (time = 1, seq = 0) => ({ roomCode: CODE, playerId: 'p1', token: TOKEN, seq, snapshot: snapshot(time) });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('create, polling, and leave keep tokens out of URLs and persist a per-tab sequence', async () => {
  const clock = timers(), storage = memoryStorage(), calls = [], statuses = [], snapshots = [];
  const client = new MultiplayerClient({ ...clock, storage, onStatus: s => statuses.push(s), onSnapshot: s => snapshots.push(s),
    getState: () => ({ x: 900, y: 590, dir: 1, moving: true, emote: null, exercise: null }),
    fetch: async (url, options) => {
      calls.push({ url, ...options, body: JSON.parse(options.body) });
      if (url === '/api/rooms') return json(joined());
      if (url.endsWith('/leave')) return json({ ok: true });
      return json({ snapshot: snapshot(2) });
    },
  });
  await client.create('阿晴');
  assert.equal(client.status, 'online');
  assert.deepEqual(clock.delays(), [250]);
  await client.syncNow();
  assert.equal(JSON.parse(storage.getItem(KEY)).seq, 1);
  assert.equal(calls[1].body.state.x, 900);
  assert.equal(calls[1].body.token, TOKEN);
  assert.ok(calls.every(c => !c.url.includes(TOKEN) && !c.url.includes('?')));
  assert.deepEqual(statuses, ['connecting', 'online']);
  assert.deepEqual(snapshots.map(s => s.serverTime), [1, 2]);
  await client.leave();
  assert.equal(calls.at(-1).keepalive, true);
  assert.equal(client.session, null);
  assert.equal(client.snapshot, null);
  assert.equal(storage.getItem(KEY), null);
  assert.equal(client.status, 'offline');
  assert.deepEqual(clock.delays(), []);
});

test('refresh resumes the same membership and continues after the server sequence', async () => {
  const storage = memoryStorage(), calls = [], clock = timers();
  storage.setItem(KEY, JSON.stringify({ roomCode: CODE, playerId: 'p1', token: TOKEN, name: '阿晴', seq: 5 }));
  const client = new MultiplayerClient({ ...clock, storage, fetch: async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    return json(url.endsWith('/join') ? joined(20, 23) : { snapshot: snapshot(21) });
  } });
  assert.equal(await client.restore(), true);
  assert.equal(calls[0].url, `/api/rooms/${CODE}/join`);
  assert.equal(calls[0].body.token, TOKEN);
  await client.syncNow();
  assert.equal(calls[1].body.seq, 24);
  assert.equal(client.session.playerId, 'p1');
  client.dispose();
  assert.equal(JSON.parse(storage.getItem(KEY)).seq, 24, 'teardown preserves resume state');
});

test('all publishes and station mutations are serialized; release suppresses a late animation', async () => {
  const clock = timers(), calls = [], blocked = deferred();
  let active = 0, maxActive = 0, state = { x: 615, y: 553, exercise: null };
  const client = new MultiplayerClient({ ...clock, storage: memoryStorage(), getState: () => state, fetch: async (url, options) => {
    active++; maxActive = Math.max(maxActive, active);
    const body = JSON.parse(options.body); calls.push({ url, body });
    try {
      if (url === '/api/rooms') return json(joined());
      if (url.endsWith('/sync') && body.seq === 1) await blocked.promise;
      return json({ snapshot: snapshot(calls.length) });
    } finally { active--; }
  } });
  await client.create('阿晴');
  const sync = client.syncNow();
  await settle();
  const claim = client.claim('bench');
  await settle();
  assert.equal(calls.length, 2, 'claim waits for the ongoing publish');
  blocked.resolve();
  await Promise.all([sync, claim]);
  state = { x: 615, y: 553, exercise: { stationKey: 'bench', category: 'push', height: .7 } };
  await client.syncNow();
  assert.equal(calls.at(-1).body.state.exercise.category, 'push');
  await client.release();
  await client.syncNow();
  assert.equal(calls.at(-1).body.state.exercise, null, 'stale root animation cannot reclaim an apparatus');
  assert.equal(maxActive, 1);
  client.dispose();
});

test('temporary network failures reconnect without creating a duplicate membership', async () => {
  const clock = timers(), calls = [], statuses = [], errors = [];
  let failed = false;
  const client = new MultiplayerClient({ ...clock, storage: memoryStorage(), onStatus: v => statuses.push(v), onError: e => errors.push(e.code),
    fetch: async (url, options) => {
      calls.push(url);
      if (url === '/api/rooms') return json(joined());
      if (!failed) { failed = true; throw new TypeError('network unavailable'); }
      return json({ snapshot: snapshot(5) });
    },
  });
  await client.create('阿晴');
  await assert.rejects(client.syncNow(), { code: 'NETWORK' });
  assert.equal(client.status, 'reconnecting');
  assert.equal(client.session.playerId, 'p1');
  await client.syncNow();
  assert.equal(client.status, 'online');
  assert.deepEqual(statuses, ['connecting', 'online', 'reconnecting', 'online']);
  assert.deepEqual(errors, ['NETWORK']);
  assert.equal(calls.filter(v => v === '/api/rooms').length, 1);
  client.dispose();
});

test('automatic polling waits for each response and backs off before reconnecting', async () => {
  const clock = timers(), first = deferred(), failure = deferred(), recovered = deferred();
  let syncs = 0;
  const client = new MultiplayerClient({ ...clock, storage: memoryStorage(),
    onSnapshot: s => { if (s.serverTime === 2) first.resolve(); if (s.serverTime === 3) recovered.resolve(); },
    onError: () => failure.resolve(),
    fetch: async url => {
      if (url === '/api/rooms') return json(joined());
      syncs++;
      if (syncs === 2) throw new TypeError('temporarily disconnected');
      return json({ snapshot: snapshot(syncs === 1 ? 2 : 3) });
    },
  });
  await client.create('阿晴');
  clock.fire(250);
  await first.promise; await settle();
  assert.deepEqual(clock.delays(), [250]);
  clock.fire(250);
  await failure.promise; await settle();
  assert.deepEqual(clock.delays(), [500]);
  clock.fire(500);
  await recovered.promise; await settle();
  assert.deepEqual(clock.delays(), [250]);
  assert.equal(client.status, 'online');
  client.dispose();
});

test('expired heartbeat resumes by token and updates sequence without silently adding a player', async () => {
  const clock = timers(), calls = [];
  let expiry = true;
  const client = new MultiplayerClient({ ...clock, storage: memoryStorage(), fetch: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url === '/api/rooms') return json(joined());
    if (url.endsWith('/join')) return json(joined(30, 100));
    if (expiry) { expiry = false; return json({ error: 'SESSION_EXPIRED', message: '會籍暫時離線' }, 401); }
    return json({ snapshot: snapshot(31) });
  } });
  await client.create('阿晴');
  await client.syncNow();
  assert.equal(calls.at(-1).body.token, TOKEN);
  assert.ok(calls.at(-1).url.endsWith('/join'));
  await client.syncNow();
  assert.equal(calls.at(-1).body.seq, 101);
  assert.equal(client.session.playerId, 'p1');
  assert.equal(client.status, 'online');
  client.dispose();
});

test('invalid credentials stop retries and clear the stored identity', async () => {
  const storage = memoryStorage(), clock = timers(), errors = [];
  const client = new MultiplayerClient({ ...clock, storage, onError: e => errors.push(e.code), fetch: async url => json(
    url === '/api/rooms' ? joined() : { error: 'INVALID_TOKEN', message: '連線已失效' }, url === '/api/rooms' ? 200 : 401),
  });
  await client.create('阿晴');
  await assert.rejects(client.syncNow(), { code: 'INVALID_TOKEN' });
  assert.equal(client.session, null);
  assert.equal(client.status, 'offline');
  assert.equal(storage.getItem(KEY), null);
  assert.deepEqual(clock.delays(), []);
  assert.deepEqual(errors, ['INVALID_TOKEN']);
});

test('room capacity and apparatus conflicts surface to the caller without discarding a live membership', async () => {
  const clock = timers(), client = new MultiplayerClient({ ...clock, storage: memoryStorage(), fetch: async url => {
    if (url === '/api/rooms') return json(joined());
    return json({ error: 'STATION_BUSY', message: '有會員使用中' }, 409);
  } });
  await client.create('阿晴');
  await assert.rejects(client.claim('bench'), { code: 'STATION_BUSY' });
  assert.equal(client.status, 'online');
  assert.equal(client.session.playerId, 'p1');
  client.dispose();
  const full = new MultiplayerClient({ ...timers(), storage: memoryStorage(), fetch: async () => json({ error: 'ROOM_FULL', message: '房間已滿' }, 409) });
  await assert.rejects(full.join(CODE, '十三號'), { code: 'ROOM_FULL' });
  assert.equal(full.status, 'offline');
  assert.equal(full.session, null);
});

test('old snapshots and late responses after leave cannot restore departed players', async () => {
  const clock = timers(), pending = deferred(), seen = [], calls = [];
  const client = new MultiplayerClient({ ...clock, storage: memoryStorage(), onSnapshot: s => seen.push(s.serverTime), fetch: async (url, options) => {
    calls.push(url);
    if (url === '/api/rooms') return json(joined(10));
    if (url.endsWith('/leave')) return json({ ok: true });
    if (JSON.parse(options.body).seq === 1) return json({ snapshot: snapshot(2) });
    return pending.promise;
  } });
  await client.create('阿晴');
  await client.syncNow();
  assert.deepEqual(seen, [10]);
  const sync = client.syncNow();
  await settle();
  const leave = client.leave();
  pending.resolve(json({ snapshot: snapshot(20) }));
  await Promise.all([sync, leave]);
  assert.deepEqual(seen, [10]);
  assert.equal(client.session, null);
  assert.equal(client.status, 'offline');
  assert.ok(calls.at(-1).endsWith('/leave'));
});

test('request timeout aborts fetch, clears holds in the transport queue, and allows retry', async () => {
  const clock = timers();
  let blocked = true;
  const client = new MultiplayerClient({ ...clock, storage: memoryStorage(), requestTimeout: 1000, fetch: async (url, options) => {
    if (url === '/api/rooms') return json(joined());
    if (blocked) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    return json({ snapshot: snapshot(2) });
  } });
  await client.create('阿晴');
  const sync = client.syncNow();
  await settle();
  clock.fire(1000);
  await assert.rejects(sync, { code: 'TIMEOUT' });
  assert.equal(client.status, 'reconnecting');
  blocked = false;
  await client.syncNow();
  assert.equal(client.status, 'online');
  client.dispose();
});

test('broken or denied session storage cannot prevent joining and does not expose a token', async () => {
  const clock = timers(), storage = memoryStorage();
  storage.setItem(KEY, '{broken');
  const client = new MultiplayerClient({ ...clock, storage, fetch: async () => json(joined()) });
  assert.equal(await client.restore(), false);
  assert.equal(storage.getItem(KEY), null);
  await assert.rejects(client.join('not-a-code', '阿晴'), { code: 'INVALID_ROOM' });
  await client.join(' gym123 ', '阿晴');
  assert.equal(client.session.roomCode, CODE);
  client.dispose();
  const denied = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  const other = new MultiplayerClient({ ...timers(), storage: denied, fetch: async () => json(joined()) });
  assert.equal(await other.restore(), false);
  await other.create('會員');
  assert.equal(other.status, 'online');
  other.dispose();
});

test('two real transports exchange movement and a workout through the shared D1-shaped handler', async () => {
  const { createLocalDatabase } = await import('../multiplayer-server/local-db.mjs');
  const { handleMultiplayer } = await import('../multiplayer-server/handler.mjs');
  const db = createLocalDatabase();
  const bridge = (url, options) => handleMultiplayer(new Request(`http://localhost${url}`, options), db);
  let aState = { x: 1050, y: 592, dir: 0, moving: false, emote: '', exercise: null };
  const bState = { x: 1030, y: 592, dir: 0, moving: false, emote: '', exercise: null };
  const a = new MultiplayerClient({ ...timers(), storage: memoryStorage(), fetch: bridge, getState: () => aState });
  const b = new MultiplayerClient({ ...timers(), storage: memoryStorage(), fetch: bridge, getState: () => bState });
  try {
    await a.create('阿晴');
    const code = a.session.roomCode, aId = a.session.playerId;
    await b.join(code, '阿健');
    assert.equal(b.snapshot.players.length, 2);
    aState = { ...aState, x: 615, y: 553, dir: 1, moving: true };
    await a.syncNow(); await b.syncNow();
    assert.equal(b.snapshot.players.find(p => p.id === aId).x, 615);
    assert.equal(b.snapshot.players.find(p => p.id === aId).moving, true);
    await a.claim('bench');
    aState = { ...aState, moving: false, exercise: { stationKey: 'bench', category: 'push', time: 2, phase: 'charge', rep: 0, height: .7, extension: 0, depth: 0, balance: 0, sprint: false, paused: false } };
    await a.syncNow(); await b.syncNow();
    assert.equal(b.snapshot.players.find(p => p.id === aId).exercise.height, .7);
    await assert.rejects(b.claim('bench'), { code: 'STATION_BUSY' });
    await a.release();
    await a.syncNow(); // Local pose deliberately still exists; release must remain authoritative.
    await b.claim('bench');
    assert.equal(b.snapshot.players.find(p => p.id === aId).exercise, null);
    await a.leave(); await b.syncNow();
    assert.equal(b.snapshot.players.length, 1);
    await b.leave();
  } finally { a.dispose(); b.dispose(); db.close(); }
});
