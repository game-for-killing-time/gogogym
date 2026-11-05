CREATE TABLE IF NOT EXISTS gym_accounts (
 uid TEXT PRIMARY KEY, name TEXT NOT NULL, accent TEXT NOT NULL,
 progress TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gym_training_sessions (
 id TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES gym_accounts(uid),
 category TEXT NOT NULL, started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 result TEXT
);
CREATE INDEX IF NOT EXISTS gym_training_owner ON gym_training_sessions(uid, expires_at);
