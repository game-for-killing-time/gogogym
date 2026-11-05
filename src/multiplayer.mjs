const STORAGE_KEY = 'pixel-gym.room-session.v1';
const ROOM_CODE = /^[A-Z0-9]{6}$/;

export class MultiplayerError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'MultiplayerError';
    this.code = code;
    this.status = status;
  }
}

function browserStorage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

/** Shared-room transport. Tokens remain in this tab's session storage, never in URLs. */
export class MultiplayerClient {
  constructor({ onSnapshot = () => {}, onStatus = () => {}, onError = () => {},
    getState = () => ({}), fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
    storage = browserStorage(), setTimer = globalThis.setTimeout.bind(globalThis),
    clearTimer = globalThis.clearTimeout.bind(globalThis), pollInterval = 250,
    requestTimeout = 6000 } = {}) {
    this.onSnapshot = onSnapshot;
    this.onStatus = onStatus;
    this.onError = onError;
    this.getState = getState;
    this.fetch = fetchImpl;
    this.storage = storage;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.pollInterval = Math.max(200, pollInterval);
    this.requestTimeout = requestTimeout;
    this._session = null;
    this._snapshot = null;
    this._status = 'offline';
    this._seq = 0;
    this._name = '';
    this._reservation = null;
    this._epoch = 0;
    this._failures = 0;
    this._timer = null;
    this._controller = null;
    this._tail = Promise.resolve();
  }

  get session() { return this._session ? { ...this._session } : null; }
  get snapshot() { return this._snapshot; }
  get status() { return this._status; }

  async create(name) { return this._enter(null, name); }
  async join(roomCode, name) { return this._enter(String(roomCode).trim().toUpperCase(), name); }

