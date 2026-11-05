CREATE TABLE gym_rooms (
  code TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE gym_players (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL REFERENCES gym_rooms(code) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 1050,
  y REAL NOT NULL DEFAULT 592,
  dir INTEGER NOT NULL DEFAULT 0,
  moving INTEGER NOT NULL DEFAULT 0,
  station_key TEXT,
  exercise_json TEXT,
  emote TEXT NOT NULL DEFAULT '',
  emote_until INTEGER NOT NULL DEFAULT 0,
  emote_input TEXT NOT NULL DEFAULT '',
  seq INTEGER NOT NULL DEFAULT -1,
  seen_at INTEGER NOT NULL,
  joined_at INTEGER NOT NULL
);
CREATE INDEX gym_players_room_active ON gym_players(room_code, seen_at);
CREATE INDEX gym_players_room_station ON gym_players(room_code, station_key, seen_at);