  async restore() {
    if (this._session) return true;
    let saved;
    try { saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) || 'null'); } catch { this._forget(); return false; }
    if (!saved || !ROOM_CODE.test(saved.roomCode) || typeof saved.playerId !== 'string' ||
      typeof saved.token !== 'string' || saved.token.length < 16 || !Number.isSafeInteger(saved.seq) || saved.seq < 0) {
      if (saved) this._forget();
      return false;
    }
    await this._enter(saved.roomCode, saved.name || '新會員', saved);
    return true;
  }

  _enqueue(operation) {
    const result = this._tail.then(operation, operation);
    this._tail = result.catch(() => {});
    return result;
  }

  _setStatus(status) {
    if (status === this._status) return;
    this._status = status;
    this.onStatus(status);
  }

  _save() {
    if (!this._session) return;
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify({ ...this._session, seq: this._seq, name: this._name })); }
    catch { /* Browsers that deny storage can still join for this page's lifetime. */ }
  }

  _forget() { try { this.storage?.removeItem(STORAGE_KEY); } catch { /* Storage is optional. */ } }

  async _request(path, body, { keepalive = false } = {}) {
    const controller = new AbortController();
    this._controller = controller;
    let timedOut = false;
    const timer = this.setTimer(() => { timedOut = true; controller.abort(); }, this.requestTimeout);
    try {
      const response = await this.fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal, cache: 'no-store', keepalive,
      });
      let data;
      try { data = await response.json(); }
      catch { throw new MultiplayerError('BAD_RESPONSE', '未能讀取房間回應，請稍後再試。', response.status); }
      if (!response.ok) throw new MultiplayerError(data.error || data.code || 'REQUEST_FAILED', data.message || '房間未能完成這個操作。', response.status);
      return data;
    } catch (error) {
      if (error instanceof MultiplayerError) throw error;
      throw new MultiplayerError(timedOut ? 'TIMEOUT' : controller.signal.aborted ? 'CANCELLED' : 'NETWORK', timedOut ? '連線較慢，正在嘗試重新連接。' : '暫時連不到健身室，正在嘗試重新連接。');
    } finally {
      this.clearTimer(timer);
      if (this._controller === controller) this._controller = null;
    }
  }

  _acceptSnapshot(snapshot, epoch) {
    if (epoch !== this._epoch || !this._session || snapshot?.roomCode !== this._session.roomCode ||
      !Array.isArray(snapshot.players) || !Number.isFinite(snapshot.serverTime)) return false;
    if (this._snapshot && snapshot.serverTime < this._snapshot.serverTime) return false;
    this._snapshot = snapshot;
    this.onSnapshot(snapshot);
    return true;
  }

  _adopt(data, epoch) {
    if (epoch !== this._epoch) return false;
    if (!ROOM_CODE.test(data.roomCode) || typeof data.playerId !== 'string' || typeof data.token !== 'string' || !data.snapshot) {
      throw new MultiplayerError('BAD_RESPONSE', '房間回應不完整，請再試一次。');
    }
    this._session = { roomCode: data.roomCode, playerId: data.playerId, token: data.token };
    this._seq = Math.max(this._seq, Number.isSafeInteger(data.seq) ? data.seq : 0);
    this._reservation = data.snapshot.players?.find(p => p.id === data.playerId)?.exercise?.stationKey || null;
    this._failures = 0;
    this._save();
    this._acceptSnapshot(data.snapshot, epoch);
    this._setStatus('online');
    return true;
  }

  async _enter(roomCode, name, saved = null) {
    if (roomCode !== null && !ROOM_CODE.test(roomCode)) throw new MultiplayerError('INVALID_ROOM', '請輸入六位房間碼。');
    return this._enqueue(async () => {
      if (this._session) throw new MultiplayerError('ALREADY_JOINED', '請先離開目前的房間。');
      const epoch = ++this._epoch;
      this._name = String(name || '').trim();
      this._seq = saved?.seq || 0;
      this._snapshot = null;
      this._setStatus('connecting');
      try {
        const body = { name: this._name };
        if (saved) body.token = saved.token;
        const data = await this._request(roomCode ? `/api/rooms/${roomCode}/join` : '/api/rooms', body);
        if (!this._adopt(data, epoch)) return null;
        this._schedule();
        return this._snapshot;
      } catch (error) {
        if (epoch === this._epoch) {
          this._setStatus('offline');
          // Preserve resume credentials during a network outage, not after an invalid session.
          if (this._terminal(error)) this._forget();
          this.onError(error);
        }
        throw error;
      }
    });
  }

  _schedule(delay = this.pollInterval) {
    if (this._timer !== null) this.clearTimer(this._timer);
    if (!this._session) return;
    const epoch = this._epoch;
    this._timer = this.setTimer(() => {
      this._timer = null;
      if (epoch !== this._epoch) return;
      this.syncNow().catch(() => {}).finally(() => {
        if (epoch === this._epoch && this._session) this._schedule(Math.min(4000, this.pollInterval * 2 ** Math.min(this._failures, 4)));
      });
    }, delay);
  }

  _terminal(error) { return ['INVALID_TOKEN', 'ROOM_NOT_FOUND', 'UNAUTHORIZED'].includes(error.code) || [401, 403, 404].includes(error.status); }

  _failed(error, epoch) {
    if (epoch !== this._epoch) return;
    if (this._terminal(error) && error.code !== 'SESSION_EXPIRED') {
      this._reset(true);
      this.onError(error);
      return;
    }
    this._failures++;
    this._setStatus('reconnecting');
    if (this._failures === 1) this.onError(error);
  }

  /** Immediate publish for an emote or phase transition; the regular loop also runs. */
  syncNow() {
    const epoch = this._epoch;
    return this._enqueue(async () => {
      if (epoch !== this._epoch || !this._session) return null;
      const session = this._session;
      try {
        const state = { ...this.getState() };
        // A late animation frame after release cannot recreate a server reservation.
        if (!this._reservation || state.exercise?.stationKey !== this._reservation) state.exercise = null;
        const seq = ++this._seq;
        this._save();
        const data = await this._request(`/api/rooms/${session.roomCode}/sync`, { token: session.token, seq, state });
        if (epoch !== this._epoch) return null;
        this._acceptSnapshot(data.snapshot, epoch);
        this._failures = 0;
        this._setStatus('online');
        return this._snapshot;
      } catch (error) {
        if (epoch !== this._epoch) return null;
        if (error.code === 'SESSION_EXPIRED') {
          this._setStatus('reconnecting');
          try {
            const data = await this._request(`/api/rooms/${session.roomCode}/join`, { name: this._name, token: session.token });
            if (this._adopt(data, epoch)) return this._snapshot;
            return null;
          } catch (resumeError) { this._failed(resumeError, epoch); throw resumeError; }
        }
        this._failed(error, epoch);
        throw error;
      }
    });
  }

  async claim(stationKey) { return this._exercise(stationKey); }
  async release() { return this._exercise(null); }

  _exercise(stationKey) {
    const epoch = this._epoch;
    return this._enqueue(async () => {
      if (epoch !== this._epoch || !this._session) throw new MultiplayerError('NOT_CONNECTED', '請先連接健身室。');
      const session = this._session;
      try {
        const data = await this._request(`/api/rooms/${session.roomCode}/exercise`, { token: session.token, stationKey });
        if (epoch !== this._epoch) return null;
        this._reservation = stationKey;
        this._acceptSnapshot(data.snapshot, epoch);
        this._failures = 0;
        this._setStatus('online');
        return this._snapshot;
      } catch (error) {
        if (error.code === 'SESSION_EXPIRED' || this._terminal(error) || !error.status || error.status >= 500) this._failed(error, epoch);
        throw error;
      }
    });
  }

  _reset(forget) {
    ++this._epoch;
    if (this._timer !== null) this.clearTimer(this._timer);
    this._timer = null;
    this._controller?.abort();
    this._session = null;
    this._snapshot = null;
    this._reservation = null;
    this._failures = 0;
    if (forget) this._forget();
    this._setStatus('offline');
  }

  async leave() {
    const session = this._session;
    this._reset(true);
    if (!session) return;
    // Leave waits behind any aborted publish so it is the last mutation for this membership.
    return this._enqueue(async () => {
      try { await this._request(`/api/rooms/${session.roomCode}/leave`, { token: session.token }, { keepalive: true }); }
      catch { /* The server expires abandoned memberships after its heartbeat window. */ }
    });
  }

  /** Stop this instance without logging out; suitable for page teardown and tests. */
  dispose() { this._reset(false); }
}
